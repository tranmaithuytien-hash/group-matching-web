import { normalizeEmail } from "./auth-storage";
import type { TeacherClassList } from "./class-lists";
import { repairMojibakeDeep } from "./text-normalize";
import {
  cloudGetTopicSessionByCode,
  cloudGetTopicSessionById,
  cloudLoadTopicSessionsByOwner,
  cloudUpsertTopicSession
} from "./topic-picker-cloud";

export const TOPIC_PICKER_STORAGE_KEY = "marveclass_topic_picker_sessions";

export type TopicPickerType = 1 | 2 | 3;
export type TopicSessionStatus = "preparing" | "running" | "completed";
export type TopicType1Stage = "pairing" | "group3" | "bidding" | "completed";

export type TopicStudent = {
  studentId: string;
  fullName: string;
  email?: string;
  scoreValue?: number;
};

export type TopicGroup = {
  id: string;
  memberStudentIds: string[];
  memberNames: string[];
  topic: string;
};

export type TopicWaveRequest = {
  fromStudentId: string;
  toStudentId: string;
  createdAt: number;
  status: "pending" | "accepted" | "rejected" | "draft_member3";
  approvalByStudentId?: Record<string, boolean>;
};

export type TopicBid = {
  groupId: string;
  topic: string;
  points: number;
  round: number;
};

export type Type1PenaltyKind = "none" | "no_bid_80_percent" | "bid_no_win_35_points";

export type Type1PenaltySummary = {
  kind: Type1PenaltyKind;
  basePoints: number;
  deductedPoints: number;
  finalPoints: number;
};

export type TopicRoomMessage = {
  id: string;
  topic: string;
  studentId: string;
  studentName: string;
  text: string;
  createdAt: number;
};

export type TopicSession = {
  id: string;
  stateVersion?: number;
  classCode: string;
  ownerTeacherEmail: string;
  ownerTeacherName?: string;
  subjectName: string;
  classListId: string;
  className: string;
  topics: string[];
  topicCount: number;
  groupsOf2: number;
  groupsOf3: number;
  type: TopicPickerType;
  scoreColumn?: string;
  students: TopicStudent[];
  credentialsByStudentId: Record<string, string>;
  finalGroups: TopicGroup[];
  status: TopicSessionStatus;

  type1Stage?: TopicType1Stage;
  type1PairingDurationMinutes?: number;
  type1PairingEndsAt?: number;
  type1Group3EndsAt?: number;
  type1RoundEndsAt?: number;
  workingGroups?: TopicGroup[];
  waveRequests?: TopicWaveRequest[];
  biddingRound?: number;
  bidRecords?: TopicBid[];
  groupRemainingPoints?: Record<string, number>;
  type1BidDraftByGroupId?: Record<string, { topic: string; points: number; round: number; leaderStudentId: string; updatedAt: number }>;
  type1BidApprovalsByGroupId?: Record<string, Record<string, boolean>>;
  type1GroupChatByGroupId?: Record<string, { id: string; studentId: string; studentName: string; text: string; createdAt: number }[]>;
  type1Keep2DraftByGroupId?: Record<string, { approvalByStudentId: Record<string, boolean>; createdAt: number }>;
  type1LockedGroupIds?: string[];
  type1KeptGroup2Count?: number;
  type1PenaltyPoints?: number;
  type1PenalizedGroupIds?: string[];
  type1TopRemainingGroupId?: string;
  type1PenaltySummaryByGroupId?: Record<string, Type1PenaltySummary>;

  topic2RoomMembers?: Record<string, string[]>;
  topic2LockedTopics?: string[];
  topic2MessagesByTopic?: Record<string, TopicRoomMessage[]>;
  topic2AgreementByTopic?: Record<string, Record<string, boolean>>;
  topic2LockSourceByTopic?: Record<string, string>;
  topic2DurationMinutes?: number;
  topic2EndsAt?: number;
  topic2FinalizedAt?: number;
  actionLogs?: Array<{ at: number; action: string; detail?: string }>;

  createdAt: number;
  updatedAt: number;
};

function hasWindow() {
  return typeof window !== "undefined";
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = next[i];
    next[i] = next[j];
    next[j] = temp;
  }
  return next;
}

function mapGroupNames(session: TopicSession, memberStudentIds: string[]) {
  return memberStudentIds.map((id) => session.students.find((s) => s.studentId === id)?.fullName || id);
}

function getStudentGroup(session: TopicSession, studentId: string) {
  return (session.workingGroups || []).find((group) => group.memberStudentIds.includes(studentId)) || null;
}

function getGroupTargetSize(session: TopicSession, groupId: string) {
  const groups = session.workingGroups || [];
  const index = groups.findIndex((item) => item.id === groupId);
  if (index < 0) {
    return 2;
  }
  return index < session.groupsOf3 ? 3 : 2;
}

function countType1GroupsOf3(session: TopicSession) {
  return (session.workingGroups || []).filter((group) => group.memberStudentIds.length >= 3).length;
}

