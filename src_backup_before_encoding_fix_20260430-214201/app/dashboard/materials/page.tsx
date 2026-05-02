"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TeacherAuthGuard } from "../../../components/teacher-auth-guard";
import { getDemoSession } from "../../../lib/auth-storage";
import { loadTeacherClassListsByOwner, type TeacherClassList } from "../../../lib/class-lists";
import {
  createLearningMaterialId,
  deleteLearningMaterial,
  getMaterialCategoryLabel,
  loadLearningMaterialsByTeacher,
  MATERIAL_CATEGORY_OPTIONS,
  upsertLearningMaterial,
  type LearningMaterial,
  type MaterialAttachment,
  type MaterialCategory
} from "../../../lib/learning-materials";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

type CourseFolder = {
  code: string;
  name: string;
  key: string;
};

type GroupedCategory = {
  category: MaterialCategory;
  label: string;
  materials: LearningMaterial[];
};

type GroupedCourse = {
  folder: CourseFolder;
  categories: GroupedCategory[];
  totalMaterials: number;
};

type MaterialEditDraft = {
  title: string;
  description: string;
};

type CourseEditDraft = {
  code: string;
  name: string;
  classIds: string[];
};

function collectCourseClassIds(course: GroupedCourse) {
  const classIdSet = new Set<string>();
  course.categories.forEach((categoryItem) => {
    categoryItem.materials.forEach((material) => {
      material.assignedClassListIds.forEach((classId) => classIdSet.add(classId));
    });
  });
  return Array.from(classIdSet);
}

function formatTimeLabel(timestamp: number) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(timestamp);
  } catch {
    return "";
  }
}

function folderLabel(code: string, name?: string) {
  const cleanCode = String(code || "").trim().toUpperCase();
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    return cleanCode;
  }
  return `${cleanCode} - ${cleanName}`;
}

function fileNameToTitle(name: string) {
  const clean = String(name || "").trim();
  const dotIndex = clean.lastIndexOf(".");
  if (dotIndex <= 0) {
    return clean;
  }
  return clean.slice(0, dotIndex).trim();
}

function buildSubfolderKey(courseKey: string, category: MaterialCategory) {
  return `${courseKey}::${category}`;
}

function getMaterialFiles(material: LearningMaterial) {
  if (material.attachments && material.attachments.length > 0) {
    return material.attachments;
  }
  return material.attachment ? [material.attachment] : [];
}

function canPreviewFile(file: MaterialAttachment) {
  return (
    file.type.startsWith("image/") ||
    file.type.includes("pdf") ||
    file.type.startsWith("text/") ||
    file.type.includes("json")
  );
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Không thể đọc file."));
    reader.readAsDataURL(file);
  });
}

