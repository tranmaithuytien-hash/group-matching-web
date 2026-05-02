import { normalizeEmail } from "./auth-storage";
import type { GroupMatchingSession } from "./group-matching";

export const TEACHER_CLASS_LISTS_STORAGE_KEY = "marveclass_teacher_class_lists";
const TEACHER_CLASS_LISTS_DELETED_SESSION_IDS_KEY = "marveclass_deleted_group_session_ids";

export type TeacherClassFixedColumnKey = "studentId" | "fullName" | "email" | "phone" | "ranking";

export const TEACHER_CLASS_FIXED_COLUMNS: Array<{ key: TeacherClassFixedColumnKey; label: string }> = [
  { key: "studentId", label: "MSSV" },
  { key: "fullName", label: "Họ và tên" },
  { key: "email", label: "Email" },
  { key: "phone", label: "SĐT" },
  { key: "ranking", label: "Thứ hạng" }
];

export type TeacherClassStudent = {
  studentId: string;
  fullName: string;
  email?: string;
  phone?: string;
  ranking?: number;
  customValues?: Record<string, string>;
};

export type TeacherClassList = {
  id: string;
  ownerTeacherEmail: string;
  ownerTeacherName?: string;
  className: string;
  students: TeacherClassStudent[];
  customColumns?: string[];
  sourceSessionId?: string;
  createdAt: number;
  updatedAt: number;
};

export type ParsedTeacherClassSheet = {
  students: TeacherClassStudent[];
  customColumns: string[];
};

const FIXED_COLUMN_LABELS = new Set(TEACHER_CLASS_FIXED_COLUMNS.map((column) => normalizeToken(column.label)));
const FIXED_COLUMN_KEYS = new Set<TeacherClassFixedColumnKey>(
  TEACHER_CLASS_FIXED_COLUMNS.map((column) => column.key)
);

function hasWindow() {
  return typeof window !== "undefined";
}

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeColumnLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeCustomColumns(rawColumns: unknown) {
  if (!Array.isArray(rawColumns)) {
    return [] as string[];
  }

  const usedLabels = new Set<string>();
  const columns: string[] = [];
  rawColumns.forEach((item) => {
    const label = normalizeColumnLabel(String(item || ""));
    if (!label) {
      return;
    }
    const dedupeKey = normalizeToken(label);
    if (!dedupeKey || usedLabels.has(dedupeKey) || FIXED_COLUMN_LABELS.has(dedupeKey)) {
      return;
    }
    usedLabels.add(dedupeKey);
    columns.push(label);
  });

  return columns;
}

function sanitizeCustomValues(raw: unknown, customColumns: string[]) {
  if (!raw || typeof raw !== "object") {
    return {} as Record<string, string>;
  }

  const nextValues: Record<string, string> = {};
  customColumns.forEach((column) => {
    const value = String((raw as Record<string, unknown>)[column] ?? "").trim();
    if (value) {
      nextValues[column] = value;
    }
  });

  return nextValues;
}

function normalizeStudent(
  raw: Partial<TeacherClassStudent>,
  fallbackRanking: number,
  customColumns: string[]
): TeacherClassStudent | null {
  const studentId = String(raw.studentId || "").trim();
  const fullName = String(raw.fullName || "").trim();
  if (!studentId || !fullName) {
    return null;
  }

  const rankingNumber = Number(raw.ranking);
  const ranking = Number.isFinite(rankingNumber) && rankingNumber > 0 ? rankingNumber : fallbackRanking;
  const email = String(raw.email || "").trim();
  const phone = String(raw.phone || "").trim();
  const customValues = sanitizeCustomValues(raw.customValues, customColumns);

  return {
    studentId,
    fullName,
    ranking,
    email: email ? normalizeEmail(email) : "",
    phone,
    customValues
  };
}

function normalizeClassList(raw: Partial<TeacherClassList>): TeacherClassList | null {
  const id = String(raw.id || "").trim();
  const ownerTeacherEmail = normalizeEmail(String(raw.ownerTeacherEmail || ""));
  const className = String(raw.className || "").trim();
  if (!id || !ownerTeacherEmail || !className) {
    return null;
  }

  const customColumns = sanitizeCustomColumns(raw.customColumns);
  const studentsRaw = Array.isArray(raw.students) ? raw.students : [];
  const usedIds = new Set<string>();
  const students: TeacherClassStudent[] = [];

  studentsRaw.forEach((student, index) => {
    const normalized = normalizeStudent(student, index + 1, customColumns);
    if (!normalized) {
      return;
    }
    const dedupeId = normalized.studentId.toUpperCase();
    if (usedIds.has(dedupeId)) {
      return;
    }
    usedIds.add(dedupeId);
    students.push(normalized);
  });

  return {
    id,
    ownerTeacherEmail,
    ownerTeacherName: String(raw.ownerTeacherName || "").trim(),
    className,
    students,
    customColumns,
    sourceSessionId: String(raw.sourceSessionId || "").trim(),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now()
  };
}