export function getType1GroupLeaderId(session: TopicSession, groupId: string) {
  const group = (session.workingGroups || []).find((item) => item.id === groupId);
  if (!group) return "";
  const scored = group.memberStudentIds.map((id) => ({
    id,
    score: session.students.find((s) => s.studentId === id)?.scoreValue || 0
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id || "";
}

export function computeGroupStructure(studentCount: number, topicCount: number) {
  const safeStudents = Math.max(0, Number(studentCount) || 0);
  const safeTopics = Math.max(1, Number(topicCount) || 1);
  if (safeStudents < safeTopics * 2 || safeStudents > safeTopics * 3) {
    return {
      ok: false as const,
      groupsOf2: 0,
      groupsOf3: 0,
      message: "Không thể chia để mỗi nhóm có 2-3 SV. Hãy điều chỉnh số chủ đề."
    };
  }

  const groupsOf3 = safeStudents % safeTopics;
  const groupsOf2 = safeTopics - groupsOf3;
  return {
    ok: true as const,
    groupsOf2,
    groupsOf3,
    message: `${groupsOf2} nhóm 2 TV + ${groupsOf3} nhóm 3 TV`
  };
}

function normalizeSession(raw: Partial<TopicSession>) {
  return {
    id: String(raw.id || "").trim(),
    stateVersion: Math.max(0, Number(raw.stateVersion) || 0),
    classCode: String(raw.classCode || "").trim().toUpperCase(),
    ownerTeacherEmail: normalizeEmail(String(raw.ownerTeacherEmail || "")),
    ownerTeacherName: String(raw.ownerTeacherName || "").trim(),
    subjectName: String(raw.subjectName || "").trim(),
    classListId: String(raw.classListId || "").trim(),
    className: String(raw.className || "").trim(),
    topics: Array.isArray(raw.topics) ? raw.topics.map((item) => String(item || "").trim()).filter(Boolean) : [],
    topicCount: Math.max(1, Number(raw.topicCount) || 1),
    groupsOf2: Math.max(0, Number(raw.groupsOf2) || 0),
    groupsOf3: Math.max(0, Number(raw.groupsOf3) || 0),
    type: raw.type === 1 || raw.type === 2 || raw.type === 3 ? raw.type : 3,
    scoreColumn: String(raw.scoreColumn || "").trim(),
    students: Array.isArray(raw.students)
      ? raw.students.map((student) => ({
          studentId: String(student.studentId || "").trim(),
          fullName: String(student.fullName || "").trim(),
          email: String(student.email || "").trim(),
          scoreValue: Number(student.scoreValue) || 0
        }))
      : [],
    credentialsByStudentId: raw.credentialsByStudentId || {},
    finalGroups: Array.isArray(raw.finalGroups)
      ? raw.finalGroups.map((group) => ({
          id: String(group.id || "").trim(),
          memberStudentIds: Array.isArray(group.memberStudentIds) ? group.memberStudentIds.map(String) : [],
          memberNames: Array.isArray(group.memberNames) ? group.memberNames.map(String) : [],
          topic: String(group.topic || "").trim()
        }))
      : [],
    status: raw.status === "preparing" || raw.status === "running" || raw.status === "completed" ? raw.status : "preparing",
    type1Stage: raw.type1Stage || "pairing",
    type1PairingDurationMinutes: Math.max(1, Number(raw.type1PairingDurationMinutes) || 10),
    type1PairingEndsAt: Number(raw.type1PairingEndsAt) || 0,
    type1Group3EndsAt: Number(raw.type1Group3EndsAt) || 0,
    type1RoundEndsAt: Number(raw.type1RoundEndsAt) || 0,
    workingGroups: Array.isArray(raw.workingGroups)
      ? raw.workingGroups.map((group) => ({
          id: String(group.id || "").trim(),
          memberStudentIds: Array.isArray(group.memberStudentIds) ? group.memberStudentIds.map(String) : [],
          memberNames: Array.isArray(group.memberNames) ? group.memberNames.map(String) : [],
          topic: String(group.topic || "").trim()
        }))
      : [],
    waveRequests: Array.isArray(raw.waveRequests)
      ? raw.waveRequests.map((item) => ({
          fromStudentId: String(item.fromStudentId || "").trim(),
          toStudentId: String(item.toStudentId || "").trim(),
          createdAt: Number(item.createdAt) || Date.now(),
          status:
            item.status === "accepted" || item.status === "rejected" || item.status === "draft_member3"
              ? item.status
              : "pending",
          approvalByStudentId: item.approvalByStudentId || {}
        }))
      : [],
    biddingRound: Math.max(1, Number(raw.biddingRound) || 1),
    bidRecords: Array.isArray(raw.bidRecords)
      ? raw.bidRecords.map((item) => ({
          groupId: String(item.groupId || "").trim(),
          topic: String(item.topic || "").trim(),
          points: Math.max(0, Number(item.points) || 0),
          round: Math.max(1, Number(item.round) || 1)
        }))
      : [],
    groupRemainingPoints: raw.groupRemainingPoints || {},
    type1BidDraftByGroupId: raw.type1BidDraftByGroupId || {},
    type1BidApprovalsByGroupId: raw.type1BidApprovalsByGroupId || {},
    type1GroupChatByGroupId: raw.type1GroupChatByGroupId || {},
    type1Keep2DraftByGroupId: raw.type1Keep2DraftByGroupId || {},
    type1LockedGroupIds: Array.isArray(raw.type1LockedGroupIds) ? raw.type1LockedGroupIds.map(String) : [],
    type1KeptGroup2Count: Math.max(0, Number(raw.type1KeptGroup2Count) || 0),
    type1PenaltyPoints: Math.max(0, Number(raw.type1PenaltyPoints) || 35),
    type1PenalizedGroupIds: Array.isArray(raw.type1PenalizedGroupIds) ? raw.type1PenalizedGroupIds.map(String) : [],
    type1TopRemainingGroupId: String(raw.type1TopRemainingGroupId || "").trim(),
    type1PenaltySummaryByGroupId: raw.type1PenaltySummaryByGroupId || {},
    topic2RoomMembers: raw.topic2RoomMembers || {},
    topic2LockedTopics: Array.isArray(raw.topic2LockedTopics) ? raw.topic2LockedTopics.map(String) : [],
    topic2MessagesByTopic: raw.topic2MessagesByTopic || {},
    topic2AgreementByTopic: raw.topic2AgreementByTopic || {},
    topic2LockSourceByTopic: raw.topic2LockSourceByTopic || {},
    topic2DurationMinutes: Math.max(1, Number(raw.topic2DurationMinutes) || 10),
    topic2EndsAt: Number(raw.topic2EndsAt) || 0,
    topic2FinalizedAt: Number(raw.topic2FinalizedAt) || 0,
    actionLogs: Array.isArray(raw.actionLogs)
      ? raw.actionLogs.map((log) => ({
          at: Number(log.at) || Date.now(),
          action: String(log.action || "").trim(),
          detail: String(log.detail || "").trim()
        }))
      : [],
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now()
  } as TopicSession;
}

export function appendTopicSessionLog(session: TopicSession, action: string, detail = "") {
  return {
    ...session,
    actionLogs: [
      ...(session.actionLogs || []),
      {
        at: Date.now(),
        action: action.trim(),
        detail: detail.trim()
      }
    ].slice(-300)
  } as TopicSession;
}

export function loadTopicSessions() {
  if (!hasWindow()) {
    return [] as TopicSession[];
  }
  const raw = window.localStorage.getItem(TOPIC_PICKER_STORAGE_KEY);
  if (!raw) {
    return [] as TopicSession[];
  }
  try {
    const parsed = repairMojibakeDeep(JSON.parse(raw));
    if (!Array.isArray(parsed)) {
      return [] as TopicSession[];
    }
    return parsed.map((item) => normalizeSession(item)).filter((item) => item.id && item.classCode);
  } catch {
    return [] as TopicSession[];
  }
}

export function saveTopicSessions(sessions: TopicSession[]) {
  if (!hasWindow()) {
    return;
  }
  window.localStorage.setItem(TOPIC_PICKER_STORAGE_KEY, JSON.stringify(sessions.map(normalizeSession)));
}

export function loadTopicSessionsByOwner(ownerTeacherEmail: string) {
  const normalized = normalizeEmail(ownerTeacherEmail);
  return loadTopicSessions()
    .filter((session) => normalizeEmail(session.ownerTeacherEmail) === normalized)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createTopicSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `topic-${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

export function createUniqueTopicClassCode(existingCodes: string[]) {
  const codeSet = new Set(existingCodes.map((code) => code.toUpperCase()));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let loop = 0; loop < 5000; loop += 1) {
    let value = "";
    for (let i = 0; i < 6; i += 1) {
      value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!codeSet.has(value)) {
      return value;
    }
  }
  return `TP${Date.now().toString().slice(-4)}`;
}

export function upsertTopicSession(payload: TopicSession, options?: { force?: boolean }) {
  let normalized = normalizeSession(payload);
  const current = loadTopicSessions();
  const existing = current.find((item) => item.id === normalized.id) || null;
  if (existing) {
    const force = Boolean(options?.force);
    // Optimistic concurrency: only allow updates from the latest known version.
    if (!force && (normalized.stateVersion || 0) !== (existing.stateVersion || 0)) {
      return existing;
    }
    normalized = normalizeSession({
      ...normalized,
      updatedAt: Math.max(normalized.updatedAt || 0, (existing.updatedAt || 0) + 1),
      stateVersion: (existing.stateVersion || 0) + 1
    });
  } else {
    normalized = normalizeSession({
      ...normalized,
      stateVersion: Math.max(1, normalized.stateVersion || 0)
    });
  }
  const exists = Boolean(existing);
  const next = exists ? current.map((item) => (item.id === normalized.id ? normalized : item)) : [normalized, ...current];
  saveTopicSessions(next);
  void cloudUpsertTopicSession(normalized);
  return normalized;
}

export function forceReplaceTopicSession(payload: TopicSession) {
  let normalized = normalizeSession(payload);
  const current = loadTopicSessions();
  const existing = current.find((item) => item.id === normalized.id) || null;
  if (existing) {
    normalized = normalizeSession({
      ...normalized,
      updatedAt: Math.max(normalized.updatedAt || 0, (existing.updatedAt || 0) + 1),
      stateVersion: Math.max((existing.stateVersion || 0) + 1, (normalized.stateVersion || 0) + 1)
    });
  } else {
    normalized = normalizeSession({
      ...normalized,
      stateVersion: Math.max(1, normalized.stateVersion || 0)
    });
  }
  const exists = current.some((item) => item.id === normalized.id);
  const next = exists ? current.map((item) => (item.id === normalized.id ? normalized : item)) : [normalized, ...current];
  saveTopicSessions(next);
  void cloudUpsertTopicSession(normalized);
  return normalized;
}

export function resetTopicSessionById(sessionId: string) {
  const sessions = loadTopicSessions();
  const current = sessions.find((item) => item.id === sessionId) || null;
  if (!current) return null;
  const resetAt = Math.max(Date.now(), (current.updatedAt || 0) + 1);
  const reset: TopicSession = normalizeSession({
    ...current,
    status: "preparing",
    type1Stage: current.type === 1 ? "pairing" : current.type1Stage,
    finalGroups: [],
    workingGroups: [],
    waveRequests: [],
    credentialsByStudentId: {},
    biddingRound: 1,
    bidRecords: [],
    groupRemainingPoints: {},
    type1BidDraftByGroupId: {},
    type1BidApprovalsByGroupId: {},
    type1Keep2DraftByGroupId: {},
    type1LockedGroupIds: [],
    type1KeptGroup2Count: 0,
    topic2RoomMembers: {},
    topic2LockedTopics: [],
    topic2MessagesByTopic: {},
    topic2AgreementByTopic: {},
    topic2LockSourceByTopic: {},
    topic2EndsAt: 0,
    topic2FinalizedAt: 0,
    type1PairingEndsAt: 0,
    type1Group3EndsAt: 0,
    type1RoundEndsAt: 0,
    type1PenaltyPoints: 35,
    type1PenalizedGroupIds: [],
    type1TopRemainingGroupId: "",
    type1PenaltySummaryByGroupId: {},
    updatedAt: resetAt,
    stateVersion: Math.max((current.stateVersion || 0) + 1, 1),
    actionLogs: [{ at: Date.now(), action: "Reset game", detail: "Xóa dữ liệu lượt cũ, đưa phiên về trạng thái chuẩn bị" }]
  });
  const next = sessions.map((item) => (item.id === sessionId ? reset : item));
  saveTopicSessions(next);
  void cloudUpsertTopicSession(reset);
  return reset;
}

export function getTopicSessionById(sessionId: string) {
  return loadTopicSessions().find((session) => session.id === sessionId) || null;
}

export function getTopicSessionByRouteKey(sessionKey: string) {
  const clean = String(sessionKey || "").trim();
  if (!clean) return null;
  const sessions = loadTopicSessions();
  const byId = sessions.find((session) => session.id === clean) || null;
  if (byId) return byId;
  const normalizedCode = clean.toUpperCase();
  return sessions
    .filter((session) => session.classCode === normalizedCode)
    .sort((a, b) => (b.stateVersion || 0) - (a.stateVersion || 0) || b.updatedAt - a.updatedAt)[0] || null;
}

export async function getTopicSessionByRouteKeyAny(sessionKey: string) {
  const local = getTopicSessionByRouteKey(sessionKey);
  const clean = String(sessionKey || "").trim();
  if (!clean) return null;
  const byId = await getTopicSessionByIdAny(clean);
  const byCode = byId ? null : await getTopicSessionByCodeAny(clean.toUpperCase());
  const remote = byId || byCode;
  if (remote && local) {
    return (Number(remote.updatedAt) || 0) >= (Number(local.updatedAt) || 0) ? remote : local;
  }
  if (remote) return remote;
  if (local) return local;
  return null;
}

export function getTopicSessionByCode(classCode: string) {
  const normalized = classCode.trim().toUpperCase();
  return loadTopicSessions()
    .filter((session) => session.classCode === normalized)
    .sort((a, b) => (b.stateVersion || 0) - (a.stateVersion || 0) || b.updatedAt - a.updatedAt)[0] || null;
}

export function removeTopicSession(sessionId: string) {
  const next = loadTopicSessions().filter((session) => session.id !== sessionId);
  saveTopicSessions(next);
}

export async function getTopicSessionByIdAny(sessionId: string) {
  const local = getTopicSessionById(sessionId);
  const cloud = await cloudGetTopicSessionById(sessionId);
  if (cloud && local) {
    const picked = (Number(cloud.updatedAt) || 0) >= (Number(local.updatedAt) || 0) ? cloud : local;
    if (picked === cloud) upsertTopicSession(cloud, { force: true });
    return picked;
  }
  if (cloud) {
    upsertTopicSession(cloud, { force: true });
    return cloud;
  }
  if (local) return local;
  return null;
}

export async function getTopicSessionByCodeAny(classCode: string) {
  const local = getTopicSessionByCode(classCode);
  const cloud = await cloudGetTopicSessionByCode(classCode);
  if (cloud && local) {
    const picked = (Number(cloud.updatedAt) || 0) >= (Number(local.updatedAt) || 0) ? cloud : local;
    if (picked === cloud) upsertTopicSession(cloud, { force: true });
    return picked;
  }
  if (cloud) {
    upsertTopicSession(cloud, { force: true });
    return cloud;
  }
  if (local) return local;
  return null;
}

export async function loadTopicSessionsByOwnerAny(ownerTeacherEmail: string) {
  const local = loadTopicSessionsByOwner(ownerTeacherEmail);
  if (local.length > 0) return local;
  const cloud = await cloudLoadTopicSessionsByOwner(ownerTeacherEmail);
  if (cloud.length > 0) {
    const merged = loadTopicSessions();
    const map = new Map(merged.map((item) => [item.id, item]));
    cloud.forEach((item) => {
      map.set(item.id, normalizeSession(item));
    });
    saveTopicSessions(Array.from(map.values()));
  }
  return cloud;
}

export function mapStudentsFromClassList(classList: TeacherClassList, scoreColumn: string) {
  return classList.students.map((student) => {
    const rawScore = scoreColumn === "ranking" ? String(student.ranking || 0) : String(student.customValues?.[scoreColumn] ?? "");
    const score = Number(rawScore.replace(",", "."));
    return {
      studentId: student.studentId,
      fullName: student.fullName,
      email: student.email || "",
      scoreValue: Number.isFinite(score) ? score : 0
    } as TopicStudent;
  });
}

export function startTopicSession(session: TopicSession) {
  const now = Date.now();
  const durationMs = Math.max(1, Number(session.topic2DurationMinutes) || 10) * 60 * 1000;
  const type1DurationMs = Math.max(1, Number(session.type1PairingDurationMinutes) || 10) * 60 * 1000;
  const next: TopicSession = {
    ...session,
    status: "running",
    type1Stage: session.type === 1 ? "pairing" : session.type1Stage,
    type1PairingEndsAt: session.type === 1 ? now + type1DurationMs : session.type1PairingEndsAt || 0,
    topic2RoomMembers: session.topic2RoomMembers || {},
    topic2LockedTopics: session.topic2LockedTopics || [],
    topic2EndsAt: session.type === 2 ? now + durationMs : session.topic2EndsAt || 0,
    topic2FinalizedAt: session.type === 2 ? 0 : session.topic2FinalizedAt || 0,
    updatedAt: now
  };
  return upsertTopicSession(next);
}

export function cancelWave(session: TopicSession, fromStudentId: string, toStudentId: string) {
  if (session.type !== 1 || session.type1Stage !== "pairing") {
    return session;
  }
  return upsertTopicSession({
    ...session,
    waveRequests: (session.waveRequests || []).filter(
      (item) => !(item.fromStudentId === fromStudentId && item.toStudentId === toStudentId && item.status === "pending")
    ),
    updatedAt: Date.now()
  });
}

export function runRandomFullAssignment(session: TopicSession) {
  const students = shuffle(session.students);
  const topics = shuffle(session.topics.slice(0, session.topicCount));
  const finalGroups: TopicGroup[] = [];
  let cursor = 0;

  const sizes = [...Array.from({ length: session.groupsOf3 }).map(() => 3), ...Array.from({ length: session.groupsOf2 }).map(() => 2)];

  sizes.forEach((size, index) => {
    const members = students.slice(cursor, cursor + size);
    cursor += size;
    finalGroups.push({
      id: `g${index + 1}`,
      memberStudentIds: members.map((item) => item.studentId),
      memberNames: members.map((item) => item.fullName),
      topic: topics[index] || `Chu de ${index + 1}`
    });
  });

  return upsertTopicSession({ ...session, finalGroups, status: "completed", updatedAt: Date.now() });
}

export function sendWave(session: TopicSession, fromStudentId: string, toStudentId: string) {
  if (session.type !== 1 || session.type1Stage !== "pairing") {
    return session;
  }
  if (session.type1PairingEndsAt && Date.now() >= session.type1PairingEndsAt) {
    return session;
  }
  if (fromStudentId === toStudentId || getStudentGroup(session, fromStudentId) || getStudentGroup(session, toStudentId)) {
    return session;
  }

  const exists = (session.waveRequests || []).some(
    (item) => item.fromStudentId === fromStudentId && item.toStudentId === toStudentId && item.status === "pending"
  );
  if (exists) {
    return session;
  }
  const outgoingPendingCount = (session.waveRequests || []).filter(
    (item) => item.fromStudentId === fromStudentId && item.status === "pending"
  ).length;
  if (outgoingPendingCount >= 1) {
    return session;
  }

  return upsertTopicSession({
    ...session,
    waveRequests: [
      ...(session.waveRequests || []),
      { fromStudentId, toStudentId, createdAt: Date.now(), status: "pending" }
    ],
    updatedAt: Date.now()
  });
}

export function respondWave(session: TopicSession, toStudentId: string, fromStudentId: string, accept: boolean) {
  if (session.type !== 1 || session.type1Stage !== "pairing") {
    return session;
  }
  if (session.type1PairingEndsAt && Date.now() >= session.type1PairingEndsAt) {
    return session;
  }

  const nextRequests = (session.waveRequests || []).map((item) => {
    if (item.toStudentId === toStudentId && item.fromStudentId === fromStudentId && item.status === "pending") {
      return { ...item, status: (accept ? "accepted" : "rejected") as "accepted" | "rejected" };
    }
    return item;
  });

  let nextGroups = [...(session.workingGroups || [])];
  if (accept && !getStudentGroup(session, toStudentId) && !getStudentGroup(session, fromStudentId)) {
    nextGroups.push({
      id: `g${nextGroups.length + 1}`,
      memberStudentIds: [fromStudentId, toStudentId],
      memberNames: mapGroupNames(session, [fromStudentId, toStudentId]),
      topic: ""
    });
  }
  const normalizedRequests = accept
    ? nextRequests.map((item) => {
        if (item.status !== "pending") return item;
        const involved =
          item.fromStudentId === fromStudentId ||
          item.toStudentId === fromStudentId ||
          item.fromStudentId === toStudentId ||
          item.toStudentId === toStudentId;
        return involved ? { ...item, status: "rejected" as const } : item;
      })
    : nextRequests;

  return upsertTopicSession({ ...session, waveRequests: normalizedRequests, workingGroups: nextGroups, updatedAt: Date.now() });
}

export function sendGroup3Wave(session: TopicSession, fromStudentId: string, leaderStudentId: string) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  if (session.type1Group3EndsAt && Date.now() >= session.type1Group3EndsAt) return session;
  if (fromStudentId === leaderStudentId) return session;
  const fromGroup = getStudentGroup(session, fromStudentId);
  if (fromGroup) return session;
  const leaderGroup = (session.workingGroups || []).find((group) => getType1GroupLeaderId(session, group.id) === leaderStudentId);
  if (!leaderGroup || leaderGroup.memberStudentIds.length !== 2) return session;
  const exists = (session.waveRequests || []).some(
    (item) => item.fromStudentId === fromStudentId && item.toStudentId === leaderStudentId && item.status === "pending"
  );
  if (exists) return session;
  const outgoingPendingCount = (session.waveRequests || []).filter(
    (item) => item.fromStudentId === fromStudentId && item.status === "pending"
  ).length;
  if (outgoingPendingCount >= 1) return session;
  return upsertTopicSession({
    ...session,
    waveRequests: [
      ...(session.waveRequests || []),
      { fromStudentId, toStudentId: leaderStudentId, createdAt: Date.now(), status: "pending" }
    ],
    updatedAt: Date.now()
  });
}

export function respondGroup3Wave(session: TopicSession, leaderStudentId: string, fromStudentId: string, accept: boolean) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  if (session.type1Group3EndsAt && Date.now() >= session.type1Group3EndsAt) return session;
  const leaderGroup = (session.workingGroups || []).find((group) => getType1GroupLeaderId(session, group.id) === leaderStudentId);
  const fromAsLeaderGroup = (session.workingGroups || []).find(
    (group) => getType1GroupLeaderId(session, group.id) === fromStudentId
  );
  const resolvedLeaderId = leaderGroup ? leaderStudentId : fromAsLeaderGroup ? fromStudentId : "";
  const candidateStudentId = resolvedLeaderId === leaderStudentId ? fromStudentId : leaderStudentId;
  const resolvedLeaderGroup = leaderGroup || fromAsLeaderGroup;
  if (!resolvedLeaderId || !resolvedLeaderGroup || resolvedLeaderGroup.memberStudentIds.length !== 2) return session;
  if (getStudentGroup(session, candidateStudentId)) {
    return session;
  }

  const nextRequests = (session.waveRequests || []).map((item) => {
    const isMatched =
      item.status === "pending" &&
      ((item.toStudentId === resolvedLeaderId && item.fromStudentId === candidateStudentId) ||
        (item.toStudentId === candidateStudentId && item.fromStudentId === resolvedLeaderId));
    if (isMatched) {
      return { ...item, status: (accept ? "accepted" : "rejected") as "accepted" | "rejected" };
    }
    return item;
  });

  let nextGroups = [...(session.workingGroups || [])];
  if (accept) {
    const currentGroup3 = countType1GroupsOf3(session);
    if (currentGroup3 >= session.groupsOf3) {
      return upsertTopicSession({ ...session, waveRequests: nextRequests, updatedAt: Date.now() });
    }
    const senderGroup = getStudentGroup(session, candidateStudentId);
    if (senderGroup) {
      return upsertTopicSession({ ...session, waveRequests: nextRequests, updatedAt: Date.now() });
    }
    nextGroups = nextGroups.map((group) =>
      group.id === resolvedLeaderGroup.id
        ? {
            ...group,
            memberStudentIds: [...group.memberStudentIds, candidateStudentId],
            memberNames: mapGroupNames(session, [...group.memberStudentIds, candidateStudentId])
          }
        : group
    );
  }

  return upsertTopicSession({
    ...session,
    waveRequests: nextRequests,
    workingGroups: nextGroups,
    updatedAt: Date.now()
  });
}

export function teacherMoveType1ToGroup3(session: TopicSession) {
  if (session.type !== 1) return session;
  if (session.type1Stage !== "pairing") return session;
  const pairCount = (session.workingGroups || []).filter((group) => group.memberStudentIds.length === 2).length;
  if (pairCount < session.groupsOf3) return session;
  return upsertTopicSession({
    ...session,
    type1Stage: "group3",
    type1Group3EndsAt: Date.now() + 5 * 60 * 1000,
    updatedAt: Date.now()
  });
}

export function closeType1Group3Phase(session: TopicSession) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  if (!session.type1Group3EndsAt) return session;
  if (Date.now() < session.type1Group3EndsAt) return session;
  const hasPending = (session.waveRequests || []).some(
    (item) => item.status === "pending" || item.status === "draft_member3"
  );
  const groupedIds = new Set((session.workingGroups || []).flatMap((group) => group.memberStudentIds));
  const hasUngrouped = session.students.some((student) => !groupedIds.has(student.studentId));

  // Nothing left to process, prevent repeated upserts on every render.
  if (!hasPending && !hasUngrouped) {
    return upsertTopicSession({
      ...session,
      type1Group3EndsAt: 0,
      updatedAt: Date.now()
    });
  }

  let next = session;
  if (hasPending) {
    next = upsertTopicSession({
      ...next,
      waveRequests: (next.waveRequests || []).map((item) =>
        item.status === "pending" || item.status === "draft_member3" ? { ...item, status: "rejected" as const } : item
      ),
      updatedAt: Date.now()
    });
  }

  const groupedAfterClose = new Set((next.workingGroups || []).flatMap((group) => group.memberStudentIds));
  const stillUngrouped = next.students.some((student) => !groupedAfterClose.has(student.studentId));
  if (stillUngrouped) {
    next = randomFillType1(next);
    next = appendTopicSessionLog(
      {
        ...next,
        type1Group3EndsAt: 0,
        updatedAt: Date.now()
      },
      "Auto random sau lượt TV3",
      "Hết giờ mời thành viên thứ 3, hệ thống tự random SV còn lại"
    );
    return upsertTopicSession(next);
  }

  return upsertTopicSession({
    ...next,
    type1Group3EndsAt: 0,
    updatedAt: Date.now()
  });
}

export function rejectOverflowType1Group3Requests(session: TopicSession) {
  if (session.type !== 1) return session;
  if (countType1GroupsOf3(session) < session.groupsOf3) return session;

  const pairMemberIds = new Set(
    (session.workingGroups || [])
      .filter((group) => group.memberStudentIds.length === 2)
      .flatMap((group) => group.memberStudentIds)
  );
  let changed = false;
  const nextRequests = (session.waveRequests || []).map((request) => {
    if (request.status !== "pending") return request;
    if (!pairMemberIds.has(request.toStudentId)) return request;
    changed = true;
    return { ...request, status: "rejected" as const };
  });
  if (!changed) return session;
  return upsertTopicSession({ ...session, waveRequests: nextRequests, updatedAt: Date.now() });
}

export function inviteThirdMember(session: TopicSession, leaderStudentId: string, targetStudentId: string) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  if (session.type1Group3EndsAt && Date.now() >= session.type1Group3EndsAt) return session;
  const targetGroup = (session.workingGroups || []).find((group) => getType1GroupLeaderId(session, group.id) === leaderStudentId);
  if (!targetGroup || targetGroup.memberStudentIds.length >= 3 || getStudentGroup(session, targetStudentId)) return session;
  const alreadyPending = (session.waveRequests || []).some(
    (item) =>
      (item.status === "pending" || item.status === "draft_member3") &&
      ((item.fromStudentId === leaderStudentId && item.toStudentId === targetStudentId) ||
        (item.fromStudentId === targetStudentId && item.toStudentId === leaderStudentId))
  );
  if (alreadyPending) return session;
  const partnerId = targetGroup.memberStudentIds.find((id) => id !== leaderStudentId);
  if (!partnerId) return session;
  return upsertTopicSession({
    ...session,
    waveRequests: [
      ...(session.waveRequests || []),
      {
        fromStudentId: leaderStudentId,
        toStudentId: targetStudentId,
        createdAt: Date.now(),
        status: "draft_member3",
        approvalByStudentId: {
          [leaderStudentId]: true,
          [partnerId]: false
        }
      }
    ],
    updatedAt: Date.now()
  });
}

export function approveGroup3InviteDraft(
  session: TopicSession,
  approverStudentId: string,
  leaderStudentId: string,
  targetStudentId: string,
  approved: boolean
) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  const leaderGroup = (session.workingGroups || []).find((group) => getType1GroupLeaderId(session, group.id) === leaderStudentId);
  if (!leaderGroup || !leaderGroup.memberStudentIds.includes(approverStudentId)) return session;
  let changed = false;
  const nextRequests = (session.waveRequests || []).map((item) => {
    if (item.status !== "draft_member3") return item;
    if (item.fromStudentId !== leaderStudentId || item.toStudentId !== targetStudentId) return item;
    changed = true;
    return {
      ...item,
      approvalByStudentId: {
        ...(item.approvalByStudentId || {}),
        [approverStudentId]: approved
      }
    };
  });
  if (!changed) return session;
  return upsertTopicSession({ ...session, waveRequests: nextRequests, updatedAt: Date.now() });
}

export function confirmGroup3InviteDraft(session: TopicSession, leaderStudentId: string, targetStudentId: string) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  const leaderGroup = (session.workingGroups || []).find((group) => getType1GroupLeaderId(session, group.id) === leaderStudentId);
  if (!leaderGroup || leaderGroup.memberStudentIds.length !== 2) return session;
  const draft = (session.waveRequests || []).find(
    (item) => item.status === "draft_member3" && item.fromStudentId === leaderStudentId && item.toStudentId === targetStudentId
  );
  if (!draft) return session;
  const isFullyApproved = leaderGroup.memberStudentIds.every((id) => Boolean(draft.approvalByStudentId?.[id]));
  if (!isFullyApproved) return session;
  const nextRequests = (session.waveRequests || []).map((item) => {
    if (item !== draft) return item;
    return {
      ...item,
      status: "pending" as const,
      createdAt: Date.now()
    };
  });
  return upsertTopicSession({ ...session, waveRequests: nextRequests, updatedAt: Date.now() });
}

export function cancelGroup3InviteDraft(session: TopicSession, leaderStudentId: string, targetStudentId: string) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  let changed = false;
  const nextRequests = (session.waveRequests || []).filter((item) => {
    const matched =
      item.status === "draft_member3" &&
      item.fromStudentId === leaderStudentId &&
      item.toStudentId === targetStudentId;
    if (matched) changed = true;
    return !matched;
  });
  if (!changed) return session;
  return upsertTopicSession({
    ...session,
    waveRequests: nextRequests,
    updatedAt: Date.now()
  });
}

export function createGroup3AcceptDecisionDraft(session: TopicSession, leaderStudentId: string, candidateStudentId: string) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  const leaderGroup = (session.workingGroups || []).find((group) => getType1GroupLeaderId(session, group.id) === leaderStudentId);
  if (!leaderGroup || leaderGroup.memberStudentIds.length !== 2) return session;
  if ((session.type1LockedGroupIds || []).includes(leaderGroup.id)) return session;
  const partnerId = leaderGroup.memberStudentIds.find((id) => id !== leaderStudentId);
  if (!partnerId) return session;
  const hasMatchedPending = (session.waveRequests || []).some(
    (item) => item.status === "pending" && item.fromStudentId === candidateStudentId && item.toStudentId === leaderStudentId
  );
  if (!hasMatchedPending) return session;

  const existingDraft = (session.waveRequests || []).find(
    (item) => item.status === "draft_member3" && item.fromStudentId === leaderStudentId && item.toStudentId === candidateStudentId
  );
  if (existingDraft) return session;

  const nextRequests = [
    ...(session.waveRequests || []),
    {
      fromStudentId: leaderStudentId,
      toStudentId: candidateStudentId,
      createdAt: Date.now(),
      status: "draft_member3" as const,
      approvalByStudentId: {
        [leaderStudentId]: false,
        [partnerId]: false
      }
    }
  ];

  return upsertTopicSession({
    ...session,
    waveRequests: nextRequests,
    updatedAt: Date.now()
  });
}

export function sendType1GroupMessage(session: TopicSession, groupId: string, studentId: string, text: string) {
  if (session.type !== 1) return session;
  const group = (session.workingGroups || []).find((item) => item.id === groupId);
  if (!group || !group.memberStudentIds.includes(studentId)) return session;
  const clean = String(text || "").trim();
  if (!clean) return session;
  const studentName = session.students.find((item) => item.studentId === studentId)?.fullName || studentId;
  const history = session.type1GroupChatByGroupId?.[groupId] || [];
  return upsertTopicSession({
    ...session,
    type1GroupChatByGroupId: {
      ...(session.type1GroupChatByGroupId || {}),
      [groupId]: [
        ...history,
        { id: `t1-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, studentId, studentName, text: clean, createdAt: Date.now() }
      ]
    },
    updatedAt: Date.now()
  });
}

