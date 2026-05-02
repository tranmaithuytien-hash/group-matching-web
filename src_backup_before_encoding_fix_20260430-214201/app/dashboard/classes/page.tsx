"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { TeacherAuthGuard } from "../../../components/teacher-auth-guard";
import { getDemoSession } from "../../../lib/auth-storage";
import {
  createTeacherClassListId,
  deleteTeacherClassList,
  loadTeacherClassListsByOwner,
  parseTeacherClassSheetText,
  syncClassListsFromGroupSessions,
  upsertTeacherClassList,
  type TeacherClassList,
  type TeacherClassStudent
} from "../../../lib/class-lists";
import { loadGroupMatchingSessionsByOwner } from "../../../lib/group-matching";

type SheetMode = "create" | "modal";

type SheetColumn = {
  key: string;
  label: string;
  fixed: boolean;
};

type CreateImportMode = "manual" | "excel";

type ImportTargetKey =
  | ""
  | "studentId"
  | "fullName"
  | "email"
  | "ranking"
  | "avgScore";
type MappingTargetKey = ImportTargetKey | "__custom__";

const DEFAULT_BASE_COLUMNS = [
  { key: "studentId", label: "MSSV" },
  { key: "fullName", label: "Họ và tên" },
  { key: "email", label: "Email" }
] as const;
const REQUIRED_BASE_COLUMN_KEYS = DEFAULT_BASE_COLUMNS.map((column) => column.key);
const BASE_COLUMN_LABEL_BY_KEY: Record<string, string> = {
  studentId: "MSSV",
  fullName: "Họ và tên",
  email: "Email",
  ranking: "Thứ hạng"
};
const BASE_COLUMN_KEY_SET = new Set<string>(Object.keys(BASE_COLUMN_LABEL_BY_KEY));

const IMPORT_TARGET_OPTIONS: Array<{ key: ImportTargetKey; label: string }> = [
  { key: "", label: "-- Bỏ qua --" },
  { key: "studentId", label: "MSSV" },
  { key: "fullName", label: "Họ và tên" },
  { key: "email", label: "Email" },
  { key: "ranking", label: "Thứ hạng" },
  { key: "avgScore", label: "Điểm TB" }
];

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferImportTarget(header: string): ImportTargetKey {
  const key = normalizeKey(header);
  if (!key) {
    return "";
  }
  if (["mssv", "ma sv", "ma so sinh vien", "student id", "id"].includes(key)) {
    return "studentId";
  }
  if (["ho va ten", "ho ten", "full name", "name", "ten"].includes(key)) {
    return "fullName";
  }
  if (["email", "e mail"].includes(key)) {
    return "email";
  }
  if (["thu hang", "ranking", "rank"].includes(key)) {
    return "ranking";
  }
  if (["diem tb", "diem trung binh", "gpa", "avg score", "average score"].includes(key)) {
    return "avgScore";
  }
  return "";
}