export function loadTeacherClassLists() {
  if (!hasWindow()) {
    return [] as TeacherClassList[];
  }

  const raw = window.localStorage.getItem(TEACHER_CLASS_LISTS_STORAGE_KEY);
  if (!raw) {
    return [] as TeacherClassList[];
  }

  try {
    const parsed = JSON.parse(raw) as TeacherClassList[];
    if (!Array.isArray(parsed)) {
      return [] as TeacherClassList[];
    }

    return parsed
      .map((item) => normalizeClassList(item))
      .filter((item): item is TeacherClassList => Boolean(item));
  } catch {
    return [] as TeacherClassList[];
  }
}

export function saveTeacherClassLists(classLists: TeacherClassList[]) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(TEACHER_CLASS_LISTS_STORAGE_KEY, JSON.stringify(classLists));
}

export function loadTeacherClassListsByOwner(ownerTeacherEmail: string) {
  const normalizedOwnerEmail = normalizeEmail(ownerTeacherEmail);
  if (!normalizedOwnerEmail) {
    return [] as TeacherClassList[];
  }

  return loadTeacherClassLists()
    .filter((classList) => normalizeEmail(classList.ownerTeacherEmail) === normalizedOwnerEmail)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createTeacherClassListId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `class-${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

export function upsertTeacherClassList(payload: TeacherClassList) {
  const normalized = normalizeClassList(payload);
  if (!normalized) {
    return null;
  }

  const classLists = loadTeacherClassLists();
  const exists = classLists.some((item) => item.id === normalized.id);
  const nextClassLists = exists
    ? classLists.map((item) => (item.id === normalized.id ? normalized : item))
    : [normalized, ...classLists];

  saveTeacherClassLists(nextClassLists);
  return normalized;
}

export function deleteTeacherClassList(classListId: string) {
  const classLists = loadTeacherClassLists();
  const removing = classLists.find((classList) => classList.id === classListId);
  const nextClassLists = classLists.filter((classList) => classList.id !== classListId);
  saveTeacherClassLists(nextClassLists);

  const sourceSessionId = String(removing?.sourceSessionId || "").trim();
  if (sourceSessionId) {
    markGroupSessionClassDeleted(sourceSessionId);
  }
}

function loadDeletedGroupSessionIds() {
  if (!hasWindow()) {
    return new Set<string>();
  }
  try {
    const raw = window.localStorage.getItem(TEACHER_CLASS_LISTS_DELETED_SESSION_IDS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }
    return new Set(parsed.map((value) => String(value || "").trim()).filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

function saveDeletedGroupSessionIds(ids: Set<string>) {
  if (!hasWindow()) {
    return;
  }
  window.localStorage.setItem(
    TEACHER_CLASS_LISTS_DELETED_SESSION_IDS_KEY,
    JSON.stringify(Array.from(ids.values()))
  );
}

function markGroupSessionClassDeleted(sessionId: string) {
  const normalized = String(sessionId || "").trim();
  if (!normalized) {
    return;
  }
  const deletedIds = loadDeletedGroupSessionIds();
  deletedIds.add(normalized);
  saveDeletedGroupSessionIds(deletedIds);
}

function looksLikePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return false;
  }
  return /^[\d+\-().\s]+$/.test(raw);
}

function parseStudentLine(line: string, fallbackRanking: number): TeacherClassStudent | null {
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return null;
  }

  let studentId = "";
  let fullName = "";
  let ranking: number | undefined;
  let email = "";
  let phone = "";

  const readExtraColumns = (columns: string[]) => {
    columns.forEach((column) => {
      const value = column.trim();
      if (!value) {
        return;
      }
      if (!email && value.includes("@")) {
        email = normalizeEmail(value);
        return;
      }
      if (!phone && looksLikePhone(value)) {
        phone = value;
        return;
      }
      if (ranking === undefined && /^#?\d{1,4}$/.test(value)) {
        const cleaned = Number(value.replace("#", ""));
        if (Number.isFinite(cleaned) && cleaned > 0) {
          ranking = cleaned;
        }
      }
    });
  };

  if (trimmedLine.includes("\t")) {
    const parts = trimmedLine
      .split(/\t+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      studentId = parts[0] || "";
      fullName = parts[1] || "";
      readExtraColumns(parts.slice(2));
    }
  } else if (trimmedLine.includes(",")) {
    const parts = trimmedLine
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      studentId = parts[0] || "";
      fullName = parts[1] || "";
      readExtraColumns(parts.slice(2));
    }
  } else {
    const parts = trimmedLine.split(/\s+/);
    if (parts.length >= 2) {
      studentId = parts[0] || "";
      fullName = parts.slice(1).join(" ");
    }
  }

  if (!studentId || !fullName) {
    return null;
  }

  return {
    studentId,
    fullName,
    ranking: ranking ?? fallbackRanking,
    email,
    phone,
    customValues: {}
  };
}

export function parseTeacherClassStudentList(rawValue: string) {
  const rows = rawValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const students: TeacherClassStudent[] = [];
  const usedIds = new Set<string>();

  rows.forEach((line, index) => {
    const parsed = parseStudentLine(line, index + 1);
    if (!parsed) {
      return;
    }
    const dedupeId = parsed.studentId.toUpperCase();
    if (usedIds.has(dedupeId)) {
      return;
    }
    usedIds.add(dedupeId);
    students.push(parsed);
  });

  return students;
}

export function classStudentsToImportText(students: TeacherClassStudent[]) {
  return students
    .map((student) => {
      const ranking = student.ranking && student.ranking > 0 ? String(student.ranking) : "";
      const email = student.email ? student.email.trim() : "";
      const phone = student.phone ? student.phone.trim() : "";
      const segments = [student.studentId, student.fullName, ranking, email, phone].filter(Boolean);
      return segments.join("\t");
    })
    .join("\n");
}

function resolveHeaderToFixedKey(header: string): TeacherClassFixedColumnKey | "" {
  const normalized = normalizeToken(header);
  if (!normalized) {
    return "";
  }

  const mapper: Record<string, TeacherClassFixedColumnKey> = {
    mssv: "studentId",
    id: "studentId",
    "ma so sinh vien": "studentId",
    "ma sv": "studentId",
    "ho va ten": "fullName",
    "ho ten": "fullName",
    ten: "fullName",
    email: "email",
    "e mail": "email",
    sdt: "phone",
    "so dien thoai": "phone",
    "dien thoai": "phone",
    phone: "phone",
    "thu hang": "ranking",
    thuhang: "ranking",
    rank: "ranking",
    ranking: "ranking"
  };

  return mapper[normalized] || "";
}

function parseLineToCells(line: string) {
  if (line.includes("\t")) {
    return line.split("\t").map((part) => part.trim());
  }
  if (line.includes(",")) {
    return line.split(",").map((part) => part.trim());
  }
  return [line.trim()];
}

function hasMeaningfulValue(student: TeacherClassStudent) {
  if (student.studentId || student.fullName || student.email || student.phone) {
    return true;
  }
  if (student.ranking && student.ranking > 0) {
    return true;
  }
  const customValues = student.customValues || {};
  return Object.values(customValues).some((value) => String(value || "").trim() !== "");
}

export function parseTeacherClassSheetText(rawValue: string): ParsedTeacherClassSheet {
  const lines = rawValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      students: [],
      customColumns: []
    };
  }

  const matrix = lines.map((line) => parseLineToCells(line));
  const firstRow = matrix[0] || [];
  const firstRowFixedHits = firstRow.reduce((count, cell) => {
    return resolveHeaderToFixedKey(cell) ? count + 1 : count;
  }, 0);
  const hasHeader = firstRowFixedHits >= 2;

  const customColumns: string[] = [];
  const columnDescriptors: Array<
    | { type: "fixed"; key: TeacherClassFixedColumnKey }
    | { type: "custom"; label: string }
  > = [];

  if (hasHeader) {
    firstRow.forEach((headerCell) => {
      const fixedKey = resolveHeaderToFixedKey(headerCell);
      if (fixedKey) {
        columnDescriptors.push({ type: "fixed", key: fixedKey });
        return;
      }

      const customLabel = normalizeColumnLabel(headerCell);
      if (!customLabel) {
        return;
      }
      if (customColumns.includes(customLabel)) {
        return;
      }
      customColumns.push(customLabel);
      columnDescriptors.push({ type: "custom", label: customLabel });
    });
  } else {
    columnDescriptors.push(
      { type: "fixed", key: "studentId" },
      { type: "fixed", key: "fullName" },
      { type: "fixed", key: "email" },
      { type: "fixed", key: "phone" },
      { type: "fixed", key: "ranking" }
    );

    const maxCols = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    for (let index = 5; index < maxCols; index += 1) {
      const label = `Cột ${index - 4}`;
      customColumns.push(label);
      columnDescriptors.push({ type: "custom", label });
    }
  }

  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const students: TeacherClassStudent[] = [];

  dataRows.forEach((row, rowIndex) => {
    const student: TeacherClassStudent = {
      studentId: "",
      fullName: "",
      email: "",
      phone: "",
      ranking: rowIndex + 1,
      customValues: {}
    };

    columnDescriptors.forEach((descriptor, colIndex) => {
      const cell = String(row[colIndex] ?? "").trim();
      if (descriptor.type === "fixed") {
        if (!FIXED_COLUMN_KEYS.has(descriptor.key)) {
          return;
        }
        if (descriptor.key === "ranking") {
          const rankingValue = Number(cell);
          if (Number.isFinite(rankingValue) && rankingValue > 0) {
            student.ranking = rankingValue;
          }
          return;
        }
        if (descriptor.key === "email") {
          student.email = cell ? normalizeEmail(cell) : "";
          return;
        }
        student[descriptor.key] = cell as never;
        return;
      }

      if (!descriptor.label) {
        return;
      }
      if (cell) {
        student.customValues = {
          ...(student.customValues || {}),
          [descriptor.label]: cell
        };
      }
    });

    if (!hasMeaningfulValue(student)) {
      return;
    }

    students.push(student);
  });

  return {
    students,
    customColumns
  };
}

function mapSessionParticipants(session: GroupMatchingSession, existing?: TeacherClassList) {
  const customColumns = existing?.customColumns || [];
  const existingById = new Map(
    (existing?.students || []).map((student) => [student.studentId.toUpperCase(), student])
  );

  return session.participants.map((participant, index) => {
    const existingStudent = existingById.get(participant.studentId.toUpperCase());
    return {
      studentId: participant.studentId,
      fullName: participant.fullName,
      email: participant.email || "",
      phone: existingStudent?.phone || "",
      ranking: participant.ranking || index + 1,
      customValues: sanitizeCustomValues(existingStudent?.customValues || {}, customColumns)
    } as TeacherClassStudent;
  });
}

function areStudentListsEqual(left: TeacherClassStudent[], right: TeacherClassStudent[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];
    if (!leftItem || !rightItem) {
      return false;
    }
    if (leftItem.studentId !== rightItem.studentId) {
      return false;
    }
    if (leftItem.fullName !== rightItem.fullName) {
      return false;
    }
    if ((leftItem.email || "") !== (rightItem.email || "")) {
      return false;
    }
    if ((leftItem.phone || "") !== (rightItem.phone || "")) {
      return false;
    }
    if ((leftItem.ranking || 0) !== (rightItem.ranking || 0)) {
      return false;
    }
  }

  return true;
}

export function syncClassListFromGroupSession(session: GroupMatchingSession) {
  const deletedIds = loadDeletedGroupSessionIds();
  if (deletedIds.has(session.id)) {
    return null;
  }

  const ownerTeacherEmail = normalizeEmail(session.ownerTeacherEmail || "");
  if (!ownerTeacherEmail) {
    return null;
  }

  const classLists = loadTeacherClassLists();
  const existing = classLists.find(
    (classList) =>
      classList.sourceSessionId === session.id &&
      normalizeEmail(classList.ownerTeacherEmail) === ownerTeacherEmail
  );
  const mappedStudents = mapSessionParticipants(session, existing);

  if (
    existing &&
    existing.className === session.className &&
    areStudentListsEqual(existing.students, mappedStudents)
  ) {
    return existing;
  }

  const now = Date.now();
  const nextClassList: TeacherClassList = {
    id: existing?.id || createTeacherClassListId(),
    ownerTeacherEmail,
    ownerTeacherName: session.ownerTeacherName || "",
    className: session.className,
    students: mappedStudents,
    customColumns: existing?.customColumns || [],
    sourceSessionId: session.id,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  return upsertTeacherClassList(nextClassList);
}

export function syncClassListsFromGroupSessions(ownerTeacherEmail: string, sessions: GroupMatchingSession[]) {
  const normalizedOwnerEmail = normalizeEmail(ownerTeacherEmail);
  if (!normalizedOwnerEmail || sessions.length === 0) {
    return;
  }

  sessions
    .filter((session) => normalizeEmail(session.ownerTeacherEmail) === normalizedOwnerEmail)
    .forEach((session) => {
      syncClassListFromGroupSession(session);
    });
}