export function createKeepPairDecisionDraft(session: TopicSession, leaderStudentId: string) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  const group2Remain = Math.max(0, session.groupsOf2 - (session.type1KeptGroup2Count || 0));
  if (group2Remain <= 0) return session;
  const group = (session.workingGroups || []).find((item) => getType1GroupLeaderId(session, item.id) === leaderStudentId);
  if (!group || group.memberStudentIds.length !== 2) return session;
  if ((session.type1LockedGroupIds || []).includes(group.id)) return session;
  const hasPendingInvite = (session.waveRequests || []).some(
    (item) => item.fromStudentId === leaderStudentId && (item.status === "pending" || item.status === "draft_member3")
  );
  if (hasPendingInvite) return session;
  const partnerId = group.memberStudentIds.find((id) => id !== leaderStudentId);
  if (!partnerId) return session;
  return upsertTopicSession({
    ...session,
    type1Keep2DraftByGroupId: {
      ...(session.type1Keep2DraftByGroupId || {}),
      [group.id]: {
        createdAt: Date.now(),
        approvalByStudentId: {
          // Group leader is the creator, so count as auto-approved 1/2.
          [leaderStudentId]: true,
          [partnerId]: false
        }
      }
    },
    updatedAt: Date.now()
  });
}

export function setKeepPairDecisionApproval(
  session: TopicSession,
  groupId: string,
  studentId: string,
  agreed: boolean
) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  const group = (session.workingGroups || []).find((item) => item.id === groupId);
  if (!group || !group.memberStudentIds.includes(studentId) || group.memberStudentIds.length !== 2) return session;
  const draft = session.type1Keep2DraftByGroupId?.[groupId];
  if (!draft) return session;
  return upsertTopicSession({
    ...session,
    type1Keep2DraftByGroupId: {
      ...(session.type1Keep2DraftByGroupId || {}),
      [groupId]: {
        ...draft,
        approvalByStudentId: {
          ...(draft.approvalByStudentId || {}),
          [studentId]: agreed
        }
      }
    },
    updatedAt: Date.now()
  });
}

