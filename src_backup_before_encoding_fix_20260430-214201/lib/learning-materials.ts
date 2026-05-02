import { normalizeEmail } from "./auth-storage";
import { loadTeacherClassLists } from "./class-lists";

export const LEARNING_MATERIALS_STORAGE_KEY = "marveclass_learning_materials";

export type MaterialCategory =
  | "book"
  | "slide"
  | "lesson-plan"
  | "presentation-topic"
  | "assignment-topic"
  | "other";

export type MaterialAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type LearningMaterial = {
  id: string;
  ownerTeacherEmail: string;
  ownerTeacherName?: string;
  courseCode: string;
  courseName?: string;
  title: string;
  description?: string;
  category: MaterialCategory;
  assignedClassListIds: string[];
  externalUrl?: string;
  attachments?: MaterialAttachment[];
  // Legacy key for backward compatibility with older saved data.
  attachment?: MaterialAttachment;
  createdAt: number;
  updatedAt: number;
};

export const MATERIAL_CATEGORY_OPTIONS: Array<{ value: MaterialCategory; label: string }> = [
  { value: "book", label: "Gi�o tr�nh" },
  { value: "slide", label: "Slide bài giảng" },
  { value: "lesson-plan", label: "Gi�o �n" },
  { value: "presentation-topic", label: "Chủ đề thuyết trình" },
  { value: "assignment-topic", label: "Đề tài Assignment" },
  { value: "other", label: "T�i liệu kh�c" }
];

const STUDENT_HIDDEN_CATEGORIES = new Set<MaterialCategory>(["slide", "lesson-plan"]);

function hasWindow() {
  return typeof window !== "undefined";
}

function normalizeCategory(rawValue: string): MaterialCategory {
  const value = String(rawValue || "").trim() as MaterialCategory;
  const validValues = new Set<MaterialCategory>(
    MATERIAL_CATEGORY_OPTIONS.map((option) => option.value)
  );
  if (validValues.has(value)) {
    return value;
  }
  return "other";
}

function sanitizeAttachment(rawAttachment: unknown): MaterialAttachment | undefined {
  if (!rawAttachment || typeof rawAttachment !== "object") {
    return undefined;
  }

  const name = String((rawAttachment as Record<string, unknown>).name || "").trim();
  const type = String((rawAttachment as Record<string, unknown>).type || "").trim();
  const size = Number((rawAttachment as Record<string, unknown>).size) || 0;
  const dataUrl = String((rawAttachment as Record<string, unknown>).dataUrl || "").trim();
  if (!name || !dataUrl) {
    return undefined;
  }

  return {
    name,
    type,
    size,
    dataUrl
  };
}

function sanitizeAttachments(rawAttachments: unknown, legacyAttachment?: MaterialAttachment) {
  const attachments: MaterialAttachment[] = [];

  if (Array.isArray(rawAttachments)) {
    rawAttachments.forEach((rawItem) => {
      const attachment = sanitizeAttachment(rawItem);
      if (!attachment) {
        return;
      }
      attachments.push(attachment);
    });
  }

  if (attachments.length === 0 && legacyAttachment) {
    attachments.push(legacyAttachment);
  }

  return attachments;
}

function normalizeMaterial(raw: Partial<LearningMaterial>): LearningMaterial | null {
  const id = String(raw.id || "").trim();
  const ownerTeacherEmail = normalizeEmail(String(raw.ownerTeacherEmail || ""));
  const courseCode = String(raw.courseCode || "").trim().toUpperCase();
  const title = String(raw.title || "").trim();
  if (!id || !ownerTeacherEmail || !courseCode || !title) {
    return null;
  }

  const assignedClassListIds = Array.isArray(raw.assignedClassListIds)
    ? [...new Set(raw.assignedClassListIds.map((value) => String(value || "").trim()).filter(Boolean))]
    : [];

  const legacyAttachment = sanitizeAttachment(raw.attachment);
  const attachments = sanitizeAttachments(
    (raw as Partial<LearningMaterial> & { attachments?: unknown }).attachments,
    legacyAttachment
  );

  return {
    id,
    ownerTeacherEmail,
    ownerTeacherName: String(raw.ownerTeacherName || "").trim(),
    courseCode,
    courseName: String(raw.courseName || "").trim(),
    title,
    description: String(raw.description || "").trim(),
    category: normalizeCategory(String(raw.category || "")),
    assignedClassListIds,
    externalUrl: String(raw.externalUrl || "").trim(),
    attachments,
    attachment: legacyAttachment,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now()
  };
}

export function getMaterialCategoryLabel(category: MaterialCategory) {
  return MATERIAL_CATEGORY_OPTIONS.find((option) => option.value === category)?.label || "T�i li�u kh�c";
}

export function createLearningMaterialId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `material-${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

export function loadLearningMaterials() {
  if (!hasWindow()) {
    return [] as LearningMaterial[];
  }

  const raw = window.localStorage.getItem(LEARNING_MATERIALS_STORAGE_KEY);
  if (!raw) {
    return [] as LearningMaterial[];
  }

  try {
    const parsed = JSON.parse(raw) as LearningMaterial[];
    if (!Array.isArray(parsed)) {
      return [] as LearningMaterial[];
    }

    return parsed
      .map((item) => normalizeMaterial(item))
      .filter((item): item is LearningMaterial => Boolean(item))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [] as LearningMaterial[];
  }
}

export function saveLearningMaterials(materials: LearningMaterial[]) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(LEARNING_MATERIALS_STORAGE_KEY, JSON.stringify(materials));
}

export function loadLearningMaterialsByTeacher(ownerTeacherEmail: string) {
  const normalizedTeacherEmail = normalizeEmail(ownerTeacherEmail);
  if (!normalizedTeacherEmail) {
    return [] as LearningMaterial[];
  }

  return loadLearningMaterials().filter(
    (material) => normalizeEmail(material.ownerTeacherEmail) === normalizedTeacherEmail
  );
}

export function upsertLearningMaterial(payload: LearningMaterial) {
  const normalized = normalizeMaterial(payload);
  if (!normalized) {
    return null;
  }

  const materials = loadLearningMaterials();
  const exists = materials.some((material) => material.id === normalized.id);
  const nextMaterials = exists
    ? materials.map((material) => (material.id === normalized.id ? normalized : material))
    : [normalized, ...materials];

  saveLearningMaterials(nextMaterials);
  return normalized;
}

export function deleteLearningMaterial(materialId: string) {
  const nextMaterials = loadLearningMaterials().filter((material) => material.id !== materialId);
  saveLearningMaterials(nextMaterials);
}

export function getStudentVisibleMaterials(studentEmail: string) {
  const normalizedStudentEmail = normalizeEmail(studentEmail);
  if (!normalizedStudentEmail) {
    return [] as LearningMaterial[];
  }

  const classLists = loadTeacherClassLists();
  const visibleClassIdSet = new Set(
    classLists
      .filter((classList) =>
        classList.students.some(
          (student) => normalizeEmail(String(student.email || "")) === normalizedStudentEmail
        )
      )
      .map((classList) => classList.id)
  );

  if (visibleClassIdSet.size === 0) {
    return [] as LearningMaterial[];
  }

  return loadLearningMaterials()
    .filter((material) => !STUDENT_HIDDEN_CATEGORIES.has(material.category))
    .filter((material) =>
      material.assignedClassListIds.some((classId) => visibleClassIdSet.has(classId))
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