export default function MaterialsPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [classLists, setClassLists] = useState<TeacherClassList[]>([]);
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);

  const [searchCourseCode, setSearchCourseCode] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);

  const [courseMode, setCourseMode] = useState<"existing" | "new">("existing");
  const [selectedCourseKey, setSelectedCourseKey] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [category, setCategory] = useState<MaterialCategory>("book");
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);

  const [singleTitle, setSingleTitle] = useState("");
  const [singleContent, setSingleContent] = useState("");
  const [singleExternalUrl, setSingleExternalUrl] = useState("");
  const [singleFile, setSingleFile] = useState<MaterialAttachment | null>(null);

  const [bulkFiles, setBulkFiles] = useState<MaterialAttachment[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  const [activeCourseKey, setActiveCourseKey] = useState("");
  const [expandedSubfolderKeys, setExpandedSubfolderKeys] = useState<string[]>([]);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const [materialEditDrafts, setMaterialEditDrafts] = useState<Record<string, MaterialEditDraft>>(
    {}
  );
  const [materialEditFiles, setMaterialEditFiles] = useState<Record<string, MaterialAttachment[]>>({});
  const [courseEditDraft, setCourseEditDraft] = useState<CourseEditDraft | null>(null);

  const [previewFile, setPreviewFile] = useState<MaterialAttachment | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const isUploadPage = pathname === "/files/upload";

  const refreshData = (ownerEmail: string) => {
    if (!ownerEmail) {
      setClassLists([]);
      setMaterials([]);
      return;
    }
    setClassLists(loadTeacherClassListsByOwner(ownerEmail));
    setMaterials(loadLearningMaterialsByTeacher(ownerEmail));
  };

  useEffect(() => {
    const session = getDemoSession();
    const email = session?.role === "teacher" ? session.email : "";
    const name = session?.role === "teacher" ? session.name || "" : "";
    setTeacherEmail(email);
    setTeacherName(name);
    refreshData(email);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!teacherEmail) {
      return;
    }
    const onStorage = () => refreshData(teacherEmail);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [teacherEmail]);

  useEffect(() => {
    if (pathname === "/files/upload") {
      setShowAddPanel(true);
    }
  }, [pathname]);

  const courseFolders = useMemo(() => {
    const map = new Map<string, CourseFolder>();

    materials.forEach((material) => {
      const code = material.courseCode.trim().toUpperCase();
      if (!code) {
        return;
      }
      const existing = map.get(code);
      if (!existing) {
        map.set(code, {
          code,
          name: material.courseName || "",
          key: code
        });
        return;
      }
      if (!existing.name && material.courseName) {
        existing.name = material.courseName;
      }
    });

    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [materials]);

  useEffect(() => {
    if (courseMode !== "existing") {
      return;
    }

    if (!selectedCourseKey && courseFolders.length > 0) {
      setSelectedCourseKey(courseFolders[0].key);
      return;
    }

    if (selectedCourseKey && !courseFolders.some((folder) => folder.key === selectedCourseKey)) {
      setSelectedCourseKey(courseFolders[0]?.key || "");
    }
  }, [courseFolders, courseMode, selectedCourseKey]);

  const currentFolder = useMemo(() => {
    if (courseMode === "new") {
      return {
        code: newCourseCode.trim().toUpperCase(),
        name: newCourseName.trim()
      };
    }

    const folder = courseFolders.find((item) => item.key === selectedCourseKey);
    return {
      code: folder?.code || "",
      name: folder?.name || ""
    };
  }, [courseFolders, courseMode, selectedCourseKey, newCourseCode, newCourseName]);

  const filteredMaterials = useMemo(() => {
    const query = searchCourseCode.trim().toUpperCase();
    if (!query) {
      return materials;
    }
    return materials.filter((material) =>
      material.courseCode.trim().toUpperCase().includes(query)
    );
  }, [materials, searchCourseCode]);

  const groupedLibrary = useMemo<GroupedCourse[]>(() => {
    const courseMap = new Map<
      string,
      {
        folder: CourseFolder;
        categoryMap: Map<MaterialCategory, LearningMaterial[]>;
      }
    >();

    filteredMaterials.forEach((material) => {
      const code = material.courseCode.trim().toUpperCase();
      if (!code) {
        return;
      }

      if (!courseMap.has(code)) {
        courseMap.set(code, {
          folder: {
            code,
            name: material.courseName || "",
            key: code
          },
          categoryMap: new Map()
        });
      }

      const courseBucket = courseMap.get(code);
      if (!courseBucket) {
        return;
      }

      if (!courseBucket.folder.name && material.courseName) {
        courseBucket.folder.name = material.courseName;
      }

      const currentItems = courseBucket.categoryMap.get(material.category) || [];
      courseBucket.categoryMap.set(material.category, [...currentItems, material]);
    });

    const categoryOrder = new Map(
      MATERIAL_CATEGORY_OPTIONS.map((option, index) => [option.value, index])
    );

    return Array.from(courseMap.values())
      .sort((a, b) => a.folder.code.localeCompare(b.folder.code))
      .map((item) => {
        const categories = Array.from(item.categoryMap.entries())
          .map(([categoryValue, categoryMaterials]) => ({
            category: categoryValue,
            label: getMaterialCategoryLabel(categoryValue),
            materials: categoryMaterials.sort((a, b) => b.updatedAt - a.updatedAt)
          }))
          .sort(
            (a, b) =>
              (categoryOrder.get(a.category) ?? 999) - (categoryOrder.get(b.category) ?? 999)
          );

        const totalMaterials = categories.reduce((sum, categoryItem) => {
          return sum + categoryItem.materials.length;
        }, 0);

        return {
          folder: item.folder,
          categories,
          totalMaterials
        };
      });
  }, [filteredMaterials]);

  const activeCourse = useMemo(() => {
    if (!activeCourseKey) {
      return null;
    }
    return groupedLibrary.find((course) => course.folder.key === activeCourseKey) || null;
  }, [groupedLibrary, activeCourseKey]);

  const activeCourseMaterials = useMemo(() => {
    if (!activeCourse) {
      return [] as LearningMaterial[];
    }
    return activeCourse.categories.flatMap((categoryItem) => categoryItem.materials);
  }, [activeCourse]);

  const activeCourseClassIds = useMemo(() => {
    if (!activeCourse) {
      return [] as string[];
    }
    return collectCourseClassIds(activeCourse);
  }, [activeCourse]);

  useEffect(() => {
    const validCourses = new Set(groupedLibrary.map((course) => course.folder.key));
    if (activeCourseKey && !validCourses.has(activeCourseKey)) {
      setActiveCourseKey("");
    }

    const validSubfolders = new Set(
      groupedLibrary.flatMap((course) =>
        course.categories.map((categoryItem) =>
          buildSubfolderKey(course.folder.key, categoryItem.category)
        )
      )
    );
    setExpandedSubfolderKeys((prev) => prev.filter((key) => validSubfolders.has(key)));
  }, [groupedLibrary, activeCourseKey]);

  useEffect(() => {
    setCourseEditDraft(null);
  }, [activeCourseKey]);

  const toggleClassId = (classId: string) => {
    setAssignedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const toggleCourse = (courseKey: string) => {
    setActiveCourseKey((prev) => (prev === courseKey ? "" : courseKey));
  };

  const toggleSubfolder = (courseKey: string, categoryValue: MaterialCategory) => {
    const key = buildSubfolderKey(courseKey, categoryValue);
    setExpandedSubfolderKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const resolveFolderOrWarn = () => {
    const code = currentFolder.code.trim().toUpperCase();
    const name = currentFolder.name.trim();
    if (!code) {
      setStatusMessage("Vui lòng chọn mã môn có sẵn hoặc nhập mã môn mới.");
      return null;
    }
    if (courseMode === "new" && !name) {
      setStatusMessage("Vui lòng nhập tên môn khi tạo folder môn mới.");
      return null;
    }
    return { code, name };
  };

  const validateBaseBeforeSave = () => {
    if (!teacherEmail) {
      setStatusMessage("Không xác định được tài khoản Giảng viên.");
      return false;
    }
    if (assignedClassIds.length === 0) {
      setStatusMessage("Vui lòng chọn ít nhất 1 lớp áp dụng.");
      return false;
    }
    return true;
  };

  const onSelectSingleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setStatusMessage("File vượt quá 5MB. Vui lòng chọn file nhỏ hơn.");
      event.target.value = "";
      return;
    }

    try {
      setIsProcessingFiles(true);
      const dataUrl = await readFileAsDataUrl(file);
      setSingleFile({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl
      });
      if (!singleTitle.trim()) {
        setSingleTitle(fileNameToTitle(file.name));
      }
      setStatusMessage(`Đã chọn file "${file.name}".`);
    } catch {
      setStatusMessage("Không thể đọc file. Vui lòng thử lại.");
    } finally {
      setIsProcessingFiles(false);
      event.target.value = "";
    }
  };

  const onSelectBulkFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) {
      return;
    }

    try {
      setIsProcessingFiles(true);
      const next: MaterialAttachment[] = [];
      let skipped = 0;

      for (const file of selectedFiles) {
        if (file.size > MAX_ATTACHMENT_SIZE) {
          skipped += 1;
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        next.push({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl
        });
      }

      setBulkFiles(next);
      if (skipped > 0) {
        setStatusMessage(`Đã chọn ${next.length} file, bỏ qua ${skipped} file vượt quá 5MB.`);
      } else {
        setStatusMessage(`Đã chọn ${next.length} file để tải lên hàng loạt.`);
      }
    } catch {
      setStatusMessage("Không thể đọc file. Vui lòng thử lại.");
    } finally {
      setIsProcessingFiles(false);
      event.target.value = "";
    }
  };

  const handleSaveSingle = () => {
    if (!validateBaseBeforeSave()) {
      return;
    }
    const folder = resolveFolderOrWarn();
    if (!folder) {
      return;
    }

    const title = singleTitle.trim();
    if (!title) {
      setStatusMessage("Vui lòng nhập tên tài liệu.");
      return;
    }
    if (!singleFile && !singleExternalUrl.trim()) {
      setStatusMessage("Vui lòng tải file hoặc nhập đường dẫn tài liệu.");
      return;
    }

    const now = Date.now();
    const nextMaterial: LearningMaterial = {
      id: createLearningMaterialId(),
      ownerTeacherEmail: teacherEmail,
      ownerTeacherName: teacherName || teacherEmail.split("@")[0],
      courseCode: folder.code,
      courseName: folder.name,
      title,
      description: singleContent.trim(),
      category,
      assignedClassListIds: [...assignedClassIds],
      externalUrl: singleExternalUrl.trim(),
      attachments: singleFile ? [singleFile] : [],
      createdAt: now,
      updatedAt: now
    };

    const saved = upsertLearningMaterial(nextMaterial);
    if (!saved) {
      setStatusMessage("Không thể lưu tài liệu. Vui lòng thử lại.");
      return;
    }

    setSingleTitle("");
    setSingleContent("");
    setSingleExternalUrl("");
    setSingleFile(null);
    refreshData(teacherEmail);
    setActiveCourseKey(folder.code);
    setExpandedSubfolderKeys((prev) => {
      const key = buildSubfolderKey(folder.code, category);
      return prev.includes(key) ? prev : [...prev, key];
    });
    setStatusMessage("Đã tải lên 1 file thành công.");
  };

  const handleSaveBulk = () => {
    if (!validateBaseBeforeSave()) {
      return;
    }
    const folder = resolveFolderOrWarn();
    if (!folder) {
      return;
    }
    if (bulkFiles.length === 0) {
      setStatusMessage("Vui lòng chọn file để tải lên hàng loạt.");
      return;
    }

    const now = Date.now();
    const nextMaterials = bulkFiles.map((file, index) => ({
      id: createLearningMaterialId(),
      ownerTeacherEmail: teacherEmail,
      ownerTeacherName: teacherName || teacherEmail.split("@")[0],
      courseCode: folder.code,
      courseName: folder.name,
      title: fileNameToTitle(file.name) || `Tài liệu ${index + 1}`,
      description: singleContent.trim(),
      category,
      assignedClassListIds: [...assignedClassIds],
      externalUrl: "",
      attachments: [file],
      createdAt: now + index,
      updatedAt: now + index
    })) as LearningMaterial[];

    nextMaterials.forEach((material) => {
      upsertLearningMaterial(material);
    });

    setBulkFiles([]);
    refreshData(teacherEmail);
    setActiveCourseKey(folder.code);
    setExpandedSubfolderKeys((prev) => {
      const key = buildSubfolderKey(folder.code, category);
      return prev.includes(key) ? prev : [...prev, key];
    });
    setStatusMessage(
      `Đã tải lên ${nextMaterials.length} tài liệu vào ${folderLabel(folder.code, folder.name)} / ${getMaterialCategoryLabel(category)}.`
    );
  };

  const startEditMaterial = (material: LearningMaterial) => {
    setMaterialEditDrafts((prev) => ({
      ...prev,
      [material.id]: {
        title: material.title,
        description: material.description || ""
      }
    }));
    setMaterialEditFiles((prev) => ({
      ...prev,
      [material.id]: [...getMaterialFiles(material)]
    }));
  };

  const cancelEditMaterial = (materialId: string) => {
    setMaterialEditDrafts((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
    setMaterialEditFiles((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
  };

  const onSelectEditFiles = async (materialId: string, event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) {
      return;
    }

    try {
      setIsProcessingFiles(true);
      const nextFiles: MaterialAttachment[] = [];
      let skipped = 0;
      for (const file of selectedFiles) {
        if (file.size > MAX_ATTACHMENT_SIZE) {
          skipped += 1;
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        nextFiles.push({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl
        });
      }
      if (nextFiles.length > 0) {
        setMaterialEditFiles((prev) => ({
          ...prev,
          [materialId]: [...(prev[materialId] || []), ...nextFiles]
        }));
      }
      if (skipped > 0) {
        setStatusMessage(`Đã thêm ${nextFiles.length} file, bỏ qua ${skipped} file vượt quá 5MB.`);
      } else {
        setStatusMessage(`Đã thêm ${nextFiles.length} file vào tài liệu.`);
      }
    } catch {
      setStatusMessage("Không thể đọc file bổ sung.");
    } finally {
      setIsProcessingFiles(false);
      event.target.value = "";
    }
  };

  const removeEditFile = (materialId: string, fileIndex: number) => {
    setMaterialEditFiles((prev) => ({
      ...prev,
      [materialId]: (prev[materialId] || []).filter((_, index) => index !== fileIndex)
    }));
  };

  const saveEditMaterial = (material: LearningMaterial) => {
    const draft = materialEditDrafts[material.id];
    const nextAttachments = materialEditFiles[material.id] || [];
    const nextTitle = String(draft?.title || "").trim();
    const nextDescription = String(draft?.description || "").trim();
    if (!nextTitle) {
      setStatusMessage("Tên tài liệu không được để trống.");
      return;
    }

    if (
      nextTitle === material.title.trim() &&
      nextDescription === String(material.description || "").trim() &&
      JSON.stringify(nextAttachments) === JSON.stringify(getMaterialFiles(material))
    ) {
      cancelEditMaterial(material.id);
      return;
    }

    const updated: LearningMaterial = {
      ...material,
      title: nextTitle,
      description: nextDescription,
      attachments: nextAttachments,
      updatedAt: Date.now()
    };
    upsertLearningMaterial(updated);
    cancelEditMaterial(material.id);
    refreshData(teacherEmail);
    setStatusMessage("Đã cập nhật tài liệu.");
  };

  const startEditCourseByKey = (courseKey: string) => {
    const courseTarget = groupedLibrary.find((course) => course.folder.key === courseKey);
    if (!courseTarget) {
      return;
    }
    setActiveCourseKey(courseKey);
    const classIds = collectCourseClassIds(courseTarget);
    setCourseEditDraft({
      code: courseTarget.folder.code,
      name: courseTarget.folder.name || "",
      classIds
    });
  };

  const startEditCourse = () => {
    if (!activeCourse) {
      return;
    }
    startEditCourseByKey(activeCourse.folder.key);
  };

  const toggleCourseDraftClassId = (classId: string) => {
    setCourseEditDraft((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        classIds: prev.classIds.includes(classId)
          ? prev.classIds.filter((id) => id !== classId)
          : [...prev.classIds, classId]
      };
    });
  };

  const saveEditCourse = () => {
    if (!activeCourse || !courseEditDraft) {
      return;
    }

    const nextCode = courseEditDraft.code.trim().toUpperCase();
    const nextName = courseEditDraft.name.trim();
    if (!nextCode) {
      setStatusMessage("Mã môn không được để trống.");
      return;
    }

    const now = Date.now();
    activeCourseMaterials.forEach((material, index) => {
      const updated: LearningMaterial = {
        ...material,
        courseCode: nextCode,
        courseName: nextName,
        assignedClassListIds: [...courseEditDraft.classIds],
        updatedAt: now + index
      };
      upsertLearningMaterial(updated);
    });

    refreshData(teacherEmail);
    setActiveCourseKey(nextCode);
    setExpandedSubfolderKeys([]);
    setCourseEditDraft(null);
    setStatusMessage("Đã cập nhật folder môn học.");
  };

  const toggleBulkDeleteId = (materialId: string) => {
    setSelectedDeleteIds((prev) =>
      prev.includes(materialId) ? prev.filter((id) => id !== materialId) : [...prev, materialId]
    );
  };

  const areAllSelected = (materialIds: string[]) => {
    if (materialIds.length === 0) {
      return false;
    }
    return materialIds.every((id) => selectedDeleteIds.includes(id));
  };

  const toggleSelectAllInSubfolder = (materialIds: string[], checked: boolean) => {
    if (checked) {
      setSelectedDeleteIds((prev) => {
        const merged = new Set([...prev, ...materialIds]);
        return Array.from(merged);
      });
      return;
    }
    setSelectedDeleteIds((prev) => prev.filter((id) => !materialIds.includes(id)));
  };

  const handleDeleteSelected = (materialIds: string[]) => {
    const targetIds = materialIds.filter((id) => selectedDeleteIds.includes(id));
    if (targetIds.length === 0) {
      setStatusMessage("Vui lòng chọn tài liệu cần xóa hàng loạt.");
      return;
    }

    const confirmed = window.confirm(`Xóa ${targetIds.length} tài li�!u �ã chọn?`);
    if (!confirmed) {
      return;
    }

    targetIds.forEach((id) => deleteLearningMaterial(id));
    setSelectedDeleteIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    refreshData(teacherEmail);
    setStatusMessage(`Đã xóa ${targetIds.length} tài liệu.`);
  };

  const handleDeleteSingle = (materialId: string) => {
    const confirmed = window.confirm("Bạn có chắc mu�n xóa tài li�!u này?");
    if (!confirmed) {
      return;
    }
    deleteLearningMaterial(materialId);
    setSelectedDeleteIds((prev) => prev.filter((id) => id !== materialId));
    refreshData(teacherEmail);
    setStatusMessage("Đã xóa tài liệu.");
  };

  const openPreview = (file: MaterialAttachment, title: string) => {
    setPreviewFile(file);
    setPreviewTitle(title);
  };

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewTitle("");
  };

  if (!isHydrated) {
    return (
      <TeacherAuthGuard>
        <main className="section-page">
          <div className="site-shell">
            <article className="content-card">
              <h2>Đang tải tài liệu học...</h2>
            </article>
          </div>
        </main>
      </TeacherAuthGuard>
    );
  }

  return (
    <TeacherAuthGuard>
      <main className={isUploadPage ? "section-page materials-upload-only" : "section-page"}>
        <div className="site-shell group-shell">
          <div className="section-head section-head-single">
            <div>
              <span className="section-eyebrow">TÀI LIỆU</span>
              <h1 className="group-manage-page-title">Quản lý kho tài liệu theo folder môn học</h1>
            </div>
            <p>
              Kho t�i liệu được sắp xếp theo folder lớn <strong>[M� m�n] - [T�n m�n]</strong>, b�n trong l� c�c
              folder con theo loại tài liệu.
            </p>
          </div>

          <section className="materials-toolbar-inline">
            <div className="materials-toolbar">
              <label className="field materials-search-field">
                <span>Tìm theo mã môn</span>
                <input
                  className="text-input"
                  value={searchCourseCode}
                  onChange={(event) => setSearchCourseCode(event.target.value)}
                  placeholder="Nhập mã môn..."
                />
              </label>
              <button
                type="button"
                className="hero-primary materials-add-toggle"
                onClick={() => router.push("/files/upload")}
              >
                Thêm tài liệu
              </button>
            </div>
            {statusMessage ? <p className="group-status-note">{statusMessage}</p> : null}
          </section>

          {groupedLibrary.length === 0 ? (
            <section className="content-card">
              <p>Chưa có tài liệu nào trong kho theo mã môn đang tìm.</p>
            </section>
          ) : (
            <>
              <section className="materials-course-grid">
                {groupedLibrary.map((courseBlock) => (
                  <article
                    key={courseBlock.folder.key}
                    className={
                      activeCourseKey === courseBlock.folder.key
                        ? "materials-course-tile active"
                        : "materials-course-tile"
                    }
                  >
                    <div className="materials-course-tile-main">
                      <button
                      type="button"
                      className="materials-course-toggle"
                      onClick={() => toggleCourse(courseBlock.folder.key)}
                    >
                      <div>
                        <h3>{folderLabel(courseBlock.folder.code, courseBlock.folder.name)}</h3>
                        <p>
                          {courseBlock.categories.length} folder con · {courseBlock.totalMaterials} tài liệu
                        </p>
                      </div>                      </button>
                      <button
                        type="button"
                        className="materials-text-action materials-course-edit"
                        aria-label="Sửa"
                        onClick={() => startEditCourseByKey(courseBlock.folder.key)}
                      >
                        Sửa
                      </button>
                    </div>
                  </article>
                ))}
              </section>

              {activeCourse ? (
                <section className="content-card materials-course-detail">
                  <div className="materials-course-detail-head">
                    <div className="materials-course-detail-title">
                      <h2>{folderLabel(activeCourse.folder.code, activeCourse.folder.name)}</h2>
                      <div className="materials-class-tags">
                        {activeCourseClassIds.map((classId) => {
                          const className =
                            classLists.find((item) => item.id === classId)?.className || "L�:p �ã xóa";
                          return (
                            <span key={`course-${classId}`} className="materials-class-tag">
                              {className}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="materials-course-detail-actions">
                      <button type="button" className="hero-secondary" onClick={startEditCourse}>
                        Sửa folder
                      </button>
                      <button
                        type="button"
                        className="hero-secondary"
                        onClick={() => setActiveCourseKey("")}
                      >
                        Thu gọn
                      </button>
                    </div>
                  </div>

                  {courseEditDraft ? (
                    <div className="materials-course-edit-card">
                      <div className="materials-form-grid">
                        <label className="field">
                          <span>Mã môn</span>
                          <input
                            className="text-input"
                            value={courseEditDraft.code}
                            onChange={(event) =>
                              setCourseEditDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      code: event.target.value
                                    }
                                  : prev
                              )
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Tên môn</span>
                          <input
                            className="text-input"
                            value={courseEditDraft.name}
                            onChange={(event) =>
                              setCourseEditDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      name: event.target.value
                                    }
                                  : prev
                              )
                            }
                          />
                        </label>
                      </div>

                      <div className="field">
                        <span>Lớp được phân môn</span>
                        <div className="materials-class-selector">
                          {classLists.map((classList) => (
                            <label key={`course-edit-${classList.id}`} className="materials-class-option">
                              <input
                                type="checkbox"
                                checked={courseEditDraft.classIds.includes(classList.id)}
                                onChange={() => toggleCourseDraftClassId(classList.id)}
                              />
                              <span>
                                {classList.className} ({classList.students.length} SV)
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="group-card-actions">
                        <button type="button" className="hero-primary" onClick={saveEditCourse}>
                          Lưu folder
                        </button>
                        <button
                          type="button"
                          className="hero-secondary"
                          onClick={() => setCourseEditDraft(null)}
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="materials-subfolder-list">
                    {activeCourse.categories.map((categoryBlock) => {
                      const subfolderKey = buildSubfolderKey(
                        activeCourse.folder.key,
                        categoryBlock.category
                      );
                      const isSubfolderExpanded = expandedSubfolderKeys.includes(subfolderKey);
                      const materialIds = categoryBlock.materials.map((item) => item.id);
                      const allSelected = areAllSelected(materialIds);

                      return (
                        <section key={subfolderKey} className="materials-subfolder-card">
                          <button
                            type="button"
                            className="materials-subfolder-toggle"
                            onClick={() =>
                              toggleSubfolder(activeCourse.folder.key, categoryBlock.category)
                            }
                          >
                            <strong>{categoryBlock.label}</strong>
                            <span>
                              {categoryBlock.materials.length} file ·{" "}
                              {isSubfolderExpanded ? "Thu gọn" : "M�x"}
                            </span>
                          </button>

                          {isSubfolderExpanded ? (
                            <>
                              <div className="materials-folder-actions">
                                <label className="materials-select-all">
                                  <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={(event) =>
                                      toggleSelectAllInSubfolder(materialIds, event.target.checked)
                                    }
                                  />
                                  <span>Chọn tất cả</span>
                                </label>
                                <button
                                  type="button"
                                  className="materials-danger-text"
                                  onClick={() => handleDeleteSelected(materialIds)}
                                >
                                  Xóa đã chọn
                                </button>
                              </div>

                              <div className="materials-item-list">
                                {categoryBlock.materials.map((material) => {
                                  const files = getMaterialFiles(material);
                                  const isEditing = Object.prototype.hasOwnProperty.call(
                                    materialEditDrafts,
                                    material.id
                                  );
                                  const draft = materialEditDrafts[material.id];

                                  return (
                                    <article key={material.id} className="materials-item-row">
                                      <div className="materials-item-head">
                                        <label className="materials-check-inline">
                                          <input
                                            type="checkbox"
                                            checked={selectedDeleteIds.includes(material.id)}
                                            onChange={() => toggleBulkDeleteId(material.id)}
                                          />
                                          <span>Chọn</span>
                                        </label>
                                        <p className="hint-copy">
                                          Cập nhật: {formatTimeLabel(material.updatedAt)}
                                        </p>
                                      </div>

                                      {isEditing ? (
                                        <div className="materials-edit-grid">
                                          <input
                                            className="text-input"
                                            value={draft?.title || ""}
                                            onChange={(event) =>
                                              setMaterialEditDrafts((prev) => ({
                                                ...prev,
                                                [material.id]: {
                                                  title: event.target.value,
                                                  description: prev[material.id]?.description || ""
                                                }
                                              }))
                                            }
                                            placeholder="Tiêu đề tài liệu"
                                          />
                                          <textarea
                                            className="text-input"
                                            value={draft?.description || ""}
                                            onChange={(event) =>
                                              setMaterialEditDrafts((prev) => ({
                                                ...prev,
                                                [material.id]: {
                                                  title: prev[material.id]?.title || "",
                                                  description: event.target.value
                                                }
                                              }))
                                            }
                                            placeholder="Nội dung tài liệu"
                                          />
                                          <label className="field">
                                            <span>Import thêm file (tùy chọn)</span>
                                            <input
                                              className="text-input"
                                              type="file"
                                              multiple
                                              onChange={(event) => onSelectEditFiles(material.id, event)}
                                              disabled={isProcessingFiles}
                                            />
                                          </label>
                                          {(materialEditFiles[material.id] || []).length > 0 ? (
                                            <div className="materials-file-names">
                                              {(materialEditFiles[material.id] || []).map((file, index) => (
                                                <div key={`${material.id}-edit-file-${index}`} className="materials-attachment-item">
                                                  <small className="hint-copy">{file.name}</small>
                                                  <button
                                                    type="button"
                                                    className="materials-danger-text"
                                                    onClick={() => removeEditFile(material.id, index)}
                                                  >
                                                    Xóa
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          ) : null}
                                          <div className="group-card-actions">
                                            <button
                                              type="button"
                                              className="hero-primary"
                                              onClick={() => saveEditMaterial(material)}
                                            >
                                              Lưu
                                            </button>
                                            <button
                                              type="button"
                                              className="hero-secondary"
                                              onClick={() => cancelEditMaterial(material.id)}
                                            >
                                              Hủy
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <h4>{material.title}</h4>
                                          {material.description ? (
                                            <p className="hint-copy">{material.description}</p>
                                          ) : null}
                                        </>
                                      )}

                                      {files.length > 0 ? (
                                        <div className="materials-file-names">
                                          {files.map((file, index) => (
                                            <p key={`${material.id}-name-${index}`} className="hint-copy">
                                              {file.name}
                                            </p>
                                          ))}
                                        </div>
                                      ) : null}

                                      <div className="group-card-actions materials-item-actions">
                                        {!isEditing ? (
                                          <button
                                            type="button"
                                            className="materials-text-action"
                                            onClick={() => startEditMaterial(material)}
                                          >
                                            Sửa
                                          </button>
                                        ) : null}

                                        {material.externalUrl ? (
                                          <a
                                            className="materials-text-action"
                                            href={material.externalUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            Mở link
                                          </a>
                                        ) : null}

                                        {files.map((file, index) =>
                                          canPreviewFile(file) ? (
                                            <button
                                              key={`${material.id}-preview-${index}`}
                                              type="button"
                                              className="materials-text-action"
                                              onClick={() =>
                                                openPreview(file, `${material.title} - ${file.name}`)
                                              }
                                            >
                                              Xem file
                                            </button>
                                          ) : null
                                        )}

                                        <button
                                          type="button"
                                          className="materials-text-action group-danger"
                                          onClick={() => handleDeleteSingle(material.id)}
                                        >
                                          Xóa
                                        </button>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            </>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </>
          )}

          {showAddPanel || isUploadPage ? (
            <section className="group-form-card">
              {isUploadPage ? (
                <div className="materials-upload-topbar">
                  <button
                    type="button"
                    className="materials-text-action materials-upload-back-link"
                    onClick={() => router.push("/files")}
                  >
                    Quay về trang tài liệu
                  </button>
                </div>
              ) : null}
              <h2>Thêm tài liệu</h2>

              <div className="materials-course-mode">
                <button
                  type="button"
                  className={courseMode === "existing" ? "hero-primary" : "hero-secondary"}
                  onClick={() => setCourseMode("existing")}
                >
                  Chọn mã môn có sẵn
                </button>
                <button
                  type="button"
                  className={courseMode === "new" ? "hero-primary" : "hero-secondary"}
                  onClick={() => setCourseMode("new")}
                >
                  Tạo folder môn mới
                </button>
              </div>

              {courseMode === "existing" ? (
                <label className="field">
                  <span>Mã môn có sẵn</span>
                  <select
                    className="text-input"
                    value={selectedCourseKey}
                    onChange={(event) => setSelectedCourseKey(event.target.value)}
                  >
                    {courseFolders.length === 0 ? (
                      <option value="">-- Chưa có mã môn --</option>
                    ) : (
                      courseFolders.map((folder) => (
                        <option key={folder.key} value={folder.key}>
                          {folderLabel(folder.code, folder.name)}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              ) : (
                <div className="materials-form-grid">
                  <label className="field">
                    <span>Mã môn</span>
                    <input
                      className="text-input"
                      value={newCourseCode}
                      onChange={(event) => setNewCourseCode(event.target.value)}
                      placeholder="Ví dụ: DOM101"
                    />
                  </label>

                  <label className="field">
                    <span>Tên môn</span>
                    <input
                      className="text-input"
                      value={newCourseName}
                      onChange={(event) => setNewCourseName(event.target.value)}
                      placeholder="Ví dụ: Nhập môn Digital Marketing"
                    />
                  </label>
                </div>
              )}

              <label className="field">
                <span>Folder con (loại tài liệu)</span>
                <select
                  className="text-input"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as MaterialCategory)}
                >
                  {MATERIAL_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {category === "slide" || category === "lesson-plan" ? (
                  <small className="hint-copy">Loại này chỉ hiển thị cho Giảng viên.</small>
                ) : null}
              </label>

              <div className="field">
                <span>Áp dụng cho lớp</span>
                {classLists.length === 0 ? (
                  <p className="hint-copy">
                    Bạn chưa có danh sách lớp nào. Hãy import lớp trước ở mục "Lớp của tôi".
                  </p>
                ) : (
                  <div className="materials-class-selector">
                    {classLists.map((classList) => (
                      <label key={classList.id} className="materials-class-option">
                        <input
                          type="checkbox"
                          checked={assignedClassIds.includes(classList.id)}
                          onChange={() => toggleClassId(classList.id)}
                        />
                        <span>
                          {classList.className} ({classList.students.length} SV)
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <label className="field">
                <span>Tên tài liệu</span>
                <input
                  className="text-input"
                  value={singleTitle}
                  onChange={(event) => setSingleTitle(event.target.value)}
                  placeholder="Ví dụ: Chương 1 - Tổng quan môn học"
                />
              </label>

              <label className="field">
                <span>Nội dung</span>
                <textarea
                  className="text-input group-textarea"
                  value={singleContent}
                  onChange={(event) => setSingleContent(event.target.value)}
                  placeholder="Mô tả ngắn nội dung tài liệu..."
                />
              </label>

              <p className="materials-drive-note">
                Với những file nặng trên 5MB, GV vui lòng đăng tải lên Drive và sao chép đường link vào đây.
              </p>

              <div className="materials-upload-grid">
                <article className="materials-sub-upload">
                  <h3>Tải lên 1 file</h3>

                  <label className="field">
                    <span>Đường dẫn tài liệu (tùy chọn)</span>
                    <input
                      className="text-input"
                      value={singleExternalUrl}
                      onChange={(event) => setSingleExternalUrl(event.target.value)}
                      placeholder="https://..."
                    />
                  </label>

                  <label className="field">
                    <span>File tài liệu (tối đa 5MB)</span>
                    <input
                      className="text-input"
                      type="file"
                      onChange={onSelectSingleFile}
                      disabled={isProcessingFiles}
                    />
                    {singleFile ? (
                      <small className="hint-copy">Đã chọn file: {singleFile.name}</small>
                    ) : null}
                  </label>

                  <button type="button" className="hero-primary" onClick={handleSaveSingle}>
                    Tải lên 1 file
                  </button>
                </article>

                <article className="materials-sub-upload">
                  <h3>Tải lên hàng loạt</h3>
                  <label className="field">
                    <span>Chọn nhiều file (mỗi file ≤ 5MB)</span>
                    <input
                      className="text-input"
                      type="file"
                      multiple
                      onChange={onSelectBulkFiles}
                      disabled={isProcessingFiles}
                    />
                  </label>

                  {bulkFiles.length > 0 ? (
                    <div className="materials-attachment-list">
                      {bulkFiles.map((file, index) => (
                        <div key={`${file.name}-${file.size}-${index}`} className="materials-attachment-item">
                          <small className="hint-copy">{file.name}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <button type="button" className="hero-primary" onClick={handleSaveBulk}>
                    Tải lên hàng loạt
                  </button>
                </article>
              </div>
            </section>
          ) : null}
        </div>

        {previewFile ? (
          <div className="group-modal-overlay" onClick={closePreview}>
            <article
              className="group-modal-card materials-preview-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="materials-preview-head">
                <h3>{previewTitle || previewFile.name}</h3>
                <button type="button" className="hero-secondary" onClick={closePreview}>
                  Đóng
                </button>
              </div>

              <div className="materials-preview-content">
                {previewFile.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewFile.dataUrl} alt={previewFile.name} className="materials-preview-image" />
                ) : previewFile.type.includes("pdf") ||
                  previewFile.type.startsWith("text/") ||
                  previewFile.type.includes("json") ? (
                  <iframe title={previewFile.name} src={previewFile.dataUrl} className="materials-preview-frame" />
                ) : (
                  <div className="content-card">
                    <p>File này chưa hỗ trợ xem trực tiếp.</p>
                  </div>
                )}
              </div>
            </article>
          </div>
        ) : null}
      </main>
    </TeacherAuthGuard>
  );
}