export function confirmKeepPairDecision(session: TopicSession, leaderStudentId: string) {
  if (session.type !== 1 || session.type1Stage !== "group3") return session;
  const group2Remain = Math.max(0, session.groupsOf2 - (session.type1KeptGroup2Count || 0));
  if (group2Remain <= 0) return session;
  const group = (session.workingGroups || []).find((item) => getType1GroupLeaderId(session, item.id) === leaderStudentId);
  if (!group || group.memberStudentIds.length !== 2) return session;
  const draft = session.type1Keep2DraftByGroupId?.[group.id];
  if (!draft) return session;
  const allApproved = group.memberStudentIds.every((id) => Boolean(draft.approvalByStudentId?.[id]));
  if (!allApproved) return session;
  const nextDrafts = { ...(session.type1Keep2DraftByGroupId || {}) };
  delete nextDrafts[group.id];
  const nextLocked = Array.from(new Set([...(session.type1LockedGroupIds || []), group.id]));
  const memberIdSet = new Set(group.memberStudentIds);
  const nextRequests = (session.waveRequests || []).map((item) => {
    if (item.status !== "pending" && item.status !== "draft_member3") return item;
    if (memberIdSet.has(item.fromStudentId) || memberIdSet.has(item.toStudentId)) {
      return { ...item, status: "rejected" as const };
    }
    return item;
  });
  return upsertTopicSession({
    ...session,
    waveRequests: nextRequests,
    type1Keep2DraftByGroupId: nextDrafts,
    type1LockedGroupIds: nextLocked,
    type1KeptGroup2Count: (session.type1KeptGroup2Count || 0) + 1,
    updatedAt: Date.now()
  });
}