function detectHeaderRowIndex(rows: string[][]) {
  const maxScan = Math.min(rows.length, 12);
  let bestIndex = 0;
  let bestScore = -1;

  for (let rowIndex = 0; rowIndex < maxScan; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    let score = 0;
    row.forEach((cell) => {
      const target = inferImportTarget(String(cell || ""));
      if (target) {
        score += 1;
      }
    });
    if (score > bestScore) {
      bestScore = score;
      bestIndex = rowIndex;
    }
  }

  // Need at least 2 recognizable columns to trust header detection.
  return bestScore >= 2 ? bestIndex : 0;
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

function createEmptyStudent(customColumns: string[], fallbackRanking = 1): TeacherClassStudent {
  const customValues: Record<string, string> = {};
  customColumns.forEach((column) => {
    customValues[column] = "";
  });

  return {
    studentId: "",
    fullName: "",
    email: "",
    phone: "",
    ranking: fallbackRanking,
    customValues
  };
}

function withCustomColumns(student: TeacherClassStudent, customColumns: string[]) {
  const current = student.customValues || {};
  const nextCustomValues: Record<string, string> = {};
  customColumns.forEach((column) => {
    nextCustomValues[column] = String(current[column] || "");
  });
  return {
    ...student,
    customValues: nextCustomValues
  };
}

function normalizeRowsForStorage(rows: TeacherClassStudent[], customColumns: string[]) {
  const usedIds = new Set<string>();
  const nextRows: TeacherClassStudent[] = [];

  rows.forEach((row, index) => {
    const studentId = String(row.studentId || "").trim();
    const fullName = String(row.fullName || "").trim();
    const email = String(row.email || "").trim();
    const phone = String(row.phone || "").trim();
    const rankingRaw = Number(row.ranking);
    const ranking =
      Number.isFinite(rankingRaw) && rankingRaw > 0 ? rankingRaw : index + 1;

    const customValues: Record<string, string> = {};
    customColumns.forEach((column) => {
      const value = String(row.customValues?.[column] || "").trim();
      if (value) {
        customValues[column] = value;
      }
    });

    if (!studentId || !fullName) {
      return;
    }

    const dedupe = studentId.toUpperCase();
    if (usedIds.has(dedupe)) {
      return;
    }
    usedIds.add(dedupe);

    nextRows.push({
      studentId,
      fullName,
      email,
      phone,
      ranking,
      customValues
    });
  });

  return nextRows;
}

function buildColumns(
  columnOrder: string[],
  customColumns: string[],
  baseColumnLabels: Record<string, string>
): SheetColumn[] {
  const customKeySet = new Set(customColumns);
  const availableKeys = new Set<string>([...Object.keys(baseColumnLabels), ...customColumns]);
  const orderedKeys: string[] = [];

  columnOrder.forEach((key) => {
    if (!availableKeys.has(key) || orderedKeys.includes(key)) {
      return;
    }
    orderedKeys.push(key);
  });

  REQUIRED_BASE_COLUMN_KEYS.forEach((baseKey) => {
    if (!orderedKeys.includes(baseKey)) {
      orderedKeys.push(baseKey);
    }
  });

  customColumns.forEach((customKey) => {
    if (!orderedKeys.includes(customKey)) {
      orderedKeys.push(customKey);
    }
  });

  return orderedKeys
    .map((key) => ({
      key,
      label: baseColumnLabels[key] || key,
      // "fixed" here means the value source is root student fields, not customValues.
      fixed: BASE_COLUMN_KEY_SET.has(key)
    }))
    .filter((column) => BASE_COLUMN_KEY_SET.has(column.key) || customKeySet.has(column.key));
}

function syncColumnOrder(prevOrder: string[], customColumns: string[]) {
  const validKeys = new Set<string>([...Object.keys(BASE_COLUMN_LABEL_BY_KEY), ...customColumns]);
  const next = prevOrder.filter((key) => validKeys.has(key));
  REQUIRED_BASE_COLUMN_KEYS.forEach((baseKey) => {
    if (!next.includes(baseKey)) {
      next.push(baseKey);
    }
  });
  customColumns.forEach((customKey) => {
    if (!next.includes(customKey)) {
      next.push(customKey);
    }
  });
  return next;
}

function getCellValue(student: TeacherClassStudent, column: SheetColumn) {
  if (column.fixed) {
    if (column.key === "ranking") {
      const ranking = Number(student.ranking);
      return Number.isFinite(ranking) && ranking > 0 ? String(ranking) : "";
    }
    return String((student as Record<string, unknown>)[column.key] || "");
  }
  return String(student.customValues?.[column.key] || "");
}

function applyCellValue(
  student: TeacherClassStudent,
  column: SheetColumn,
  value: string
): TeacherClassStudent {
  if (column.fixed) {
    if (column.key === "ranking") {
      const ranking = Number(value);
      return {
        ...student,
        ranking: Number.isFinite(ranking) && ranking > 0 ? ranking : undefined
      };
    }
    return {
      ...student,
      [column.key]: value
    } as TeacherClassStudent;
  }

  return {
    ...student,
    customValues: {
      ...(student.customValues || {}),
      [column.key]: value
    }
  };
}

export default function ClassesPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [classLists, setClassLists] = useState<TeacherClassList[]>([]);

  const [createClassName, setCreateClassName] = useState("");
  const [createBaseLabels, setCreateBaseLabels] = useState<Record<string, string>>(BASE_COLUMN_LABEL_BY_KEY);
  const [createColumnOrder, setCreateColumnOrder] = useState<string[]>(DEFAULT_BASE_COLUMNS.map((column) => column.key));
  const [createCustomColumns, setCreateCustomColumns] = useState<string[]>([]);
  const [createRows, setCreateRows] = useState<TeacherClassStudent[]>([
    createEmptyStudent([], 1)
  ]);
  const [createNewColumnLabel, setCreateNewColumnLabel] = useState("");
  const [createImportMode, setCreateImportMode] = useState<CreateImportMode>("manual");
  const [createManualRaw, setCreateManualRaw] = useState("");
  const [excelFileName, setExcelFileName] = useState("");
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<string[][]>([]);
  const [excelMapping, setExcelMapping] = useState<MappingTargetKey[]>([]);
  const [excelCustomColumns, setExcelCustomColumns] = useState<string[]>([]);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingMode, setMappingMode] = useState<SheetMode>("create");
  const [columnEditState, setColumnEditState] = useState<{
    mode: SheetMode;
    columnKey: string;
    currentLabel: string;
    nextLabel: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const [viewingClassId, setViewingClassId] = useState<string | null>(null);
  const [isModalEditing, setIsModalEditing] = useState(false);
  const [modalClassName, setModalClassName] = useState("");
  const [modalBaseLabels, setModalBaseLabels] = useState<Record<string, string>>(BASE_COLUMN_LABEL_BY_KEY);
  const [modalColumnOrder, setModalColumnOrder] = useState<string[]>(DEFAULT_BASE_COLUMNS.map((column) => column.key));
  const [modalCustomColumns, setModalCustomColumns] = useState<string[]>([]);
  const [modalRows, setModalRows] = useState<TeacherClassStudent[]>([]);
  const [modalNewColumnLabel, setModalNewColumnLabel] = useState("");
  const [modalExcelFileName, setModalExcelFileName] = useState("");
  const [modalExcelHeaders, setModalExcelHeaders] = useState<string[]>([]);
  const [modalExcelRows, setModalExcelRows] = useState<string[][]>([]);
  const [modalExcelMapping, setModalExcelMapping] = useState<MappingTargetKey[]>([]);
  const [modalExcelCustomColumns, setModalExcelCustomColumns] = useState<string[]>([]);
  const [modalStatus, setModalStatus] = useState("");

  const refreshClassLists = (ownerEmail: string) => {
    if (!ownerEmail) {
      setClassLists([]);
      return;
    }

    const sessions = loadGroupMatchingSessionsByOwner(ownerEmail);
    syncClassListsFromGroupSessions(ownerEmail, sessions);
    setClassLists(loadTeacherClassListsByOwner(ownerEmail));
  };

  useEffect(() => {
    const currentSession = getDemoSession();
    const email = currentSession?.role === "teacher" ? currentSession.email : "";
    const name = currentSession?.role === "teacher" ? currentSession.name || "" : "";

    setTeacherEmail(email);
    setTeacherName(name);
    refreshClassLists(email);
    setIsHydrated(true);
  }, []);

  const viewingClass = useMemo(
    () => classLists.find((classList) => classList.id === viewingClassId) || null,
    [classLists, viewingClassId]
  );

  const createColumns = useMemo(
    () => buildColumns(createColumnOrder, createCustomColumns, createBaseLabels),
    [createColumnOrder, createCustomColumns, createBaseLabels]
  );
  const modalColumns = useMemo(
    () => buildColumns(modalColumnOrder, modalCustomColumns, modalBaseLabels),
    [modalColumnOrder, modalCustomColumns, modalBaseLabels]
  );
  const viewingBaseLabels = useMemo(() => {
    if (!viewingClass) {
      return BASE_COLUMN_LABEL_BY_KEY;
    }
    const hasRanking = viewingClass.students.some((student) => Number(student.ranking) > 0);
    if (!hasRanking) {
      return {
        studentId: BASE_COLUMN_LABEL_BY_KEY.studentId,
        fullName: BASE_COLUMN_LABEL_BY_KEY.fullName,
        email: BASE_COLUMN_LABEL_BY_KEY.email
      };
    }
    return BASE_COLUMN_LABEL_BY_KEY;
  }, [viewingClass]);

  const resetCreateSheet = () => {
    setCreateClassName("");
    setCreateBaseLabels(BASE_COLUMN_LABEL_BY_KEY);
    setCreateColumnOrder(DEFAULT_BASE_COLUMNS.map((column) => column.key));
    setCreateCustomColumns([]);
    setCreateRows([createEmptyStudent([], 1)]);
    setCreateNewColumnLabel("");
    setCreateManualRaw("");
    setExcelFileName("");
    setExcelHeaders([]);
    setExcelRows([]);
    setExcelMapping([]);
    setExcelCustomColumns([]);
    setShowMappingModal(false);
    setMappingMode("create");
    setColumnEditState(null);
  };

  const setRowsByMode = (mode: SheetMode, rows: TeacherClassStudent[]) => {
    if (mode === "create") {
      setCreateRows(rows);
      return;
    }
    setModalRows(rows);
  };

  const setCustomColumnsByMode = (mode: SheetMode, columns: string[]) => {
    if (mode === "create") {
      setCreateCustomColumns(columns);
      setCreateColumnOrder((prev) => syncColumnOrder(prev, columns));
      setCreateRows((prev) => prev.map((row) => withCustomColumns(row, columns)));
      return;
    }

    setModalCustomColumns(columns);
    setModalColumnOrder((prev) => syncColumnOrder(prev, columns));
    setModalRows((prev) => prev.map((row) => withCustomColumns(row, columns)));
  };

  const addRow = (mode: SheetMode) => {
    if (mode === "create") {
      setCreateRows((prev) => [
        ...prev,
        createEmptyStudent(createCustomColumns, prev.length + 1)
      ]);
      return;
    }

    setModalRows((prev) => [
      ...prev,
      createEmptyStudent(modalCustomColumns, prev.length + 1)
    ]);
  };

  const removeRow = (mode: SheetMode, rowIndex: number) => {
    if (mode === "create") {
      setCreateRows((prev) => prev.filter((_, index) => index !== rowIndex));
      return;
    }
    setModalRows((prev) => prev.filter((_, index) => index !== rowIndex));
  };

  const updateCell = (mode: SheetMode, rowIndex: number, column: SheetColumn, value: string) => {
    const updater = (rows: TeacherClassStudent[]) =>
      rows.map((row, index) =>
        index === rowIndex ? applyCellValue(row, column, value) : row
      );

    if (mode === "create") {
      setCreateRows((prev) => updater(prev));
      return;
    }
    setModalRows((prev) => updater(prev));
  };

  const promptAndAddColumn = (mode: SheetMode) => {
    const labelInput = window.prompt("Nhập tên cột mới:");
    const label = String(labelInput || "").trim();
    if (!label) {
      return;
    }
    setStatusMessage("");
    setModalStatus("");

    const currentColumns = mode === "create" ? createCustomColumns : modalCustomColumns;
    if (currentColumns.some((column) => column.toLowerCase() === label.toLowerCase())) {
      if (mode === "create") {
        setStatusMessage("Cột này đã tồn tại.");
      } else {
        setModalStatus("Cột này đã tồn tại.");
      }
      return;
    }

    const fixedHit = DEFAULT_BASE_COLUMNS.some(
      (column) => column.label.toLowerCase() === label.toLowerCase()
    );
    if (fixedHit) {
      if (mode === "create") {
        setStatusMessage("Cột này đã nằm trong nhóm cột cố định.");
      } else {
        setModalStatus("Cột này đã nằm trong nhóm cột cố định.");
      }
      return;
    }

    setCustomColumnsByMode(mode, [...currentColumns, label]);
  };

  const addCustomColumnInline = (mode: SheetMode, rawLabel: string) => {
    const label = String(rawLabel || "").trim();
    if (!label) {
      if (mode === "create") {
        setStatusMessage("Vui lòng nhập tên cột trước khi thêm.");
      } else {
        setModalStatus("Vui lòng nhập tên cột trước khi thêm.");
      }
      return;
    }

    const currentColumns = mode === "create" ? createCustomColumns : modalCustomColumns;
    if (currentColumns.some((column) => column.toLowerCase() === label.toLowerCase())) {
      if (mode === "create") {
        setStatusMessage("Cột này đã tồn tại.");
      } else {
        setModalStatus("Cột này đã tồn tại.");
      }
      return;
    }

    const fixedHit = DEFAULT_BASE_COLUMNS.some(
      (column) => column.label.toLowerCase() === label.toLowerCase()
    );
    if (fixedHit) {
      if (mode === "create") {
        setStatusMessage("Cột này đã nằm trong nhóm cột cố định.");
      } else {
        setModalStatus("Cột này đã nằm trong nhóm cột cố định.");
      }
      return;
    }

    setCustomColumnsByMode(mode, [...currentColumns, label]);
    if (mode === "create") {
      setCreateNewColumnLabel("");
    } else {
      setModalNewColumnLabel("");
    }
  };

  const renameCustomColumn = (mode: SheetMode, column: SheetColumn) => {
    setColumnEditState({
      mode,
      columnKey: column.key,
      currentLabel: column.label,
      nextLabel: column.label
    });
  };

  const applyColumnRename = () => {
    if (!columnEditState) {
      return;
    }

    const { mode, columnKey, currentLabel, nextLabel } = columnEditState;
    const normalizedNextLabel = String(nextLabel || "").trim();
    if (!normalizedNextLabel) {
      if (mode === "create") {
        setStatusMessage("Tên cột không được để trống.");
      } else {
        setModalStatus("Tên cột không được để trống.");
      }
      return;
    }

    if (BASE_COLUMN_KEY_SET.has(columnKey)) {
      if (mode === "create") {
        setCreateBaseLabels((prev) => ({ ...prev, [columnKey]: normalizedNextLabel }));
      } else {
        setModalBaseLabels((prev) => ({ ...prev, [columnKey]: normalizedNextLabel }));
      }
      setColumnEditState(null);
      return;
    }

    const currentColumns = mode === "create" ? createCustomColumns : modalCustomColumns;
    const hasDuplicate = currentColumns.some(
      (column) => column !== currentLabel && column.toLowerCase() === normalizedNextLabel.toLowerCase()
    );
    if (hasDuplicate) {
      if (mode === "create") {
        setStatusMessage("Tên cột đã tồn tại.");
      } else {
        setModalStatus("Tên cột đã tồn tại.");
      }
      return;
    }

    const nextColumns = currentColumns.map((column) =>
      column === currentLabel ? normalizedNextLabel : column
    );
    const sourceRows = mode === "create" ? createRows : modalRows;
    const nextRows = sourceRows.map((row) => {
      const nextCustomValues = { ...(row.customValues || {}) };
      if (Object.prototype.hasOwnProperty.call(nextCustomValues, currentLabel)) {
        nextCustomValues[normalizedNextLabel] = String(nextCustomValues[currentLabel] || "");
        delete nextCustomValues[currentLabel];
      }
      return { ...row, customValues: nextCustomValues };
    });

    setCustomColumnsByMode(mode, nextColumns);
    setRowsByMode(mode, nextRows);
    setColumnEditState(null);
  };

  const deleteCustomColumn = () => {
    if (!columnEditState) {
      return;
    }
    const { mode, columnKey, currentLabel } = columnEditState;
    if (BASE_COLUMN_KEY_SET.has(columnKey)) {
      if (mode === "create") {
        setStatusMessage("Không thể xóa cột hệ thống.");
      } else {
        setModalStatus("Không thể xóa cột hệ thống.");
      }
      return;
    }
    const currentColumns = mode === "create" ? createCustomColumns : modalCustomColumns;
    const nextColumns = currentColumns.filter((column) => column !== currentLabel);
    const sourceRows = mode === "create" ? createRows : modalRows;
    const nextRows = sourceRows.map((row) => {
      const nextCustomValues = { ...(row.customValues || {}) };
      delete nextCustomValues[currentLabel];
      return { ...row, customValues: nextCustomValues };
    });
    setCustomColumnsByMode(mode, nextColumns);
    setRowsByMode(mode, nextRows);
    setColumnEditState(null);
  };

  const moveCustomColumn = (mode: SheetMode, columnKey: string, direction: "left" | "right") => {
    const currentColumns = mode === "create" ? createColumns : modalColumns;
    const index = currentColumns.findIndex((column) => column.key === columnKey);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentColumns.length) {
      return;
    }
    const nextColumns = [...currentColumns];
    const [picked] = nextColumns.splice(index, 1);
    nextColumns.splice(targetIndex, 0, picked);
    const nextOrder = nextColumns.map((column) => column.key);
    const nextCustomColumns = nextColumns
      .filter((column) => !BASE_COLUMN_KEY_SET.has(column.key))
      .map((column) => column.key);

    if (mode === "create") {
      setCreateColumnOrder(nextOrder);
      setCreateCustomColumns(nextCustomColumns);
      return;
    }
    setModalColumnOrder(nextOrder);
    setModalCustomColumns(nextCustomColumns);
  };

  const applyParsedSheet = (mode: SheetMode, rawText: string) => {
    const parsed = parseTeacherClassSheetText(rawText);
    if (parsed.students.length === 0) {
      if (mode === "create") {
        setStatusMessage("Kh�ng đọc được dữ liệu từ nội dung đ� d�n.");
      } else {
        setModalStatus("Kh�ng đọc được dữ liệu từ nội dung đ� d�n.");
      }
      return;
    }

    setCustomColumnsByMode(mode, parsed.customColumns);
    setRowsByMode(
      mode,
      parsed.students.map((student, index) => ({
        ...student,
        ranking: student.ranking || index + 1,
        customValues: {
          ...(student.customValues || {})
        }
      }))
    );

    if (mode === "create") {
      setStatusMessage("Đ� d�n dữ liệu từ Excel v�o bảng.");
    } else {
      setModalStatus("Đ� d�n dữ liệu từ Excel v�o bảng.");
    }
  };

  const pasteFromExcel = async (mode: SheetMode) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        applyParsedSheet(mode, text);
        return;
      }
    } catch {
      // Fallback below.
    }

    const manualText = window.prompt("D�n bảng dữ liệu từ Excel v�o đ�y:");
    if (!manualText) {
      return;
    }
    applyParsedSheet(mode, manualText);
  };

  const importManualTextToCreateSheet = () => {
    const parsed = parseTeacherClassSheetText(createManualRaw);
    if (parsed.students.length === 0) {
      setStatusMessage("Không đọc được dữ liệu từ nội dung nhập thủ công.");
      return;
    }
    setCreateCustomColumns(parsed.customColumns);
    setCreateRows(
      parsed.students.map((student, index) => ({
        ...student,
        ranking: student.ranking || index + 1,
        customValues: {
          ...(student.customValues || {})
        }
      }))
    );
    setStatusMessage("Đã nạp dữ liệu nhập thủ công vào bảng.");
  };

  const readExcelFileForMapping = async (file: File) => {
    const fileName = file.name || "sheet";
    const lowerName = fileName.toLowerCase();
    let rows: string[][] = [];

    if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv")) {
      const text = await file.text();
      rows = text
        .split(/\r?\n/)
        .map((line) =>
          (lowerName.endsWith(".tsv") ? line.split("\t") : line.split(",")).map((cell) =>
            String(cell || "").trim()
          )
        )
        .filter((line) => line.some((cell) => cell));
    } else {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      if (!worksheet) {
        throw new Error("File không có sheet dữ liệu.");
      }
      const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
        header: 1,
        raw: false
      });
      rows = matrix
        .map((line) => line.map((cell) => String(cell ?? "").trim()))
        .filter((line) => line.some((cell) => cell));
    }

    if (rows.length < 2) {
      throw new Error("File cần ít nhất 1 hàng tiêu đề và 1 hàng dữ liệu.");
    }

    const headerRowIndex = detectHeaderRowIndex(rows);
    const headers = (rows[headerRowIndex] || []).map((header, index) => header || `Cột ${index + 1}`);
    const dataRows = rows
      .slice(headerRowIndex + 1)
      .filter((line) => line.some((cell) => String(cell || "").trim()));
    const mapping: MappingTargetKey[] = headers.map((header) => inferImportTarget(header));

    if (dataRows.length === 0) {
      throw new Error("Không tìm thấy hàng dữ liệu bên dưới hàng tiêu đề trong file.");
    }

    return { fileName, headers, dataRows, mapping };
  };

  const handleExcelFileChange = async (mode: SheetMode, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (mode === "create") {
      setStatusMessage("");
    } else {
      setModalStatus("");
    }

    try {
      const { fileName, headers, dataRows, mapping } = await readExcelFileForMapping(file);
      if (mode === "create") {
        setExcelFileName(fileName);
        setExcelHeaders(headers);
        setExcelRows(dataRows);
        setExcelMapping(mapping);
        setExcelCustomColumns(headers.map(() => ""));
        setStatusMessage("Đã tải file. Bấm 'Ghép cột' để map dữ liệu.");
      } else {
        setModalExcelFileName(fileName);
        setModalExcelHeaders(headers);
        setModalExcelRows(dataRows);
        setModalExcelMapping(mapping);
        setModalExcelCustomColumns(headers.map(() => ""));
        setModalStatus("Đã tải file. Bấm 'Ghép cột' để map dữ liệu.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kh�ng th� �c file Excel. Vui l�ng ki�m tra �nh d�ng file.";
      if (mode === "create") {
        setStatusMessage(message);
      } else {
        setModalStatus(message);
      }
    } finally {
      event.target.value = "";
    }
  };

  const applyExcelMappingToSheet = (mode: SheetMode) => {
    const headers = mode === "create" ? excelHeaders : modalExcelHeaders;
    const sourceRows = mode === "create" ? excelRows : modalExcelRows;
    const mapping = mode === "create" ? excelMapping : modalExcelMapping;
    const customNameInputs = mode === "create" ? excelCustomColumns : modalExcelCustomColumns;
    const fileName = mode === "create" ? excelFileName : modalExcelFileName;

    if (headers.length === 0 || sourceRows.length === 0) {
      if (mode === "create") {
        setStatusMessage("Chưa có dữ liệu file để ghép cột.");
      } else {
        setModalStatus("Chưa có dữ liệu file để ghép cột.");
      }
      return;
    }

    const usedTargets = new Set<ImportTargetKey>();
    const customColumnsByIndex: string[] = headers.map(() => "");
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      const target = mapping[columnIndex] || "";
      if (!target) {
        continue;
      }
      if (target === "__custom__") {
        const customLabel = String(customNameInputs[columnIndex] || "").trim();
        if (!customLabel) {
          if (mode === "create") {
            setStatusMessage("Bạn cần nhập tên cho cột mới trước khi ghép.");
          } else {
            setModalStatus("Bạn cần nhập tên cho cột mới trước khi ghép.");
          }
          return;
        }
        customColumnsByIndex[columnIndex] = customLabel;
        continue;
      }
      if (usedTargets.has(target)) {
        if (mode === "create") {
          setStatusMessage("Mỗi cột hệ thống chỉ được ghép 1 lần.");
        } else {
          setModalStatus("Mỗi cột hệ thống chỉ được ghép 1 lần.");
        }
        return;
      }
      usedTargets.add(target);
    }

    if (!usedTargets.has("studentId") || !usedTargets.has("fullName")) {
      if (mode === "create") {
        setStatusMessage("Bạn cần ghép ít nhất MSSV và Họ và tên.");
      } else {
        setModalStatus("Bạn cần ghép ít nhất MSSV và Họ và tên.");
      }
      return;
    }

    const customColumns: string[] = [];
    const extraBaseColumns: string[] = [];
    if (usedTargets.has("avgScore")) {
      customColumns.push("Điểm TB");
    }
    if (usedTargets.has("ranking")) {
      extraBaseColumns.push("ranking");
    }
    customColumnsByIndex.forEach((label) => {
      if (!label) {
        return;
      }
      const dupSystem = Object.values(BASE_COLUMN_LABEL_BY_KEY).some(
        (systemLabel) => systemLabel.toLowerCase() === label.toLowerCase()
      );
      const dupCustom = customColumns.some((existing) => existing.toLowerCase() === label.toLowerCase());
      if (!dupSystem && !dupCustom) {
        customColumns.push(label);
      }
    });

    const rows: TeacherClassStudent[] = sourceRows.map((sourceRow, rowIndex) => {
      const student = createEmptyStudent(customColumns, rowIndex + 1);
      headers.forEach((_, columnIndex) => {
        const target = mapping[columnIndex] || "";
        if (!target) {
          return;
        }
        const value = String(sourceRow[columnIndex] ?? "").trim();
        if (target === "__custom__") {
          const customLabel = customColumnsByIndex[columnIndex];
          if (customLabel) {
            student.customValues = {
              ...(student.customValues || {}),
              [customLabel]: value
            };
          }
          return;
        }
        if (target === "studentId") {
          student.studentId = value;
          return;
        }
        if (target === "fullName") {
          student.fullName = value;
          return;
        }
        if (target === "email") {
          student.email = value;
          return;
        }
        if (target === "ranking") {
          const rank = Number(value);
          if (Number.isFinite(rank) && rank > 0) {
            student.ranking = rank;
          }
          return;
        }
        if (target === "avgScore") {
          student.customValues = {
            ...(student.customValues || {}),
            "Điểm TB": value
          };
        }
      });
      return student;
    }).filter((student) => {
      const id = String(student.studentId || "").trim();
      const name = String(student.fullName || "").trim();
      const email = String(student.email || "").trim();
      // Skip accidental repeated header rows.
      if (
        normalizeKey(id) === "mssv" &&
        normalizeKey(name) === "ho va ten" &&
        normalizeKey(email) === "email"
      ) {
        return false;
      }
      return true;
    });

    const normalized = normalizeRowsForStorage(rows, customColumns);
    if (normalized.length === 0) {
      if (mode === "create") {
        setStatusMessage("Không có dòng hợp lệ sau khi ghép cột.");
      } else {
        setModalStatus("Không có dòng hợp lệ sau khi ghép cột.");
      }
      return;
    }

    if (mode === "create") {
      setCreateCustomColumns(customColumns);
      setCreateColumnOrder(
        syncColumnOrder(
          [...DEFAULT_BASE_COLUMNS.map((column) => column.key), ...extraBaseColumns, ...customColumns],
          customColumns
        )
      );
      setCreateRows(normalized);
      setStatusMessage(`Đã import ${normalized.length} sinh viên từ file ${fileName || "Excel"}.`);
    } else {
      setModalCustomColumns(customColumns);
      setModalColumnOrder(
        syncColumnOrder(
          [...DEFAULT_BASE_COLUMNS.map((column) => column.key), ...extraBaseColumns, ...customColumns],
          customColumns
        )
      );
      setModalRows(normalized);
      setModalStatus(`Đã import ${normalized.length} sinh viên từ file ${fileName || "Excel"}.`);
    }
    setShowMappingModal(false);
  };

  const openClassModal = (classList: TeacherClassList, editMode: boolean) => {
    setViewingClassId(classList.id);
    setIsModalEditing(editMode);
    setModalClassName(classList.className);
    setModalBaseLabels(BASE_COLUMN_LABEL_BY_KEY);
    setModalColumnOrder(DEFAULT_BASE_COLUMNS.map((column) => column.key));
    setModalCustomColumns(classList.customColumns || []);
    setModalRows(
      classList.students.map((student, index) => ({
        ...student,
        ranking: student.ranking || index + 1,
        customValues: {
          ...(student.customValues || {})
        }
      }))
    );
    setModalStatus("");
  };

  const saveCreateClassList = () => {
    if (!teacherEmail) {
      setStatusMessage("Kh�ng x�c định được t�i khoản Giảng vi�n hiện tại.");
      return;
    }

    const normalizedClassName = createClassName.trim();
    if (!normalizedClassName) {
      setStatusMessage("Vui lòng nhập tên lớp.");
      return;
    }

    const students = normalizeRowsForStorage(createRows, createCustomColumns);
    if (students.length === 0) {
      setStatusMessage("Danh s�ch lớp chưa c� d�ng hợp lệ (cần tối thiểu MSSV v� Họ t�n).");
      return;
    }

    const now = Date.now();
    const payload: TeacherClassList = {
      id: createTeacherClassListId(),
      ownerTeacherEmail: teacherEmail,
      ownerTeacherName: teacherName || teacherEmail.split("@")[0],
      className: normalizedClassName,
      students,
      customColumns: createCustomColumns,
      sourceSessionId: "",
      createdAt: now,
      updatedAt: now
    };

    const saved = upsertTeacherClassList(payload);
    if (!saved) {
      setStatusMessage("Kh�ng thể lưu danh s�ch lớp. Vui l�ng thử lại.");
      return;
    }

    setStatusMessage("Đ� tạo danh s�ch lớp mới.");
    resetCreateSheet();
    refreshClassLists(teacherEmail);
  };

  const saveModalClassList = () => {
    if (!viewingClass || !teacherEmail) {
      return;
    }

    const normalizedClassName = modalClassName.trim();
    if (!normalizedClassName) {
      setModalStatus("Vui lòng nhập tên lớp.");
      return;
    }

    const students = normalizeRowsForStorage(modalRows, modalCustomColumns);
    if (students.length === 0) {
      setModalStatus("Danh s�ch lớp chưa c� d�ng hợp lệ (cần tối thiểu MSSV v� Họ t�n).");
      return;
    }

    const payload: TeacherClassList = {
      ...viewingClass,
      className: normalizedClassName,
      students,
      customColumns: modalCustomColumns,
      updatedAt: Date.now()
    };

    const saved = upsertTeacherClassList(payload);
    if (!saved) {
      setModalStatus("Không thể lưu cập nhật. Vui lòng thử lại.");
      return;
    }

    setModalStatus("Đã lưu cập nhật.");
    setIsModalEditing(false);
    refreshClassLists(teacherEmail);
  };

  const deleteClass = (classList: TeacherClassList) => {
    const confirmed = window.confirm(`B�n c� ch�c mu�n x�a danh s�ch l�p "${classList.className}"?`);
    if (!confirmed) {
      return;
    }

    deleteTeacherClassList(classList.id);
    if (viewingClassId === classList.id) {
      setViewingClassId(null);
      setIsModalEditing(false);
    }
    setStatusMessage("Đ� x�a danh s�ch lớp.");
    refreshClassLists(teacherEmail);
  };

  const renderSheetTable = (
    mode: SheetMode,
    columns: SheetColumn[],
    rows: TeacherClassStudent[],
    isEditable: boolean
  ) => (
    <div className="class-sheet-wrap">
      <div className="class-sheet-scroll">
        <table className="class-table class-sheet-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={`${mode}-${column.key}`}>
                  {isEditable ? (
                    <div className="class-col-head">
                      <span>{column.label}</span>
                      <div className="class-col-head-actions">
                        <button
                          type="button"
                          className="class-col-btn"
                          onClick={() => moveCustomColumn(mode, column.key, "left")}
                          aria-label={`Di chuyển ${column.label} sang tr�i`}
                          disabled={columns.findIndex((item) => item.key === column.key) === 0}
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          className="class-col-btn"
                          onClick={() => moveCustomColumn(mode, column.key, "right")}
                          aria-label={`Di chuyển ${column.label} sang phải`}
                          disabled={
                            columns.findIndex((item) => item.key === column.key) === columns.length - 1
                          }
                        >
                          →
                        </button>
                        <button
                          type="button"
                          className="class-col-btn"
                          onClick={() => renameCustomColumn(mode, column)}
                          aria-label={`Đổi tên cột ${column.label}`}
                        >
                          Sửa
                        </button>
                      </div>
                    </div>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
              {isEditable ? <th>H�ng</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${mode}-row-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={`${mode}-cell-${rowIndex}-${column.key}`}>
                    {isEditable ? (
                      <input
                        className="class-cell-input"
                        value={getCellValue(row, column)}
                        onChange={(event) =>
                          updateCell(mode, rowIndex, column, event.target.value)
                        }
                        placeholder={column.label}
                      />
                    ) : (
                      getCellValue(row, column) || "-"
                    )}
                  </td>
                ))}
                {isEditable ? (
                  <td>
                    <button
                      type="button"
                      className="hero-secondary class-row-remove"
                      onClick={() => removeRow(mode, rowIndex)}
                    >
                      Xóa
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (!isHydrated) {
    return (
      <TeacherAuthGuard>
        <main className="section-page">
          <div className="site-shell">
            <section className="content-card">
              <h2>Đang tải dữ liệu lớp...</h2>
            </section>
          </div>
        </main>
      </TeacherAuthGuard>
    );
  }

  return (
    <TeacherAuthGuard>
      <main className="section-page">
        <div className="site-shell group-shell">
          <div className="section-head section-head-single">
            <div>
              <span className="section-eyebrow">Lớp của tôi</span>
              <h1 className="group-manage-page-title">Quản l� danh s�ch lớp đ� import.</h1>
            </div>
            <p>
              Tại đ�y bạn c� thể tạo mới, xem, sửa hoặc x�a danh s�ch lớp. C�c lớp đ� import từ phi�n game
              cũng sẽ tự động lưu về trang này.
            </p>
          </div>

          <section className="group-form-card">
            <h2>Import danh s�ch lớp mới</h2>

            <label className="field">
              <span>Tên lớp</span>
              <input
                className="text-input"
                value={createClassName}
                onChange={(event) => setCreateClassName(event.target.value)}
                placeholder="Ví dụ: SU26-BL2-DM2001"
              />
            </label>

            <div className="field">
              <span>Danh s�ch SV</span>
              <div className="class-import-mode-row">
                <button
                  type="button"
                  className={createImportMode === "manual" ? "hero-primary" : "hero-secondary"}
                  onClick={() => setCreateImportMode("manual")}
                >
                  Nhập thủ công
                </button>
                <button
                  type="button"
                  className={createImportMode === "excel" ? "hero-primary" : "hero-secondary"}
                  onClick={() => setCreateImportMode("excel")}
                >
                  Tải file Excel
                </button>
              </div>

              {createImportMode === "manual" ? (
                <div className="class-import-manual">
                  <textarea
                    className="text-input class-manual-input"
                    value={createManualRaw}
                    onChange={(event) => setCreateManualRaw(event.target.value)}
                    placeholder="Nhập theo dòng: MSSV, Họ tên, Email (tùy chọn), Thứ hạng (tùy chọn)"
                  />
                  <div className="group-action-row">
                    <button type="button" className="hero-secondary" onClick={importManualTextToCreateSheet}>
                      Nạp vào bảng
                    </button>
                  </div>
                </div>
              ) : (
                <div className="class-import-excel">
                  <label className="hero-secondary class-file-upload-btn">
                    Chọn file Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.tsv"
                      onChange={(event) => handleExcelFileChange("create", event)}
                      className="class-file-input-hidden"
                    />
                  </label>
                  {excelHeaders.length > 0 && excelRows.length > 0 ? (
                    <button
                      type="button"
                      className="hero-secondary class-map-btn"
                      onClick={() => setShowMappingModal(true)}
                    >
                      Ghép cột
                    </button>
                  ) : null}
                  {excelFileName ? <small className="hint-copy">� ch�n: {excelFileName}</small> : null}
                </div>
              )}
              {renderSheetTable("create", createColumns, createRows, true)}
              <div className="class-sheet-toolbar class-sheet-toolbar-bottom">
                <button type="button" className="hero-secondary" onClick={() => addRow("create")}>
                  Thêm dòng
                </button>
                <input
                  className="text-input class-col-input"
                  value={createNewColumnLabel}
                  onChange={(event) => setCreateNewColumnLabel(event.target.value)}
                  placeholder="Tên cột mới"
                />
                <button
                  type="button"
                  className="hero-secondary"
                  onClick={() => addCustomColumnInline("create", createNewColumnLabel)}
                >
                  Thêm cột
                </button>
              </div>
            </div>

            <div className="group-action-row">
              <button type="button" className="hero-primary" onClick={saveCreateClassList}>
                Tạo danh s�ch lớp
              </button>
            </div>

            {statusMessage ? <p className="group-status-note">{statusMessage}</p> : null}
          </section>

          <section className="content-card">
            <div className="group-action-row classes-list-head-row">
              <h2>Danh s�ch lớp ({classLists.length})</h2>
            </div>

            {classLists.length === 0 ? (
              <p>Chưa c� danh s�ch lớp n�o trong t�i khoản n�y.</p>
            ) : (
              <div className="classes-list-grid">
                {classLists.map((classList) => (
                  <article key={classList.id} className="classes-list-card">
                    <div className="feature-top">
                      <span className="section-eyebrow">{classList.students.length} SV</span>
                      <span className="feature-badge">{formatTimeLabel(classList.updatedAt)}</span>
                    </div>

                    <h3>{classList.className}</h3>
                    <p className="hint-copy">
                      {classList.sourceSessionId ? "Ngu�n: import t� phi�n game" : "Ngu�n: import th� c�ng"}
                    </p>

                    <div className="group-card-actions">
                      <button
                        type="button"
                        className="hero-secondary"
                        onClick={() => openClassModal(classList, false)}
                      >
                        Xem
                      </button>
                      <button
                        type="button"
                        className="hero-secondary"
                        onClick={() => openClassModal(classList, true)}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="hero-secondary group-danger"
                        onClick={() => deleteClass(classList)}
                      >
                        Xóa
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {viewingClass ? (
        <div className="group-modal-overlay" role="dialog" aria-modal="true">
          <article className="group-modal-card class-view-modal">
            <div className="group-modal-head">
              <div>
                {isModalEditing ? (
                  <input
                    className="text-input class-modal-title-input"
                    value={modalClassName}
                    onChange={(event) => setModalClassName(event.target.value)}
                    placeholder="Tên lớp"
                  />
                ) : (
                  <h3>{viewingClass.className}</h3>
                )}
                <p>{(isModalEditing ? modalRows : viewingClass.students).length} sinh vi�n</p>
              </div>
              <button
                type="button"
                className="hero-secondary"
                onClick={() => {
                  setViewingClassId(null);
                  setIsModalEditing(false);
                }}
              >
                Đóng
              </button>
            </div>

            {isModalEditing ? (
              <>
                <div className="class-sheet-toolbar class-sheet-toolbar-modal">
                  <label className="hero-secondary class-file-upload-btn">
                    Import từ Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.tsv"
                      onChange={(event) => handleExcelFileChange("modal", event)}
                      className="class-file-input-hidden"
                    />
                  </label>
                  {modalExcelHeaders.length > 0 && modalExcelRows.length > 0 ? (
                    <button
                      type="button"
                      className="hero-secondary class-map-btn"
                      onClick={() => {
                        setMappingMode("modal");
                        setShowMappingModal(true);
                      }}
                    >
                      Ghép cột
                    </button>
                  ) : null}
                  <button type="button" className="hero-secondary" onClick={() => addRow("modal")}>
                    Thêm dòng
                  </button>
                  <input
                    className="text-input class-col-input"
                    value={modalNewColumnLabel}
                    onChange={(event) => setModalNewColumnLabel(event.target.value)}
                    placeholder="Tên cột mới"
                  />
                  <button
                    type="button"
                    className="hero-secondary"
                    onClick={() => addCustomColumnInline("modal", modalNewColumnLabel)}
                  >
                    Thêm cột
                  </button>
                </div>
                {renderSheetTable("modal", modalColumns, modalRows, true)}
              </>
            ) : (
              renderSheetTable(
                "modal",
                buildColumns(
                  [
                    ...DEFAULT_BASE_COLUMNS.map((column) => column.key),
                    ...(viewingBaseLabels.ranking ? ["ranking"] : [])
                  ],
                  viewingClass.customColumns || [],
                  viewingBaseLabels
                ),
                viewingClass.students,
                false
              )
            )}

            {modalStatus ? <p className="group-status-note">{modalStatus}</p> : null}

            <div className="group-card-actions">
              {isModalEditing ? (
                <>
                  <button type="button" className="hero-primary" onClick={saveModalClassList}>
                    Lưu cập nhật
                  </button>
                  <button type="button" className="hero-secondary" onClick={() => setIsModalEditing(false)}>
                    Hủy
                  </button>
                </>
              ) : (
                <button type="button" className="hero-secondary" onClick={() => setIsModalEditing(true)}>
                  Sửa
                </button>
              )}

              <button
                type="button"
                className="hero-secondary group-danger"
                onClick={() => deleteClass(viewingClass)}
              >
                Xóa
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {showMappingModal ? (
        <div className="group-modal-overlay" role="dialog" aria-modal="true">
          <article className="group-modal-card class-mapping-modal">
            <div className="group-modal-head">
              <div>
                <h3>Ghép cột dữ liệu</h3>
                <p>Chọn ý nghĩa từng cột trong file để import vào hệ thống.</p>
              </div>
              <button type="button" className="hero-secondary" onClick={() => setShowMappingModal(false)}>
                Đóng
              </button>
            </div>

            <div className="class-mapping-grid">
              <div className="class-mapping-head">Cột trong file</div>
              <div className="class-mapping-head">Cột trên hệ thống</div>
              {(mappingMode === "create" ? excelHeaders : modalExcelHeaders).map((header, index) => (
                <div className="class-mapping-row" key={`${header}-${index}`}>
                  <strong>{header || `Cột ${index + 1}`}</strong>
                  <div className="class-mapping-target">
                    <select
                      className="text-input class-mapping-select"
                      value={(mappingMode === "create" ? excelMapping[index] : modalExcelMapping[index]) || ""}
                      onChange={(event) =>
                        mappingMode === "create"
                          ? setExcelMapping((prev) => {
                              const next = [...prev];
                              next[index] = event.target.value as MappingTargetKey;
                              return next;
                            })
                          : setModalExcelMapping((prev) => {
                              const next = [...prev];
                              next[index] = event.target.value as MappingTargetKey;
                              return next;
                            })
                      }
                    >
                      {IMPORT_TARGET_OPTIONS.map((option) => (
                        <option key={`${header}-${option.key || "skip"}`} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                      <option value="__custom__">+ Thêm cột mới</option>
                    </select>
                    {(mappingMode === "create" ? excelMapping[index] : modalExcelMapping[index]) === "__custom__" ? (
                      <input
                        className="text-input class-mapping-custom-input"
                        placeholder="Nhập tên cột mới"
                        value={
                          mappingMode === "create"
                            ? excelCustomColumns[index] || ""
                            : modalExcelCustomColumns[index] || ""
                        }
                        onChange={(event) =>
                          mappingMode === "create"
                            ? setExcelCustomColumns((prev) => {
                                const next = [...prev];
                                next[index] = event.target.value;
                                return next;
                              })
                            : setModalExcelCustomColumns((prev) => {
                                const next = [...prev];
                                next[index] = event.target.value;
                                return next;
                              })
                        }
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="group-card-actions">
              <button type="button" className="hero-primary" onClick={() => applyExcelMappingToSheet(mappingMode)}>
                X�c nhận gh�p cột
              </button>
              <button type="button" className="hero-secondary" onClick={() => setShowMappingModal(false)}>
                Hủy
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {columnEditState ? (
        <div className="group-modal-overlay" role="dialog" aria-modal="true">
          <article className="group-modal-card class-mapping-modal">
            <div className="group-modal-head">
              <div>
                <h3>Sửa cột</h3>
                <p>Đổi tên cột hoặc xóa cột ngay trong popup này.</p>
              </div>
              <button type="button" className="hero-secondary" onClick={() => setColumnEditState(null)}>
                Đóng
              </button>
            </div>

            <label className="field">
              <span>Tên cột mới</span>
              <input
                className="text-input"
                value={columnEditState.nextLabel}
                onChange={(event) =>
                  setColumnEditState((prev) =>
                    prev ? { ...prev, nextLabel: event.target.value } : prev
                  )
                }
              />
            </label>

            <div className="group-card-actions">
              <button type="button" className="hero-primary" onClick={applyColumnRename}>
                Lưu tên cột
              </button>
              <button
                type="button"
                className="hero-secondary group-danger"
                onClick={deleteCustomColumn}
              >
                Xóa cột
              </button>
            </div>
          </article>
        </div>
      ) : null}

    </TeacherAuthGuard>
  );
}
