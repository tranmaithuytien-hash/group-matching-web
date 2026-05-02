"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TeacherAuthGuard } from "../../../components/teacher-auth-guard";
import { getDemoSession } from "../../../lib/auth-storage";
import {
  loadTeacherClassListsByOwner,
  loadTeacherClassListsByOwnerAny,
  type TeacherClassList
} from "../../../lib/class-lists";
import {
  createLearningMaterialId,
  deleteLearningMaterial,
  getMaterialCategoryLabel,
  LearningMaterialStorageError,
  loadLearningMaterialsByTeacher,
  MATERIAL_CATEGORY_OPTIONS,
  upsertLearningMaterial,
  type LearningMaterial,
  type MaterialAttachment,
  type MaterialCategory
} from "../../../lib/learning-materials";

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

function normalizeExternalUrl(rawUrl: string) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function toEmbeddableUrl(rawUrl: string) {
  const normalized = normalizeExternalUrl(rawUrl);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (host.includes("drive.google.com")) {
      const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
      if (fileMatch?.[1]) {
        return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
      }
      const idFromQuery = url.searchParams.get("id");
      if (idFromQuery) {
        return `https://drive.google.com/file/d/${idFromQuery}/preview`;
      }
    }
    return normalized;
  } catch {
    return normalized;
  }
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
  const [extraExternalUrls, setExtraExternalUrls] = useState<string[]>([]);
  const [bulkTitleLinkInput, setBulkTitleLinkInput] = useState("");

  const [activeCourseKey, setActiveCourseKey] = useState("");
  const [expandedSubfolderKeys, setExpandedSubfolderKeys] = useState<string[]>([]);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const [materialEditDrafts, setMaterialEditDrafts] = useState<Record<string, MaterialEditDraft>>(
    {}
  );
  const [courseEditDraft, setCourseEditDraft] = useState<CourseEditDraft | null>(null);

  const [previewFile, setPreviewFile] = useState<MaterialAttachment | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewExternalUrl, setPreviewExternalUrl] = useState("");
  const [previewExternalOpenUrl, setPreviewExternalOpenUrl] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const isUploadPage = pathname === "/files/upload";

  const refreshData = async (ownerEmail: string) => {
    if (!ownerEmail) {
      setClassLists([]);
      setMaterials([]);
      return;
    }
    const localClasses = loadTeacherClassListsByOwner(ownerEmail);
    setClassLists(localClasses.length > 0 ? localClasses : await loadTeacherClassListsByOwnerAny(ownerEmail));
    setMaterials(loadLearningMaterialsByTeacher(ownerEmail));
  };

  const applyMaterialUpsert = (material: LearningMaterial) => {
    try {
      return upsertLearningMaterial(material);
    } catch (error) {
      if (error instanceof LearningMaterialStorageError) {
        setStatusMessage(error.message);
        return null;
      }
      setStatusMessage("Không thể lưu tài liệu. Vui lòng thử lại.");
      return null;
    }
  };

  useEffect(() => {
    const session = getDemoSession();
    const email = session?.role === "teacher" ? session.email : "";
    const name = session?.role === "teacher" ? session.name || "" : "";
    setTeacherEmail(email);
    setTeacherName(name);
    void refreshData(email);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!teacherEmail) {
      return;
    }
    const onStorage = () => {
      void void refreshData(teacherEmail);
    };
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

  const handleSaveSingle = async () => {
    if (!validateBaseBeforeSave()) {
      return;
    }
    const folder = resolveFolderOrWarn();
    if (!folder) {
      return;
    }

    const title = singleTitle.trim();
    const bulkRows = bulkTitleLinkInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const isUrl = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());
    const parsedBulk: Array<{ title: string; description: string; url: string }> = [];
    const invalidRows: string[] = [];
    let pendingTitle = "";

    const pushByParts = (parts: string[], rawLine: string) => {
      const clean = parts.map((part) => part.trim()).filter(Boolean);
      if (clean.length < 2) {
        invalidRows.push(rawLine);
        return;
      }
      const urlIndex = clean.findIndex((part) => isUrl(part));
      if (urlIndex < 0) {
        invalidRows.push(rawLine);
        return;
      }
      const nextTitle = clean[0];
      const nextDescription = clean.slice(1, urlIndex).join(", ");
      const nextUrl = clean[urlIndex];
      if (!nextTitle || !nextUrl) {
        invalidRows.push(rawLine);
        return;
      }
      parsedBulk.push({
        title: nextTitle,
        description: nextDescription,
        url: nextUrl
      });
    };

    for (const rawLine of bulkRows) {
      const line = rawLine.trim();

      if (!line) continue;

      if (line.includes("\t")) {
        pushByParts(line.split("\t"), rawLine);
        pendingTitle = "";
        continue;
      }

      if (line.includes("|")) {
        pushByParts(line.split("|"), rawLine);
        pendingTitle = "";
        continue;
      }

      if (line.includes(",")) {
        pushByParts(line.split(","), rawLine);
        pendingTitle = "";
        continue;
      }

      const urlMatch = line.match(/https?:\/\/\S+/i);
      if (urlMatch) {
        const detectedUrl = urlMatch[0];
        const beforeUrl = line.slice(0, urlMatch.index || 0).trim();
        if (beforeUrl) {
          parsedBulk.push({
            title: beforeUrl,
            description: "",
            url: detectedUrl
          });
          pendingTitle = "";
          continue;
        }
        if (pendingTitle) {
          parsedBulk.push({
            title: pendingTitle,
            description: "",
            url: detectedUrl
          });
          pendingTitle = "";
          continue;
        }
        invalidRows.push(rawLine);
        continue;
      }

      pendingTitle = line;
    }

    if (pendingTitle) {
      invalidRows.push(pendingTitle);
    }

    if (invalidRows.length > 0 && bulkRows.length > 0) {
      setStatusMessage(
        "Định dạng không hợp lệ. Hỗ trợ: Tiêu đề, Link hoặc Tiêu đề, Nội dung, Link hoặc dán trực tiếp từ Excel."
      );
      return;
    }
    if (!title && parsedBulk.length === 0) {
      setStatusMessage("Vui lòng nhập tên tài liệu.");
      return;
    }

    const allUrls = [singleExternalUrl, ...extraExternalUrls]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (allUrls.length === 0 && parsedBulk.length === 0) {
      setStatusMessage("Vui lòng nhập đường dẫn Google Drive.");
      return;
    }

    const now = Date.now();
    const items =
      parsedBulk.length > 0
        ? parsedBulk.map((item) => ({
            title: item.title,
            description: item.description,
            url: item.url
          }))
        : allUrls.map((url, index) => ({
            title: allUrls.length > 1 ? `${title} ${index + 1}` : title,
            description: singleContent.trim(),
            url
          }));

    for (let index = 0; index < items.length; index += 1) {
      const materialId = createLearningMaterialId();
      const nextMaterial: LearningMaterial = {
        id: materialId,
        ownerTeacherEmail: teacherEmail,
        ownerTeacherName: teacherName || teacherEmail.split("@")[0],
        courseCode: folder.code,
        courseName: folder.name,
        title: items[index].title,
        description: items[index].description,
        category,
        assignedClassListIds: [...assignedClassIds],
        externalUrl: normalizeExternalUrl(items[index].url),
        attachments: [],
        createdAt: now + index,
        updatedAt: now + index
      };

      const saved = applyMaterialUpsert(nextMaterial);
      if (!saved) {
        setStatusMessage("Không thể lưu tài liệu. Vui lòng thử lại.");
        return;
      }
    }

    setSingleTitle("");
    setSingleContent("");
    setSingleExternalUrl("");
    setExtraExternalUrls([]);
    setBulkTitleLinkInput("");
    void refreshData(teacherEmail);
    setActiveCourseKey(folder.code);
    setExpandedSubfolderKeys((prev) => {
      const key = buildSubfolderKey(folder.code, category);
      return prev.includes(key) ? prev : [...prev, key];
    });
    setStatusMessage(
      `Đã thêm ${items.length} tài liệu bằng link Google Drive. Hãy bảo đảm rằng mình đã mở quyền Xem thầy/cô nhé.`
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
  };

  const cancelEditMaterial = (materialId: string) => {
    setMaterialEditDrafts((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
  };

  const saveEditMaterial = async (material: LearningMaterial) => {
    const draft = materialEditDrafts[material.id];
    const nextTitle = String(draft?.title || "").trim();
    const nextDescription = String(draft?.description || "").trim();
    if (!nextTitle) {
      setStatusMessage("Tên tài liệu không được để trống.");
      return;
    }

    if (
      nextTitle === material.title.trim() &&
      nextDescription === String(material.description || "").trim()
    ) {
      cancelEditMaterial(material.id);
      return;
    }

    const updated: LearningMaterial = {
      ...material,
      title: nextTitle,
      description: nextDescription,
      updatedAt: Date.now()
    };
    applyMaterialUpsert(updated);
    cancelEditMaterial(material.id);
    void refreshData(teacherEmail);
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
      applyMaterialUpsert(updated);
    });

    void refreshData(teacherEmail);
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

    const confirmed = window.confirm(`Xóa ${targetIds.length} tài liệu đã chọn?`);
    if (!confirmed) {
      return;
    }

    targetIds.forEach((id) => deleteLearningMaterial(id));
    setSelectedDeleteIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    void refreshData(teacherEmail);
    setStatusMessage(`Đã xóa ${targetIds.length} tài liệu.`);
  };

  const handleDeleteSingle = (materialId: string) => {
    const confirmed = window.confirm("Bạn có chắc muốn xóa tài liệu này?");
    if (!confirmed) {
      return;
    }
    deleteLearningMaterial(materialId);
    setSelectedDeleteIds((prev) => prev.filter((id) => id !== materialId));
    void refreshData(teacherEmail);
    setStatusMessage("Đã xóa tài liệu.");
  };

  const openPreview = (file: MaterialAttachment, title: string) => {
    setPreviewFile(file);
    setPreviewTitle(title);
  };

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewTitle("");
    setPreviewExternalUrl("");
    setPreviewExternalOpenUrl("");
  };

  const openExternalPreview = (url: string, title: string) => {
    const normalizedUrl = normalizeExternalUrl(url);
    if (!normalizedUrl) {
      return;
    }
    setPreviewExternalUrl(toEmbeddableUrl(normalizedUrl));
    setPreviewExternalOpenUrl(normalizedUrl);
    setPreviewTitle(title);
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
              Kho tài liệu được sắp xếp theo folder lớn <strong>[Mã môn] - [Tên môn]</strong>, bên trong là các
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
                            classLists.find((item) => item.id === classId)?.className || "Lớp đã xóa";
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
                              {isSubfolderExpanded ? "Thu gọn" : "Mở"}
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
                                          <button
                                            type="button"
                                            className="materials-text-action"
                                            onClick={() =>
                                              openExternalPreview(material.externalUrl || "", material.title)
                                            }
                                          >
                                            Mở link
                                          </button>
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
                Marveclass tạm thời chỉ hỗ trợ link Google Drive. Mong quý thầy cô hãy mở quyền share
                link tài liệu và thực hiện copy link vào bên dưới.
              </p>
              <p className="hint-copy">
                Lưu ý: Vui lòng đặt quyền Google Drive là <strong>Anyone with the link</strong> và
                quyền <strong>Viewer</strong> để sinh viên xem được.
              </p>
              <p className="hint-copy">
                Quy tắc nhập link: <strong>mỗi file = 1 link Google Drive</strong>, không dán link folder.
              </p>

              <div className="materials-upload-grid">
                <article className="materials-sub-upload">
                  <h3>Đính kèm bằng link Google Drive</h3>

                  <label className="field">
                    <span>Đường dẫn tài liệu Google Drive</span>
                    <input
                      className="text-input"
                      value={singleExternalUrl}
                      onChange={(event) => setSingleExternalUrl(event.target.value)}
                      placeholder="https://drive.google.com/..."
                    />
                  </label>

                  {extraExternalUrls.map((url, index) => (
                    <label key={`extra-link-${index}`} className="field">
                      <span>File trong folder con #{index + 2}</span>
                      <input
                        className="text-input"
                        value={url}
                        onChange={(event) =>
                          setExtraExternalUrls((prev) =>
                            prev.map((item, idx) => (idx === index ? event.target.value : item))
                          )
                        }
                        placeholder="https://drive.google.com/..."
                      />
                      <button
                        type="button"
                        className="materials-text-action group-danger"
                        onClick={() =>
                          setExtraExternalUrls((prev) => prev.filter((_, idx) => idx !== index))
                        }
                      >
                        Xóa dòng link này
                      </button>
                    </label>
                  ))}

                  <button
                    type="button"
                    className="materials-text-action"
                    style={{ alignSelf: "flex-start", marginTop: -10, marginBottom: 2 }}
                    onClick={() => setExtraExternalUrls((prev) => [...prev, ""])}
                  >
                    Thêm 1 dòng link
                  </button>

                  <label className="field" style={{ marginTop: 8 }}>
                    <span>Nhập nhanh nhiều dòng (Tiêu đề, Nội dung (không bắt buộc), Link)</span>
                    <textarea
                      className="text-input group-textarea"
                      value={bulkTitleLinkInput}
                      onChange={(event) => setBulkTitleLinkInput(event.target.value)}
                      placeholder={
                        "Chủ đề 1, Nội dung 1, https://drive.google.com/...\nChủ đề 2, https://drive.google.com/..."
                      }
                    />
                  </label>

                  <button type="button" className="hero-primary" onClick={handleSaveSingle}>
                    Lưu tài liệu
                  </button>
                </article>
              </div>
              {statusMessage ? <p className="group-status-note" style={{ marginTop: 12 }}>{statusMessage}</p> : null}
            </section>
          ) : null}
        </div>

        {previewFile || previewExternalUrl ? (
          <div className="group-modal-overlay" onClick={closePreview}>
            <article
              className="group-modal-card materials-preview-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="materials-preview-head">
                <h3>{previewTitle || previewFile?.name || "Xem tài liệu"}</h3>
                {previewExternalUrl ? (
                  <a
                    className="hero-secondary"
                    href={previewExternalOpenUrl || previewExternalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở tab mới
                  </a>
                ) : null}
                <button type="button" className="hero-secondary" onClick={closePreview}>
                  Đóng
                </button>
              </div>

              <div className="materials-preview-content">
                {previewExternalUrl ? (
                  <iframe title={previewTitle} src={previewExternalUrl} className="materials-preview-frame" />
                ) : previewFile?.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewFile.dataUrl} alt={previewFile.name} className="materials-preview-image" />
                ) : previewFile?.type.includes("pdf") ||
                  previewFile?.type.startsWith("text/") ||
                  previewFile?.type.includes("json") ? (
                  <iframe
                    title={previewFile?.name || previewTitle}
                    src={previewFile?.dataUrl}
                    className="materials-preview-frame"
                  />
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