export function randomFillType1(session: TopicSession) {
  if (session.type !== 1) return session;
  if (session.type1Stage !== "group3") return session;
  const lockedGroupIds = new Set(session.type1LockedGroupIds || []);
  const groupedIds = new Set((session.workingGroups || []).flatMap((group) => group.memberStudentIds));
  const remain = shuffle(session.students.map((s) => s.studentId).filter((id) => !groupedIds.has(id)));
  const groups = [...(session.workingGroups || [])];

  // 1) Fill existing unlocked pair groups first.
  while (remain.length > 0) {
    const target = groups.find((group) => !lockedGroupIds.has(group.id) && group.memberStudentIds.length === 2);
    if (!target) break;
    const studentId = remain.shift();
    if (!studentId) break;
    target.memberStudentIds.push(studentId);
    target.memberNames = mapGroupNames(session, target.memberStudentIds);
  }

  // 2) If configured group-of-3 target is still missing and we have enough ungrouped students,
  // auto-create new 3-member groups to satisfy the configured structure.
  const targetGroup3 = Math.max(0, Number(session.groupsOf3) || 0);
  let currentGroup3 = groups.filter((group) => group.memberStudentIds.length >= 3).length;
  while (currentGroup3 < targetGroup3 && remain.length >= 3) {
    const memberStudentIds = [remain.shift(), remain.shift(), remain.shift()].filter(Boolean) as string[];
    if (memberStudentIds.length < 3) break;
    groups.push({
      id: `type1-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      memberStudentIds,
      memberNames: mapGroupNames(session, memberStudentIds),
      topic: ""
    });
    currentGroup3 += 1;
  }

  return upsertTopicSession({ ...session, workingGroups: groups, updatedAt: Date.now() });
}

export function startBiddingType1(session: TopicSession) {
  if (session.type !== 1) return session;
  if (session.type1Stage !== "group3") return session;
  const group3Closed = !session.type1Group3EndsAt || Date.now() >= session.type1Group3EndsAt;
  if (!group3Closed) return session;
  const ungroupedIds = session.students
    .map((s) => s.studentId)
    .filter((id) => !(session.workingGroups || []).some((group) => group.memberStudentIds.includes(id)));
  if (ungroupedIds.length > 0) return session;
  const groups = session.workingGroups || [];
  const remaining: Record<string, number> = {};
  groups.forEach((group) => {
    const scores = group.memberStudentIds.map((id) => session.students.find((s) => s.studentId === id)?.scoreValue || 0);
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    remaining[group.id] = Math.round(avg * 10);
  });

  return upsertTopicSession({
    ...session,
    type1Stage: "bidding",
    biddingRound: 1,
    type1RoundEndsAt: Date.now() + getType1BiddingRoundDurationMs(1),
    bidRecords: [],
    groupRemainingPoints: remaining,
    type1BidDraftByGroupId: {},
    type1BidApprovalsByGroupId: {},
    type1PenaltyPoints: Math.max(0, Number(session.type1PenaltyPoints) || 35),
    type1PenalizedGroupIds: [],
    type1TopRemainingGroupId: "",
    type1PenaltySummaryByGroupId: {},
    updatedAt: Date.now()
  });
}

export function saveType1BidDraft(
  session: TopicSession,
  groupId: string,
  leaderStudentId: string,
  topic: string,
  points: number
) {
  if (session.type !== 1 || session.type1Stage !== "bidding") return session;
  const group = (session.workingGroups || []).find((item) => item.id === groupId);
  if (!group) return session;
  const wonGroupIds = new Set((session.finalGroups || []).map((item) => item.id));
  if (wonGroupIds.has(groupId)) return session;
  if (!group.memberStudentIds.includes(leaderStudentId)) return session;
  if (getType1GroupLeaderId(session, groupId) !== leaderStudentId) return session;
  if (!topic.trim()) return session;
  const remain = session.groupRemainingPoints?.[groupId] || 0;
  if (points <= 0 || points > remain) return session;

  const round = session.biddingRound || 1;
  const approvals: Record<string, boolean> = {};
  group.memberStudentIds.forEach((id) => {
    approvals[id] = id === leaderStudentId;
  });
  return upsertTopicSession({
    ...session,
    type1BidDraftByGroupId: {
      ...(session.type1BidDraftByGroupId || {}),
      [groupId]: {
        topic: topic.trim(),
        points: Math.round(points),
        round,
        leaderStudentId,
        updatedAt: Date.now()
      }
    },
    type1BidApprovalsByGroupId: {
      ...(session.type1BidApprovalsByGroupId || {}),
      [groupId]: approvals
    },
    updatedAt: Date.now()
  });
}

export function setType1BidApproval(session: TopicSession, groupId: string, studentId: string, agreed: boolean) {
  if (session.type !== 1 || session.type1Stage !== "bidding") return session;
  const group = (session.workingGroups || []).find((item) => item.id === groupId);
  if (!group || !group.memberStudentIds.includes(studentId)) return session;
  const draft = session.type1BidDraftByGroupId?.[groupId];
  if (!draft || draft.round !== (session.biddingRound || 1)) return session;
  return upsertTopicSession({
    ...session,
    type1BidApprovalsByGroupId: {
      ...(session.type1BidApprovalsByGroupId || {}),
      [groupId]: {
        ...(session.type1BidApprovalsByGroupId?.[groupId] || {}),
        [studentId]: agreed
      }
    },
    updatedAt: Date.now()
  });
}

export function submitBid(session: TopicSession, groupId: string, topic: string, points: number) {
  if (session.type !== 1 || session.type1Stage !== "bidding") return session;
  const wonGroupIds = new Set((session.finalGroups || []).map((item) => item.id));
  if (wonGroupIds.has(groupId)) return session;
  const round = session.biddingRound || 1;
  const exists = (session.bidRecords || []).some((bid) => bid.groupId === groupId && bid.round === round);
  if (exists) return session;
  const remain = session.groupRemainingPoints?.[groupId] || 0;
  if (!topic || points <= 0 || points > remain) return session;
  const draft = session.type1BidDraftByGroupId?.[groupId];
  const approvals = session.type1BidApprovalsByGroupId?.[groupId] || {};
  const group = (session.workingGroups || []).find((item) => item.id === groupId);
  if (!draft || !group) return session;
  if (draft.round !== round || draft.topic !== topic || draft.points !== points) return session;
  const allApproved = group.memberStudentIds.every((id) => Boolean(approvals[id]));
  if (!allApproved) return session;

  return upsertTopicSession({
    ...session,
    bidRecords: [...(session.bidRecords || []), { groupId, topic, points, round }],
    updatedAt: Date.now()
  });
}

function applyType1NoWinPenalties(
  session: TopicSession,
  unassignedGroups: TopicGroup[],
  remainByGroupId: Record<string, number>
) {
  const nextRemain = { ...remainByGroupId };
  const bidGroupIds = new Set((session.bidRecords || []).map((bid) => bid.groupId));
  const penalizedGroupIds: string[] = [];
  const penaltySummaryByGroupId: Record<string, Type1PenaltySummary> = {};

  unassignedGroups.forEach((group) => {
    const basePoints = Math.max(0, Number(nextRemain[group.id]) || 0);
    const joinedAnyBid = bidGroupIds.has(group.id);
    const deductedPoints = joinedAnyBid ? Math.min(35, basePoints) : Math.round(basePoints * 0.8);
    const finalPoints = Math.max(0, basePoints - deductedPoints);
    nextRemain[group.id] = finalPoints;
    penalizedGroupIds.push(group.id);
    penaltySummaryByGroupId[group.id] = {
      kind: joinedAnyBid ? "bid_no_win_35_points" : "no_bid_80_percent",
      basePoints,
      deductedPoints,
      finalPoints
    };
  });

  return {
    nextRemain,
    penalizedGroupIds,
    penaltySummaryByGroupId
  };
}

function getType1BiddingRoundDurationMs(round: number) {
  if (round <= 1) return 10 * 60 * 1000;
  if (round === 2) return 7 * 60 * 1000;
  return 5 * 60 * 1000;
}

export function resolveBiddingRound(session: TopicSession) {
  if (session.type !== 1 || session.type1Stage !== "bidding") return session;
  const round = session.biddingRound || 1;
  const bids = (session.bidRecords || []).filter((bid) => bid.round === round);
  const wonGroupIds = new Set((session.finalGroups || []).map((group) => group.id));
  const usedTopics = new Set((session.finalGroups || []).map((group) => group.topic));
  const nextFinal = [...(session.finalGroups || [])];
  const nextRemain = { ...(session.groupRemainingPoints || {}) };

  const topics = [...new Set(bids.map((bid) => bid.topic))].filter((topic) => !usedTopics.has(topic));
  topics.forEach((topic) => {
    const candidates = bids
      .filter((bid) => bid.topic === topic && !wonGroupIds.has(bid.groupId))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const remainDiff = (nextRemain[b.groupId] || 0) - (nextRemain[a.groupId] || 0);
        if (remainDiff !== 0) return remainDiff;
        return Math.random() < 0.5 ? -1 : 1;
      });
    const winner = candidates[0];
    if (!winner) return;
    wonGroupIds.add(winner.groupId);
    nextRemain[winner.groupId] = Math.max(0, (nextRemain[winner.groupId] || 0) - winner.points);
    const group = (session.workingGroups || []).find((item) => item.id === winner.groupId);
    if (!group) return;
    nextFinal.push({ ...group, topic });
  });

  const targetCount = session.topicCount;
  const workingGroups = session.workingGroups || [];

  // If there is exactly 1 topic left and exactly 1 group still without topic,
  // auto-close bidding early and assign the last topic with fixed -35 purchase fee.
  const remainingGroupsNow = workingGroups.filter((group) => !nextFinal.some((item) => item.id === group.id));
  const remainingTopicsNow = session.topics.filter((topic) => !nextFinal.some((item) => item.topic === topic));
  if (remainingGroupsNow.length === 1 && remainingTopicsNow.length === 1) {
    const lastGroup = remainingGroupsNow[0];
    const lastTopic = remainingTopicsNow[0];
    const outFinal = [...nextFinal, { ...lastGroup, topic: lastTopic }];
    const basePoints = Math.max(0, Number(nextRemain[lastGroup.id]) || 0);
    const deductedPoints = Math.min(35, basePoints);
    const finalPoints = Math.max(0, basePoints - deductedPoints);
    const remainAfterRound = {
      ...nextRemain,
      [lastGroup.id]: finalPoints
    };
    const penaltySummaryByGroupId: Record<string, Type1PenaltySummary> = {
      [lastGroup.id]: {
        kind: "bid_no_win_35_points",
        basePoints,
        deductedPoints,
        finalPoints
      }
    };
    const ranking = workingGroups
      .map((group) => ({ id: group.id, remain: remainAfterRound[group.id] || 0 }))
      .sort((a, b) => b.remain - a.remain || a.id.localeCompare(b.id));
    return upsertTopicSession(
      appendTopicSessionLog(
        {
          ...session,
          finalGroups: outFinal,
          groupRemainingPoints: remainAfterRound,
          type1PenalizedGroupIds: [lastGroup.id],
          type1TopRemainingGroupId: ranking[0]?.id || "",
          type1PenaltySummaryByGroupId: penaltySummaryByGroupId,
          status: "completed",
          type1Stage: "completed",
          type1RoundEndsAt: 0,
          type1BidDraftByGroupId: {},
          type1BidApprovalsByGroupId: {},
          updatedAt: Date.now()
        },
        "Kết thúc đấu giá",
        "Chỉ còn 1 chủ đề, hệ thống tự gán cho nhóm cuối với phí 35 điểm"
      )
    );
  }
  const finishWithRandom = (inputFinal: TopicGroup[], reason: string) => {
    const outFinal = [...inputFinal];
    const unassignedGroups = workingGroups.filter((group) => !outFinal.some((item) => item.id === group.id));
    const poolTopics = shuffle(session.topics.filter((topic) => !outFinal.some((item) => item.topic === topic)));
    unassignedGroups.forEach((group, index) => {
      outFinal.push({ ...group, topic: poolTopics[index] || `Chu de ${outFinal.length + 1}` });
    });

    const { nextRemain: remainAfterRound, penalizedGroupIds, penaltySummaryByGroupId } = applyType1NoWinPenalties(
      session,
      unassignedGroups,
      nextRemain
    );

    const ranking = workingGroups
      .map((group) => ({ id: group.id, remain: remainAfterRound[group.id] || 0 }))
      .sort((a, b) => b.remain - a.remain || a.id.localeCompare(b.id));
    const topGroupId = ranking[0]?.id || "";

    return upsertTopicSession(
      appendTopicSessionLog(
        {
          ...session,
          finalGroups: outFinal,
          groupRemainingPoints: remainAfterRound,
          type1PenalizedGroupIds: penalizedGroupIds,
          type1TopRemainingGroupId: topGroupId,
          type1PenaltySummaryByGroupId: penaltySummaryByGroupId,
          status: "completed",
          type1Stage: "completed",
          type1RoundEndsAt: 0,
          type1BidDraftByGroupId: {},
          type1BidApprovalsByGroupId: {},
          updatedAt: Date.now()
        },
        "Kết thúc đấu giá",
        reason
      )
    );
  };

  if (nextFinal.length >= targetCount || round >= 5) {
    if (nextFinal.length >= targetCount) {
      const ranking = workingGroups
        .map((group) => ({ id: group.id, remain: nextRemain[group.id] || 0 }))
        .sort((a, b) => b.remain - a.remain || a.id.localeCompare(b.id));
      return upsertTopicSession(
        appendTopicSessionLog(
          {
            ...session,
            finalGroups: nextFinal,
            groupRemainingPoints: nextRemain,
            type1PenalizedGroupIds: [],
            type1TopRemainingGroupId: ranking[0]?.id || "",
            type1PenaltySummaryByGroupId: {},
            status: "completed",
            type1Stage: "completed",
            type1RoundEndsAt: 0,
            type1BidDraftByGroupId: {},
            type1BidApprovalsByGroupId: {},
            updatedAt: Date.now()
          },
          "Kết thúc đấu giá",
          "Tất cả nhóm đã có chủ đề"
        )
      );
    }
    return finishWithRandom(nextFinal, "Hết 5 vòng đấu giá, random chủ đề còn lại");
  }

  return upsertTopicSession({
    ...session,
    finalGroups: nextFinal,
    groupRemainingPoints: nextRemain,
    biddingRound: round + 1,
    type1RoundEndsAt: Date.now() + getType1BiddingRoundDurationMs(round + 1),
    type1BidDraftByGroupId: {},
    type1BidApprovalsByGroupId: {},
    updatedAt: Date.now()
  });
}

export function shouldResolveType1Bidding(session: TopicSession) {
  if (session.type !== 1 || session.type1Stage !== "bidding" || session.status !== "running") return false;
  const round = session.biddingRound || 1;
  const activeGroups = (session.workingGroups || []).filter((group) => !(session.finalGroups || []).some((f) => f.id === group.id));
  if (activeGroups.length === 0) return true;
  const submitted = (session.bidRecords || []).filter(
    (bid) => bid.round === round && activeGroups.some((group) => group.id === bid.groupId)
  ).length;
  if (submitted >= activeGroups.length) return true;
  if (session.type1RoundEndsAt && Date.now() >= session.type1RoundEndsAt) return true;
  return false;
}

export function finalizeType1BiddingWithRandom(session: TopicSession) {
  if (session.type !== 1 || session.type1Stage !== "bidding") return session;
  const workingGroups = session.workingGroups || [];
  const finalGroups = [...(session.finalGroups || [])];
  const remainingGroups = workingGroups.filter((group) => !finalGroups.some((item) => item.id === group.id));
  const remainingTopics = shuffle(session.topics.filter((topic) => !finalGroups.some((item) => item.topic === topic)));
  remainingGroups.forEach((group, index) => {
    finalGroups.push({ ...group, topic: remainingTopics[index] || `Chu de ${finalGroups.length + 1}` });
  });

  const { nextRemain, penalizedGroupIds, penaltySummaryByGroupId } = applyType1NoWinPenalties(
    session,
    remainingGroups,
    session.groupRemainingPoints || {}
  );

  const ranking = workingGroups
    .map((group) => ({ id: group.id, remain: nextRemain[group.id] || 0 }))
    .sort((a, b) => b.remain - a.remain || a.id.localeCompare(b.id));

  return upsertTopicSession(
    appendTopicSessionLog(
      {
        ...session,
        finalGroups,
        groupRemainingPoints: nextRemain,
        type1PenalizedGroupIds: penalizedGroupIds,
        type1TopRemainingGroupId: ranking[0]?.id || "",
        type1PenaltySummaryByGroupId: penaltySummaryByGroupId,
        status: "completed",
        type1Stage: "completed",
        type1RoundEndsAt: 0,
        type1BidDraftByGroupId: {},
        type1BidApprovalsByGroupId: {},
        updatedAt: Date.now()
      },
      "Kết thúc đấu giá",
      "GV kết thúc đấu giá, random chủ đề còn lại"
    )
  );
}

export function joinTopic2Room(session: TopicSession, studentId: string, topic: string) {
  if (session.type !== 2 || session.status !== "running" || session.topic2FinalizedAt) return session;
  if ((session.topic2LockedTopics || []).includes(topic)) return session;

  const nextRooms: Record<string, string[]> = { ...(session.topic2RoomMembers || {}) };
  Object.keys(nextRooms).forEach((key) => {
    nextRooms[key] = nextRooms[key].filter((id) => id !== studentId);
  });

  const current = nextRooms[topic] || [];
  if (current.length >= 3) return session;
  nextRooms[topic] = [...new Set([...current, studentId])];

  const nextAgreement = { ...(session.topic2AgreementByTopic || {}) };
  nextAgreement[topic] = nextAgreement[topic] || {};
  nextAgreement[topic][studentId] = false;

  return upsertTopicSession({
    ...session,
    topic2RoomMembers: nextRooms,
    topic2AgreementByTopic: nextAgreement,
    updatedAt: Date.now()
  });
}

export function leaveTopic2Room(session: TopicSession, studentId: string) {
  if (session.type !== 2 || session.status !== "running" || session.topic2FinalizedAt) return session;
  const joinedTopic =
    Object.entries(session.topic2RoomMembers || {}).find(([, members]) => members.includes(studentId))?.[0] || "";
  if (joinedTopic && (session.topic2LockedTopics || []).includes(joinedTopic)) {
    return session;
  }
  const nextRooms: Record<string, string[]> = { ...(session.topic2RoomMembers || {}) };
  Object.keys(nextRooms).forEach((key) => {
    nextRooms[key] = nextRooms[key].filter((id) => id !== studentId);
  });
  const nextAgreement = { ...(session.topic2AgreementByTopic || {}) };
  Object.keys(nextAgreement).forEach((topic) => {
    if (nextAgreement[topic]?.[studentId] !== undefined) {
      delete nextAgreement[topic][studentId];
    }
  });
  return upsertTopicSession({
    ...session,
    topic2RoomMembers: nextRooms,
    topic2AgreementByTopic: nextAgreement,
    updatedAt: Date.now()
  });
}

export function sendTopic2RoomMessage(session: TopicSession, topic: string, studentId: string, text: string) {
  if (session.type !== 2 || !topic.trim()) return session;
  const cleanText = text.trim();
  if (!cleanText) return session;
  const inRoom = (session.topic2RoomMembers?.[topic] || []).includes(studentId);
  if (!inRoom) return session;

  const studentName = session.students.find((s) => s.studentId === studentId)?.fullName || studentId;
  const current = session.topic2MessagesByTopic || {};
  const nextTopicMessages = [...(current[topic] || [])];
  nextTopicMessages.push({
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    topic,
    studentId,
    studentName,
    text: cleanText,
    createdAt: Date.now()
  });

  return upsertTopicSession({
    ...session,
    topic2MessagesByTopic: {
      ...current,
      [topic]: nextTopicMessages.slice(-200)
    },
    updatedAt: Date.now()
  });
}

export function setTopic2RoomAgreement(session: TopicSession, topic: string, studentId: string, agreed: boolean) {
  if (session.type !== 2 || !topic.trim()) return session;
  if (!(session.topic2RoomMembers?.[topic] || []).includes(studentId)) return session;
  const current = session.topic2AgreementByTopic || {};
  return upsertTopicSession({
    ...session,
    topic2AgreementByTopic: {
      ...current,
      [topic]: {
        ...(current[topic] || {}),
        [studentId]: agreed
      }
    },
    updatedAt: Date.now()
  });
}

export function lockTopic2Room(session: TopicSession, topic: string) {
  if (session.type !== 2 || session.status !== "running" || session.topic2FinalizedAt) return session;
  const members = session.topic2RoomMembers?.[topic] || [];
  if (members.length < 2 || members.length > 3) return session;

  const groupId = `g${(session.finalGroups || []).length + 1}`;
  const nextFinal = [
    ...(session.finalGroups || []),
    { id: groupId, memberStudentIds: members, memberNames: mapGroupNames(session, members), topic }
  ];
  const nextLocked = [...new Set([...(session.topic2LockedTopics || []), topic])];
  const nextSources = { ...(session.topic2LockSourceByTopic || {}), [topic]: "Tự chốt trong phòng" };

  const done = nextFinal.length >= session.topicCount;
  return upsertTopicSession({
    ...session,
    finalGroups: nextFinal,
    topic2LockedTopics: nextLocked,
    topic2LockSourceByTopic: nextSources,
    status: done ? "completed" : session.status,
    updatedAt: Date.now()
  });
}

function buildType2TargetSizeMap(session: TopicSession) {
  const sizeByTopic: Record<string, number> = {};
  session.topics.slice(0, session.topicCount).forEach((topic, index) => {
    sizeByTopic[topic] = index < session.groupsOf3 ? 3 : 2;
  });
  return sizeByTopic;
}

export function finalizeTopic2Selection(session: TopicSession, reason = "GV kết thúc chọn phòng") {
  if (session.type !== 2 || session.topic2FinalizedAt) return session;

  const topics = session.topics.slice(0, session.topicCount);
  const targetSizeByTopic = buildType2TargetSizeMap(session);
  const lockedTopics = new Set(session.topic2LockedTopics || []);
  const roomMembers = session.topic2RoomMembers || {};
  const lockSources = { ...(session.topic2LockSourceByTopic || {}) };
  const finalGroups: TopicGroup[] = [];
  const assignedIds = new Set<string>();

  (session.finalGroups || []).forEach((group) => {
    finalGroups.push({ ...group });
    group.memberStudentIds.forEach((id) => assignedIds.add(id));
  });

  topics.forEach((topic, index) => {
    if (lockedTopics.has(topic)) return;
    const currentMembers = [...new Set((roomMembers[topic] || []).filter((id) => !assignedIds.has(id)))];
    if (currentMembers.length === 0) return;
    currentMembers.forEach((id) => assignedIds.add(id));
    finalGroups.push({
      id: `g${index + 1}`,
      memberStudentIds: currentMembers,
      memberNames: mapGroupNames(session, currentMembers),
      topic
    });
    if (!lockSources[topic]) lockSources[topic] = reason;
  });

  topics.forEach((topic, index) => {
    if (finalGroups.some((group) => group.topic === topic)) return;
    finalGroups.push({
      id: `g${index + 1}`,
      memberStudentIds: [],
      memberNames: [],
      topic
    });
    if (!lockSources[topic]) lockSources[topic] = reason;
  });

  const remaining = shuffle(session.students.map((s) => s.studentId).filter((id) => !assignedIds.has(id)));
  remaining.forEach((studentId) => {
    const unlockedGroup = finalGroups.find((group) => {
      if (lockedTopics.has(group.topic)) return false;
      const cap = Math.max(2, Math.min(3, targetSizeByTopic[group.topic] || 3));
      return group.memberStudentIds.length < cap;
    });
    const fallbackGroup = finalGroups.find((group) => {
      const cap = Math.max(2, Math.min(3, targetSizeByTopic[group.topic] || 3));
      return group.memberStudentIds.length < cap;
    });
    const targetGroup = unlockedGroup || fallbackGroup;
    if (!targetGroup) return;
    targetGroup.memberStudentIds.push(studentId);
    targetGroup.memberNames = mapGroupNames(session, targetGroup.memberStudentIds);
    assignedIds.add(studentId);
  });

  const emptyGroups = finalGroups.filter((group) => group.memberStudentIds.length === 0);
  emptyGroups.forEach((group) => {
    const donor = finalGroups.find((candidate) => candidate.topic !== group.topic && candidate.memberStudentIds.length >= 3);
    if (!donor) return;
    const moved = donor.memberStudentIds.pop();
    if (!moved) return;
    donor.memberNames = mapGroupNames(session, donor.memberStudentIds);
    group.memberStudentIds.push(moved);
    group.memberNames = mapGroupNames(session, group.memberStudentIds);
  });

  const normalizedFinalGroups = finalGroups.map((group, index) => ({
    ...group,
    id: `g${index + 1}`,
    memberNames: mapGroupNames(session, group.memberStudentIds)
  }));

  return upsertTopicSession({
    ...appendTopicSessionLog(
      {
        ...session,
        finalGroups: normalizedFinalGroups,
        status: "completed",
        topic2LockSourceByTopic: lockSources,
        topic2FinalizedAt: Date.now(),
        topic2EndsAt: session.topic2EndsAt || Date.now(),
        updatedAt: Date.now()
      },
      "Kết thúc chọn phòng",
      reason
    )
  });
}
