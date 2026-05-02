import { getCurrentTeacherEmail } from "./auth-storage";
import { repairMojibakeDeep } from "./text-normalize";
import {
  cloudFindGroupMatchingSessionByCode,
  cloudGetGroupMatchingSessionById,
  cloudLoadGroupMatchingSessionsByOwner,
  cloudUpsertGroupMatchingSession
} from "./group-matching-cloud";

export const GROUP_MATCHING_STORAGE_KEY = "marveclass_group_matching_sessions";

export type GroupRoundKey = "round1" | "round2" | "round3" | "round4";

export type GroupRoundConfig = Record<GroupRoundKey, boolean>;
export type GroupParticipantRole = "leader" | "member" | "pending";

export type GroupParticipant = {
  studentId: string;
  fullName: string;
  ranking: number;
  email?: string;
};

export type GroupStudentCredential = {
  password: string;
  linkedEmail?: string;
  updatedAt: number;
};

export type GroupMatchingGroup = {
  leaderStudentId: string;
  leaderFullName: string;
  roomName?: string;
  capacity: number;
  memberStudentIds: string[];
  memberFullNames: string[];
};

export type GroupRound3Room = {
  leaderStudentId: string;
  roomName: string;
  observerMemberIds: string[];
  observerMemberFullNames: string[];
  admittedMemberIds: string[];
  admittedMemberFullNames: string[];
};

export type GroupRound3ApplicationStatus = "pending" | "accepted" | "rejected" | "expired";

export type GroupRound3Application = {
  applicantStudentId: string;
  targetLeaderStudentId: string;
  targetRoomName: string;
  applicationLetter: string;
  submittedAtMs: number;
  visibleDurationMs: number;
  isLateSubmission: boolean;
  status: GroupRound3ApplicationStatus;
};

export type GroupSessionLogEntry = {
  id: string;
  at: number;
  action: string;
  detail?: string;
};

export type GroupMatchingSession = {
  id: string;
  className: string;
  classCode: string;
  ownerTeacherEmail: string;
  ownerTeacherName?: string;
  participants: GroupParticipant[];
  groupCount: number;
  roundsEnabled: GroupRoundConfig;
  round1Votes: Record<string, string[]>;
  loggedInStudentIds?: string[];
  studentCredentials: Record<string, GroupStudentCredential>;
  participantRoles?: Record<string, GroupParticipantRole>;
  topLeaders?: string[];
  leadersVisible?: boolean;
  round2MemberPreferences?: Record<string, string[]>;
  round2LeaderRankings?: Record<string, string[]>;
  round2Matched?: boolean;
  matchingResults?: GroupMatchingGroup[];
  round3Rooms?: Record<string, GroupRound3Room>;
  round3Applications?: Record<string, GroupRound3Application>;
  round3Results?: GroupMatchingGroup[];
  round3UnmatchedStudentIds?: string[];
  finalGroups?: GroupMatchingGroup[];
  actionLogs?: GroupSessionLogEntry[];
  roundOpenedAt?: Partial<Record<GroupRoundKey, number>>;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  currentRound: "waiting" | "round1" | "round2" | "round3" | "round4" | "completed";
};

export type Round1VoteResult = {
  studentId: string;
  fullName: string;
  ranking: number;
  voteCount: number;
  isLeader: boolean;
};

export const defaultRoundConfig: GroupRoundConfig = {
  round1: true,
  round2: true,
  round3: true,
  round4: true
};

function hasWindow() {
  return typeof window !== "undefined";
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRoundConfig(roundsEnabled?: Partial<GroupRoundConfig>) {
  return {
    round1: true,
    round2: Boolean(roundsEnabled?.round2 ?? true),
    round3: Boolean(roundsEnabled?.round3 ?? true),
    round4: true
  } as GroupRoundConfig;
}

function normalizeParticipant(participant: Partial<GroupParticipant>) {
  return {
    studentId: String(participant.studentId || "").trim(),
    fullName: String(participant.fullName || "").trim(),
    ranking: Number(participant.ranking) || 0,
    email: participant.email ? normalizeEmail(participant.email) : ""
  } as GroupParticipant;
}

function sanitizeIdArray(values: unknown, validIds: Set<string>, limit: number) {
  if (!Array.isArray(values)) {
    return [] as string[];
  }

  return [...new Set(values.map((value) => String(value || "").trim()))]
    .filter((value) => validIds.has(value))
    .slice(0, Math.max(0, limit));
}

function sanitizeGroup(raw: Partial<GroupMatchingGroup>, participantById: Map<string, GroupParticipant>) {
  const memberStudentIds = Array.isArray(raw.memberStudentIds)
    ? [...new Set(raw.memberStudentIds.map((value) => String(value || "").trim()).filter(Boolean))]
    : [];

  const memberFullNames =
    memberStudentIds.length > 0
      ? memberStudentIds.map((studentId) => participantById.get(studentId)?.fullName || studentId)
      : Array.isArray(raw.memberFullNames)
        ? raw.memberFullNames.map((value) => String(value || "").trim()).filter(Boolean)
        : [];

  return {
    leaderStudentId: String(raw.leaderStudentId || "").trim(),
    leaderFullName: String(raw.leaderFullName || "").trim(),
    roomName: String(raw.roomName || "").trim(),
    capacity: Math.max(0, Number(raw.capacity) || 0),
    memberStudentIds,
    memberFullNames
  } as GroupMatchingGroup;
}

function sanitizeLogEntry(raw: Partial<GroupSessionLogEntry>) {
  return {
    id: String(raw.id || "").trim(),
    at: Number(raw.at) || 0,
    action: String(raw.action || "").trim(),
    detail: String(raw.detail || "").trim()
  } as GroupSessionLogEntry;
}

function normalizeSession(raw: Partial<GroupMatchingSession>) {
  const participants = Array.isArray(raw.participants) ? raw.participants.map(normalizeParticipant) : [];
  const participantIds = new Set(participants.map((participant) => participant.studentId));
  const participantById = new Map(participants.map((participant) => [participant.studentId, participant]));
  const safeGroupCount = Math.max(2, Math.min(Number(raw.groupCount) || 2, participants.length || 2));

  const normalizedRound1Votes: Record<string, string[]> = {};
  if (raw.round1Votes && typeof raw.round1Votes === "object") {
    Object.entries(raw.round1Votes as Record<string, string[] | string>).forEach(([voterStudentId, rawVotes]) => {
      const candidateIds = Array.isArray(rawVotes) ? rawVotes : typeof rawVotes === "string" ? [rawVotes] : [];
      const uniqueVotes = [...new Set(candidateIds)]
        .map((value) => String(value || "").trim())
        .filter((value) => participantIds.has(value))
        .slice(0, safeGroupCount);

      normalizedRound1Votes[String(voterStudentId || "").trim()] = uniqueVotes;
    });
  }

  const topLeaders = sanitizeIdArray(raw.topLeaders, participantIds, safeGroupCount);
  const participantRoles: Record<string, GroupParticipantRole> = {};
  participants.forEach((participant) => {
    const nextRole = raw.participantRoles?.[participant.studentId];
    if (nextRole === "leader" || nextRole === "member" || nextRole === "pending") {
      participantRoles[participant.studentId] = nextRole;
      return;
    }
    participantRoles[participant.studentId] = topLeaders.includes(participant.studentId) ? "leader" : "pending";
  });

  const round2MemberPreferences: Record<string, string[]> = {};
  if (raw.round2MemberPreferences && typeof raw.round2MemberPreferences === "object") {
    Object.entries(raw.round2MemberPreferences).forEach(([memberId, preferences]) => {
      round2MemberPreferences[String(memberId || "").trim()] = sanitizeIdArray(preferences, participantIds, safeGroupCount);
    });
  }

  const round2LeaderRankings: Record<string, string[]> = {};
  if (raw.round2LeaderRankings && typeof raw.round2LeaderRankings === "object") {
    Object.entries(raw.round2LeaderRankings).forEach(([leaderId, rankings]) => {
      round2LeaderRankings[String(leaderId || "").trim()] = sanitizeIdArray(rankings, participantIds, participants.length);
    });
  }

  const matchingResults = Array.isArray(raw.matchingResults)
    ? raw.matchingResults.map((group) => sanitizeGroup(group, participantById)).filter((group) => Boolean(group.leaderStudentId))
    : [];

  const round3Rooms: Record<string, GroupRound3Room> = {};
  if (raw.round3Rooms && typeof raw.round3Rooms === "object") {
    Object.entries(raw.round3Rooms).forEach(([leaderId, room]) => {
      const safeLeaderId = String(leaderId || "").trim();
      const safeRoom = room || {};
      round3Rooms[safeLeaderId] = {
        leaderStudentId: safeLeaderId,
        roomName: String((safeRoom as GroupRound3Room).roomName || "").trim(),
        observerMemberIds: sanitizeIdArray((safeRoom as GroupRound3Room).observerMemberIds, participantIds, participants.length),
        observerMemberFullNames: Array.isArray((safeRoom as GroupRound3Room).observerMemberFullNames)
          ? (safeRoom as GroupRound3Room).observerMemberFullNames.map((value) => String(value || "").trim()).filter(Boolean)
          : [],
        admittedMemberIds: sanitizeIdArray((safeRoom as GroupRound3Room).admittedMemberIds, participantIds, participants.length),
        admittedMemberFullNames: Array.isArray((safeRoom as GroupRound3Room).admittedMemberFullNames)
          ? (safeRoom as GroupRound3Room).admittedMemberFullNames.map((value) => String(value || "").trim()).filter(Boolean)
          : []
      };
    });
  }

  const round3Applications: Record<string, GroupRound3Application> = {};
  if (raw.round3Applications && typeof raw.round3Applications === "object") {
    Object.entries(raw.round3Applications).forEach(([applicantId, application]) => {
      const safeApplicantId = String(applicantId || "").trim();
      const safeApp = application || {};
      const status = (safeApp as GroupRound3Application).status;
      round3Applications[safeApplicantId] = {
        applicantStudentId: safeApplicantId,
        targetLeaderStudentId: String((safeApp as GroupRound3Application).targetLeaderStudentId || "").trim(),
        targetRoomName: String((safeApp as GroupRound3Application).targetRoomName || "").trim(),
        applicationLetter: String((safeApp as GroupRound3Application).applicationLetter || "").trim(),
        submittedAtMs: Number((safeApp as GroupRound3Application).submittedAtMs) || 0,
        visibleDurationMs: Number((safeApp as GroupRound3Application).visibleDurationMs) || 5 * 60 * 1000,
        isLateSubmission: Boolean((safeApp as GroupRound3Application).isLateSubmission),
        status:
          status === "accepted" || status === "rejected" || status === "expired" || status === "pending"
            ? status
            : "pending"
      };
    });
  }

  const round3Results = Array.isArray(raw.round3Results)
    ? raw.round3Results.map((group) => sanitizeGroup(group, participantById)).filter((group) => Boolean(group.leaderStudentId))
    : [];
  const finalGroups = Array.isArray(raw.finalGroups)
    ? raw.finalGroups.map((group) => sanitizeGroup(group, participantById)).filter((group) => Boolean(group.leaderStudentId))
    : [];

  const round3UnmatchedStudentIds = sanitizeIdArray(raw.round3UnmatchedStudentIds, participantIds, participants.length);
  const loggedInStudentIds = sanitizeIdArray(raw.loggedInStudentIds, participantIds, participants.length);
  const actionLogs = Array.isArray(raw.actionLogs)
    ? raw.actionLogs
        .map((entry) => sanitizeLogEntry(entry))
        .filter((entry) => entry.id && entry.at > 0 && entry.action)
        .slice(-500)
    : [];

  const currentRound =
    raw.currentRound === "round1" ||
    raw.currentRound === "round2" ||
    raw.currentRound === "round3" ||
    raw.currentRound === "round4" ||
    raw.currentRound === "completed" ||
    raw.currentRound === "waiting"
      ? raw.currentRound
      : "waiting";

  return {
    id: raw.id || "",
    className: raw.className || "Lớp chưa đặt tên",
    classCode: String(raw.classCode || "").toUpperCase(),
    ownerTeacherEmail: normalizeEmail(raw.ownerTeacherEmail || ""),
    ownerTeacherName: raw.ownerTeacherName || "",
    participants,
    groupCount: safeGroupCount,
    roundsEnabled: normalizeRoundConfig(raw.roundsEnabled),
    round1Votes: normalizedRound1Votes,
    loggedInStudentIds,
    studentCredentials: raw.studentCredentials || {},
    participantRoles,
    topLeaders,
    leadersVisible: Boolean(raw.leadersVisible),
    round2MemberPreferences,
    round2LeaderRankings,
    round2Matched: Boolean(raw.round2Matched),
    matchingResults,
    round3Rooms,
    round3Applications,
    round3Results,
    round3UnmatchedStudentIds,
    finalGroups,
    actionLogs,
    roundOpenedAt: raw.roundOpenedAt || {},
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || raw.createdAt || Date.now(),
    startedAt: raw.startedAt,
    currentRound
  } as GroupMatchingSession;
}

export function loadGroupMatchingSessions() {
  if (!hasWindow()) {
    return [] as GroupMatchingSession[];
  }

  const raw = window.localStorage.getItem(GROUP_MATCHING_STORAGE_KEY);
  if (!raw) {
    return [] as GroupMatchingSession[];
  }

  try {
    const parsed = repairMojibakeDeep(JSON.parse(raw)) as GroupMatchingSession[];
    if (!Array.isArray(parsed)) {
      return [] as GroupMatchingSession[];
    }
    return parsed.map((session) => normalizeSession(session));
  } catch {
    return [] as GroupMatchingSession[];
  }
}

export function saveGroupMatchingSessions(sessions: GroupMatchingSession[]) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(
    GROUP_MATCHING_STORAGE_KEY,
    JSON.stringify(sessions.map((session) => normalizeSession(session)))
  );
}

export function loadGroupMatchingSessionsByOwner(ownerTeacherEmail: string) {
  const normalizedOwner = normalizeEmail(ownerTeacherEmail);
  if (!normalizedOwner) {
    return [] as GroupMatchingSession[];
  }

  return loadGroupMatchingSessions().filter(
    (session) => normalizeEmail(session.ownerTeacherEmail) === normalizedOwner
  );
}

export function getGroupMatchingSession(sessionId: string) {
  return loadGroupMatchingSessions().find((session) => session.id === sessionId) || null;
}

export function getGroupMatchingSessionForOwner(sessionId: string, ownerTeacherEmail: string) {
  const normalizedOwner = normalizeEmail(ownerTeacherEmail);
  return (
    loadGroupMatchingSessions().find(
      (session) => session.id === sessionId && normalizeEmail(session.ownerTeacherEmail) === normalizedOwner
    ) || null
  );
}

export async function getGroupMatchingSessionForOwnerAny(sessionId: string, ownerTeacherEmail: string) {
  const local = getGroupMatchingSessionForOwner(sessionId, ownerTeacherEmail);
  if (local) return local;
  const cloud = await getGroupMatchingSessionByIdAny(sessionId);
  if (!cloud) return null;
  if (normalizeEmail(cloud.ownerTeacherEmail) !== normalizeEmail(ownerTeacherEmail)) return null;
  return cloud;
}

export function findGroupMatchingSessionByCode(classCode: string) {
  const normalizedCode = classCode.trim().toUpperCase();
  if (!normalizedCode) {
    return null as GroupMatchingSession | null;
  }

  return (
    loadGroupMatchingSessions()
      .filter((session) => session.classCode.toUpperCase() === normalizedCode)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null
  );
}

export function findParticipantByEmail(session: GroupMatchingSession, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }

  return session.participants.find((participant) => normalizeEmail(participant.email || "") === normalized) || null;
}

export function migrateLegacySessionsToOwner(ownerTeacherEmail: string, ownerTeacherName?: string) {
  const normalizedOwner = normalizeEmail(ownerTeacherEmail);
  if (!normalizedOwner) {
    return;
  }

  const sessions = loadGroupMatchingSessions();
  let isDirty = false;
  const nextSessions = sessions.map((session) => {
    let nextSession = session;
    if (!session.ownerTeacherEmail) {
      isDirty = true;
      nextSession = {
        ...nextSession,
        ownerTeacherEmail: normalizedOwner,
        ownerTeacherName: ownerTeacherName || session.ownerTeacherName || "",
        updatedAt: Date.now()
      };
    }

    if (!nextSession.studentCredentials) {
      isDirty = true;
      nextSession = {
        ...nextSession,
        studentCredentials: {}
      };
    }

    return nextSession;
  });

  if (isDirty) {
    saveGroupMatchingSessions(nextSessions);
  }
}

export function upsertGroupMatchingSession(payload: GroupMatchingSession) {
  const normalizedPayload = normalizeSession(payload);
  const sessions = loadGroupMatchingSessions();
  const nextSessions = sessions.some((item) => item.id === normalizedPayload.id)
    ? sessions.map((item) => (item.id === normalizedPayload.id ? normalizedPayload : item))
    : [normalizedPayload, ...sessions];

  saveGroupMatchingSessions(nextSessions);
  void cloudUpsertGroupMatchingSession(normalizedPayload);
  return normalizedPayload;
}

export function removeGroupMatchingSession(sessionId: string) {
  const sessions = loadGroupMatchingSessions().filter((session) => session.id !== sessionId);
  saveGroupMatchingSessions(sessions);
}

export async function findGroupMatchingSessionByCodeAny(classCode: string) {
  const local = findGroupMatchingSessionByCode(classCode);
  if (local) return local;
  const cloud = await cloudFindGroupMatchingSessionByCode(classCode);
  if (cloud) {
    upsertGroupMatchingSession(cloud);
    return cloud;
  }
  return null;
}

export async function getGroupMatchingSessionByIdAny(sessionId: string) {
  const local = getGroupMatchingSession(sessionId);
  if (local) return local;
  const cloud = await cloudGetGroupMatchingSessionById(sessionId);
  if (cloud) {
    upsertGroupMatchingSession(cloud);
    return cloud;
  }
  return null;
}

export async function loadGroupMatchingSessionsByOwnerAny(ownerTeacherEmail: string) {
  const local = loadGroupMatchingSessionsByOwner(ownerTeacherEmail);
  if (local.length > 0) return local;
  const cloud = await cloudLoadGroupMatchingSessionsByOwner(ownerTeacherEmail);
  if (cloud.length > 0) {
    const current = loadGroupMatchingSessions();
    const map = new Map(current.map((item) => [item.id, item]));
    cloud.forEach((item) => map.set(item.id, normalizeSession(item)));
    saveGroupMatchingSessions(Array.from(map.values()));
  }
  return cloud;
}

export function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `gm-${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

export function createUniqueClassCode(existingCodes: string[]) {
  const codeSet = new Set(existingCodes.map((code) => code.toUpperCase()));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let loop = 0;
  while (loop < 5000) {
    let value = "";
    for (let index = 0; index < 6; index += 1) {
      value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    if (!codeSet.has(value)) {
      return value;
    }
    loop += 1;
  }

  return `GM${Date.now().toString().slice(-4)}`;
}

function parseParticipantLine(line: string, fallbackRanking: number): GroupParticipant | null {
  const trimmedLine = line.trim();
  if (!trimmedLine) {
    return null;
  }

  let studentId = "";
  let fullName = "";
  let ranking = fallbackRanking;
  let email = "";

  const readExtraColumns = (extraColumns: string[]) => {
    extraColumns.forEach((column) => {
      if (!column) {
        return;
      }
      if (!email && column.includes("@")) {
        email = normalizeEmail(column);
        return;
      }
      if (/^\d+$/.test(column)) {
        ranking = Number(column);
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
    ranking,
    email
  };
}

export function parseParticipantList(rawValue: string) {
  const rows = rawValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const participants: GroupParticipant[] = [];
  const usedIds = new Set<string>();

  rows.forEach((line, index) => {
    const parsed = parseParticipantLine(line, index + 1);
    if (!parsed) {
      return;
    }

    const normalizedId = parsed.studentId.toUpperCase();
    if (usedIds.has(normalizedId)) {
      return;
    }

    usedIds.add(normalizedId);
    participants.push(parsed);
  });

  return participants;
}

export function participantsToImportText(participants: GroupParticipant[]) {
  return participants
    .map((participant) => {
      if (participant.email) {
        return `${participant.studentId}\t${participant.fullName}\t${participant.ranking}\t${participant.email}`;
      }
      return `${participant.studentId}\t${participant.fullName}\t${participant.ranking}`;
    })
    .join("\n");
}

export function formatRoundSummary(roundsEnabled: GroupRoundConfig) {
  const labels: Array<[GroupRoundKey, string]> = [
    ["round1", "Vòng 1"],
    ["round2", "Vòng 2"],
    ["round3", "Vòng 3"],
    ["round4", "Vòng 4"]
  ];

  return labels
    .filter(([key]) => roundsEnabled[key])
    .map(([, label]) => label)
    .join(" · ");
}

export function getRoundControlOrder(roundsEnabled: GroupRoundConfig) {
  const order: GroupRoundKey[] = ["round1"];
  if (roundsEnabled.round2) {
    order.push("round2");
  }
  if (roundsEnabled.round3) {
    order.push("round3");
  }
  order.push("round4");
  return order;
}

export function toRoundLabel(roundKey: GroupRoundKey) {
  switch (roundKey) {
    case "round1":
      return "Vòng 1";
    case "round2":
      return "Vòng 2";
    case "round3":
      return "Vòng 3";
    case "round4":
      return "Vòng 4";
    default:
      return "";
  }
}

export function getCurrentRoundStatusLabel(
  currentRound: GroupMatchingSession["currentRound"],
  roundsEnabled?: GroupRoundConfig
) {
  if (currentRound === "waiting") {
    return "Phòng chờ";
  }
  if (currentRound === "completed") {
    return "Đã kết thúc";
  }
  if (currentRound === "round2" && roundsEnabled && !roundsEnabled.round2) {
    return "Bỏ qua Vòng 2";
  }
  if (currentRound === "round3" && roundsEnabled && !roundsEnabled.round3) {
    return "Bỏ qua Vòng 3";
  }
  return toRoundLabel(currentRound);
}

export function getRequiredRound1VoteCount(session: GroupMatchingSession) {
  return Math.min(session.groupCount, session.participants.length);
}

export function getLoggedInStudentIds(session: GroupMatchingSession) {
  return (session.loggedInStudentIds || []).filter((studentId) =>
    session.participants.some((participant) => participant.studentId === studentId)
  );
}

export function countLoggedInStudents(session: GroupMatchingSession) {
  return getLoggedInStudentIds(session).length;
}

export function getLeaderTargetCount(session: GroupMatchingSession) {
  return Math.min(session.groupCount, session.participants.length);
}

export function getRound1VoteResults(session: GroupMatchingSession) {
  const voteMap = session.round1Votes || {};
  const countMap = new Map<string, number>();

  Object.values(voteMap).forEach((targetStudentIds) => {
    targetStudentIds.forEach((targetStudentId) => {
      countMap.set(targetStudentId, (countMap.get(targetStudentId) || 0) + 1);
    });
  });

  const sorted = [...session.participants]
    .map((participant) => ({
      studentId: participant.studentId,
      fullName: participant.fullName,
      ranking: participant.ranking,
      voteCount: countMap.get(participant.studentId) || 0
    }))
    .sort((left, right) => {
      if (right.voteCount !== left.voteCount) {
        return right.voteCount - left.voteCount;
      }
      if (left.ranking !== right.ranking) {
        return left.ranking - right.ranking;
      }
      return left.fullName.localeCompare(right.fullName);
    });

  const leaderCount = Math.min(session.groupCount, sorted.length);

  return sorted.map((item, index) => ({
    ...item,
    isLeader: index < leaderCount
  })) as Round1VoteResult[];
}

export function getLeaderIds(session: GroupMatchingSession) {
  const roleLeaders = Object.entries(session.participantRoles || {})
    .filter(([, role]) => role === "leader")
    .map(([studentId]) => studentId)
    .filter((studentId) => session.participants.some((participant) => participant.studentId === studentId));
  const topLeaders = (session.topLeaders || []).filter((studentId) =>
    session.participants.some((participant) => participant.studentId === studentId)
  );

  if (roleLeaders.length > 0) {
    if (topLeaders.length > 0) {
      const roleLeaderSet = new Set(roleLeaders);
      const prioritizedByVote = topLeaders.filter((studentId) => roleLeaderSet.has(studentId));
      const remainder = roleLeaders.filter((studentId) => !prioritizedByVote.includes(studentId));
      return [...prioritizedByVote, ...remainder];
    }

    const round1Order = getRound1VoteResults(session)
      .filter((item) => item.isLeader)
      .map((item) => item.studentId);
    if (round1Order.length > 0) {
      const roleLeaderSet = new Set(roleLeaders);
      const prioritizedByVote = round1Order.filter((studentId) => roleLeaderSet.has(studentId));
      const remainder = roleLeaders.filter((studentId) => !prioritizedByVote.includes(studentId));
      return [...prioritizedByVote, ...remainder];
    }

    return roleLeaders;
  }
  if (topLeaders.length > 0) {
    return topLeaders;
  }

  return getRound1VoteResults(session)
    .filter((item) => item.isLeader)
    .map((item) => item.studentId);
}

export function getMemberIds(session: GroupMatchingSession) {
  const leaderIdSet = new Set(getLeaderIds(session));
  const roleMembers = Object.entries(session.participantRoles || {})
    .filter(([, role]) => role === "member")
    .map(([studentId]) => studentId)
    .filter((studentId) => session.participants.some((participant) => participant.studentId === studentId));

  if (roleMembers.length > 0) {
    return roleMembers;
  }

  return session.participants
    .map((participant) => participant.studentId)
    .filter((studentId) => !leaderIdSet.has(studentId));
}

export function getParticipantRole(session: GroupMatchingSession, studentId: string): GroupParticipantRole {
  if (!studentId) {
    return "pending";
  }

  const role = session.participantRoles?.[studentId];
  if (role === "leader" || role === "member" || role === "pending") {
    return role;
  }

  if (getLeaderIds(session).includes(studentId)) {
    return "leader";
  }

  if (session.participants.some((participant) => participant.studentId === studentId)) {
    return "member";
  }

  return "pending";
}

export function countRound1Submitted(session: GroupMatchingSession) {
  const requiredVoteCount = getRequiredRound1VoteCount(session);
  return Object.values(session.round1Votes || {}).filter((voteIds) => voteIds.length === requiredVoteCount).length;
}

export function submitRound1Vote(sessionId: string, voterStudentId: string, votedLeaderStudentIds: string[]) {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  const requiredVoteCount = getRequiredRound1VoteCount(session);
  const existingVote = session.round1Votes?.[voterStudentId] || [];
  if (existingVote.length === requiredVoteCount) {
    return null;
  }

  const voterExists = session.participants.some((item) => item.studentId === voterStudentId);
  const uniqueVotes = [...new Set(votedLeaderStudentIds)]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const allTargetsExist = uniqueVotes.every((targetId) =>
    session.participants.some((item) => item.studentId === targetId)
  );

  if (!voterExists || !allTargetsExist) {
    return null;
  }

  if (uniqueVotes.length !== requiredVoteCount) {
    return null;
  }

  const nextSession: GroupMatchingSession = {
    ...session,
    round1Votes: {
      ...(session.round1Votes || {}),
      [voterStudentId]: uniqueVotes
    },
    updatedAt: Date.now()
  };

  return upsertGroupMatchingSession(nextSession);
}

export function markStudentLoggedIn(sessionId: string, studentId: string) {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  const exists = session.participants.some((participant) => participant.studentId === studentId);
  if (!exists) {
    return null;
  }

  const loggedInStudentIds = [...new Set([...(session.loggedInStudentIds || []), studentId])];
  const nextSession: GroupMatchingSession = {
    ...session,
    loggedInStudentIds,
    updatedAt: Date.now()
  };

  return upsertGroupMatchingSession(nextSession);
}

export function upsertStudentCredential(params: {
  sessionId: string;
  studentId: string;
  password: string;
  linkedEmail?: string;
}) {
  const session = getGroupMatchingSession(params.sessionId);
  if (!session) {
    return null;
  }

  const studentExists = session.participants.some((item) => item.studentId === params.studentId);
  if (!studentExists) {
    return null;
  }

  const nextSession: GroupMatchingSession = {
    ...session,
    studentCredentials: {
      ...(session.studentCredentials || {}),
      [params.studentId]: {
        password: params.password,
        linkedEmail: params.linkedEmail ? normalizeEmail(params.linkedEmail) : "",
        updatedAt: Date.now()
      }
    },
    updatedAt: Date.now()
  };

  return upsertGroupMatchingSession(nextSession);
}

export function verifyStudentCredential(session: GroupMatchingSession, studentId: string, password: string) {
  const credential = session.studentCredentials?.[studentId];
  if (!credential) {
    return false;
  }
  return credential.password === password;
}

export function hasStudentCredential(session: GroupMatchingSession, studentId: string) {
  return Boolean(session.studentCredentials?.[studentId]?.password);
}

export function publishLeadersAndOpenRound2(sessionId: string) {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  const topLeaders = getRound1VoteResults(session)
    .filter((item) => item.isLeader)
    .map((item) => item.studentId);
  if (topLeaders.length === 0) {
    return null;
  }

  const topLeaderSet = new Set(topLeaders);
  const participantRoles: Record<string, GroupParticipantRole> = {};
  session.participants.forEach((participant) => {
    participantRoles[participant.studentId] = topLeaderSet.has(participant.studentId) ? "leader" : "member";
  });

  const now = Date.now();
  const emptyMatchingGroups: GroupMatchingGroup[] = topLeaders.map((leaderId) => ({
    leaderStudentId: leaderId,
    leaderFullName: session.participants.find((participant) => participant.studentId === leaderId)?.fullName || leaderId,
    capacity: getLeaderCapacity(
      {
        ...session,
        participantRoles
      } as GroupMatchingSession,
      leaderId
    ),
    memberStudentIds: [],
    memberFullNames: []
  }));
  const nextRound: GroupMatchingSession["currentRound"] = session.roundsEnabled.round2
    ? "round2"
    : session.roundsEnabled.round3
      ? "round3"
      : "round4";

  const round3Rooms: Record<string, GroupRound3Room> = {};
  emptyMatchingGroups.forEach((group) => {
    round3Rooms[group.leaderStudentId] = {
      leaderStudentId: group.leaderStudentId,
      roomName: session.round3Rooms?.[group.leaderStudentId]?.roomName || "",
      observerMemberIds: [],
      observerMemberFullNames: [],
      admittedMemberIds: [],
      admittedMemberFullNames: []
    };
  });

  const nextSession: GroupMatchingSession = {
    ...session,
    topLeaders,
    participantRoles,
    leadersVisible: true,
    round2Matched: !session.roundsEnabled.round2,
    matchingResults: session.roundsEnabled.round2 ? [] : emptyMatchingGroups,
    round2MemberPreferences: {},
    round2LeaderRankings: {},
    round3Rooms: session.roundsEnabled.round3 ? round3Rooms : {},
    round3Applications: {},
    round3Results: [],
    round3UnmatchedStudentIds: [],
    finalGroups: [],
    currentRound: nextRound,
    roundOpenedAt: {
      ...(session.roundOpenedAt || {}),
      ...(nextRound === "round2" ? { round2: now } : {}),
      ...(nextRound === "round3" ? { round3: now } : {}),
      ...(nextRound === "round4" ? { round4: now } : {})
    },
    updatedAt: now
  };

  return upsertGroupMatchingSession(nextSession);
}

export function getLeaderCapacity(session: GroupMatchingSession, leaderId: string) {
  const leaderIds = getLeaderIds(session);
  const leaderIndex = leaderIds.findIndex((id) => id === leaderId);
  const leaderCount = leaderIds.length;

  if (leaderIndex < 0 || leaderCount <= 0) {
    return 0;
  }

  const totalMembers = Math.max(session.participants.length - leaderCount, 0);
  const baseQuota = Math.floor(totalMembers / leaderCount);
  const extraSlots = totalMembers % leaderCount;
  return baseQuota + (leaderIndex < extraSlots ? 1 : 0);
}

export function submitRound2MemberPreference(
  sessionId: string,
  memberStudentId: string,
  preferredLeaderIds: string[]
) {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  if (getParticipantRole(session, memberStudentId) !== "member") {
    return null;
  }

  const existing = session.round2MemberPreferences?.[memberStudentId] || [];
  const expected = Math.min(2, getLeaderIds(session).length);
  if (existing.length === expected && expected > 0) {
    return null;
  }

  const leaderIdSet = new Set(getLeaderIds(session));
  const sanitized = [...new Set(preferredLeaderIds.map((value) => String(value || "").trim()))]
    .filter((value) => leaderIdSet.has(value))
    .slice(0, expected);

  if (sanitized.length !== expected) {
    return null;
  }

  const nextSession: GroupMatchingSession = {
    ...session,
    round2MemberPreferences: {
      ...(session.round2MemberPreferences || {}),
      [memberStudentId]: sanitized
    },
    updatedAt: Date.now()
  };

  return upsertGroupMatchingSession(nextSession);
}

export function submitRound2LeaderRanking(
  sessionId: string,
  leaderStudentId: string,
  preferredMemberIds: string[]
) {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  if (getParticipantRole(session, leaderStudentId) !== "leader") {
    return null;
  }

  const memberIdSet = new Set(getMemberIds(session));
  const expected = getLeaderCapacity(session, leaderStudentId);
  const existing = session.round2LeaderRankings?.[leaderStudentId] || [];
  if (existing.length === expected && expected > 0) {
    return null;
  }

  const sanitized = [...new Set(preferredMemberIds.map((value) => String(value || "").trim()))]
    .filter((value) => memberIdSet.has(value))
    .slice(0, expected);

  if (sanitized.length !== expected) {
    return null;
  }

  const nextSession: GroupMatchingSession = {
    ...session,
    round2LeaderRankings: {
      ...(session.round2LeaderRankings || {}),
      [leaderStudentId]: sanitized
    },
    updatedAt: Date.now()
  };

  return upsertGroupMatchingSession(nextSession);
}

export function countRound2MemberSubmitted(session: GroupMatchingSession) {
  const expected = Math.min(2, getLeaderIds(session).length);
  if (expected <= 0) {
    return 0;
  }
  return getMemberIds(session).filter(
    (memberId) => (session.round2MemberPreferences?.[memberId] || []).length === expected
  ).length;
}

export function countRound2LeaderSubmitted(session: GroupMatchingSession) {
  return getLeaderIds(session).filter((leaderId) => {
    const expected = getLeaderCapacity(session, leaderId);
    return (session.round2LeaderRankings?.[leaderId] || []).length === expected;
  }).length;
}

function compareMembersForLeader(
  session: GroupMatchingSession,
  leaderId: string,
  memberAId: string,
  memberBId: string
) {
  const rankingList = session.round2LeaderRankings?.[leaderId] || [];
  const rankingMap = new Map(rankingList.map((memberId, index) => [memberId, index]));

  const preferenceA = rankingMap.get(memberAId) ?? Number.MAX_SAFE_INTEGER;
  const preferenceB = rankingMap.get(memberBId) ?? Number.MAX_SAFE_INTEGER;
  if (preferenceA !== preferenceB) {
    return preferenceA - preferenceB;
  }

  const rankingA =
    session.participants.find((participant) => participant.studentId === memberAId)?.ranking ?? Number.MAX_SAFE_INTEGER;
  const rankingB =
    session.participants.find((participant) => participant.studentId === memberBId)?.ranking ?? Number.MAX_SAFE_INTEGER;
  if (rankingA !== rankingB) {
    return rankingA - rankingB;
  }

  return memberAId.localeCompare(memberBId);
}

export function buildRound2Matching(session: GroupMatchingSession) {
  const leaders = getLeaderIds(session).map((leaderId) => ({
    leaderStudentId: leaderId,
    leaderFullName: session.participants.find((item) => item.studentId === leaderId)?.fullName || leaderId
  }));

  const memberIds = getMemberIds(session);
  const mutualLeaderChoicesByMember = new Map<string, string[]>();
  const acceptedMembersByLeader = new Map<string, string[]>(
    leaders.map((leader) => [leader.leaderStudentId, []])
  );
  const nextProposalIndexByMember = new Map<string, number>();
  const queue: string[] = [];

  memberIds.forEach((memberId) => {
    const preferredLeaderIds = session.round2MemberPreferences?.[memberId] || [];
    const mutualLeaderIds = preferredLeaderIds.filter((leaderId) =>
      (session.round2LeaderRankings?.[leaderId] || []).includes(memberId)
    );

    mutualLeaderChoicesByMember.set(memberId, mutualLeaderIds);
    if (mutualLeaderIds.length > 0) {
      queue.push(memberId);
      nextProposalIndexByMember.set(memberId, 0);
    }
  });

  while (queue.length > 0) {
    const memberId = queue.shift();
    if (!memberId) {
      continue;
    }

    const choices = mutualLeaderChoicesByMember.get(memberId) || [];
    const proposalIndex = nextProposalIndexByMember.get(memberId) || 0;
    if (proposalIndex >= choices.length) {
      continue;
    }

    const leaderId = choices[proposalIndex];
    nextProposalIndexByMember.set(memberId, proposalIndex + 1);

    const accepted = [...(acceptedMembersByLeader.get(leaderId) || []), memberId].sort((a, b) =>
      compareMembersForLeader(session, leaderId, a, b)
    );
    const capacity = getLeaderCapacity(session, leaderId);
    const kept = accepted.slice(0, capacity);
    const rejected = accepted.slice(capacity);
    acceptedMembersByLeader.set(leaderId, kept);

    rejected.forEach((rejectedMemberId) => {
      const nextIndex = nextProposalIndexByMember.get(rejectedMemberId) || 0;
      if (nextIndex < (mutualLeaderChoicesByMember.get(rejectedMemberId) || []).length) {
        queue.push(rejectedMemberId);
      }
    });
  }

  return leaders.map((leader) => {
    const memberStudentIds = acceptedMembersByLeader.get(leader.leaderStudentId) || [];
    return {
      leaderStudentId: leader.leaderStudentId,
      leaderFullName: leader.leaderFullName,
      capacity: getLeaderCapacity(session, leader.leaderStudentId),
      memberStudentIds,
      memberFullNames: memberStudentIds.map((memberId) =>
        session.participants.find((participant) => participant.studentId === memberId)?.fullName || memberId
      )
    } as GroupMatchingGroup;
  });
}

export function startRound2Matching(sessionId: string) {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  const matchingResults = buildRound2Matching(session);
  const now = Date.now();
  const round3Rooms: Record<string, GroupRound3Room> = {};
  matchingResults.forEach((group) => {
    round3Rooms[group.leaderStudentId] = {
      leaderStudentId: group.leaderStudentId,
      roomName: session.round3Rooms?.[group.leaderStudentId]?.roomName || "",
      observerMemberIds: group.memberStudentIds,
      observerMemberFullNames: group.memberFullNames,
      admittedMemberIds: session.round3Rooms?.[group.leaderStudentId]?.admittedMemberIds || [],
      admittedMemberFullNames: session.round3Rooms?.[group.leaderStudentId]?.admittedMemberFullNames || []
    };
  });

  const nextRound: GroupMatchingSession["currentRound"] = session.roundsEnabled.round3 ? "round3" : "round4";
  const nextSession: GroupMatchingSession = {
    ...session,
    round2Matched: true,
    matchingResults,
    round3Rooms,
    currentRound: nextRound,
    roundOpenedAt: {
      ...(session.roundOpenedAt || {}),
      ...(nextRound === "round3" ? { round3: now } : { round4: now })
    },
    updatedAt: now
  };

  return upsertGroupMatchingSession(nextSession);
}

export function getRound3Rooms(session: GroupMatchingSession) {
  return Object.values(session.round3Rooms || {});
}

export function countRound3CreatedRooms(session: GroupMatchingSession) {
  return getRound3Rooms(session).filter((room) => room.roomName.trim()).length;
}

export function countRound3Applications(session: GroupMatchingSession) {
  return Object.keys(session.round3Applications || {}).length;
}

function getRoomMemberCount(room: GroupRound3Room) {
  return [...new Set([...(room.observerMemberIds || []), ...(room.admittedMemberIds || [])])].length;
}

export function upsertRound3Room(sessionId: string, leaderStudentId: string, roomName: string) {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }
  if (getParticipantRole(session, leaderStudentId) !== "leader") {
    return null;
  }

  const matchingGroup = (session.matchingResults || []).find((group) => group.leaderStudentId === leaderStudentId);
  const currentRoom = session.round3Rooms?.[leaderStudentId];
  if (currentRoom?.roomName?.trim()) {
    return null;
  }

  const nextRoom: GroupRound3Room = {
    leaderStudentId,
    roomName: roomName.trim(),
    observerMemberIds: currentRoom?.observerMemberIds || matchingGroup?.memberStudentIds || [],
    observerMemberFullNames: currentRoom?.observerMemberFullNames || matchingGroup?.memberFullNames || [],
    admittedMemberIds: currentRoom?.admittedMemberIds || [],
    admittedMemberFullNames: currentRoom?.admittedMemberFullNames || []
  };

  const nextSession: GroupMatchingSession = {
    ...session,
    round3Rooms: {
      ...(session.round3Rooms || {}),
      [leaderStudentId]: nextRoom
    },
    updatedAt: Date.now()
  };
  return upsertGroupMatchingSession(nextSession);
}

export function submitRound3Application(
  sessionId: string,
  applicantStudentId: string,
  targetLeaderStudentId: string,
  applicationLetter: string
) {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  if (getParticipantRole(session, applicantStudentId) !== "member") {
    return null;
  }

  const isMatchedInRound2 = (session.matchingResults || []).some((group) =>
    group.memberStudentIds.includes(applicantStudentId)
  );
  if (isMatchedInRound2) {
    return null;
  }

  const room = session.round3Rooms?.[targetLeaderStudentId];
  if (!room || !room.roomName.trim()) {
    return null;
  }

  const capacity = getLeaderCapacity(session, targetLeaderStudentId);
  if (getRoomMemberCount(room) >= capacity) {
    return null;
  }

  const existing = session.round3Applications?.[applicantStudentId];
  if (existing) {
    return null;
  }

  const now = Date.now();
  const round3OpenedAt = session.roundOpenedAt?.round3 || now;
  const isLateSubmission = now - round3OpenedAt > 5 * 60 * 1000;
  const visibleDurationMs = isLateSubmission ? 3 * 60 * 1000 : 5 * 60 * 1000;

  const nextSession: GroupMatchingSession = {
    ...session,
    round3Applications: {
      ...(session.round3Applications || {}),
      [applicantStudentId]: {
        applicantStudentId,
        targetLeaderStudentId,
        targetRoomName: room.roomName,
        applicationLetter: applicationLetter.trim(),
        submittedAtMs: now,
        visibleDurationMs,
        isLateSubmission,
        status: "pending"
      }
    },
    updatedAt: now
  };

  return upsertGroupMatchingSession(nextSession);
}

export function expireRound3Applications(sessionId: string, now = Date.now()) {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  let changed = false;
  const nextApplications: Record<string, GroupRound3Application> = {
    ...(session.round3Applications || {})
  };

  Object.entries(nextApplications).forEach(([applicantId, application]) => {
    if (application.status !== "pending") {
      return;
    }
    if (application.submittedAtMs <= 0) {
      return;
    }
    if (now > application.submittedAtMs + application.visibleDurationMs) {
      nextApplications[applicantId] = {
        ...application,
        status: "expired"
      };
      changed = true;
    }
  });

  if (!changed) {
    return session;
  }

  const nextSession: GroupMatchingSession = {
    ...session,
    round3Applications: nextApplications,
    updatedAt: now
  };
  return upsertGroupMatchingSession(nextSession);
}

export function reviewRound3Application(
  sessionId: string,
  leaderStudentId: string,
  applicantStudentId: string,
  decision: "accepted" | "rejected"
) {
  const session = expireRound3Applications(sessionId) || getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  const app = session.round3Applications?.[applicantStudentId];
  if (!app || app.status !== "pending" || app.targetLeaderStudentId !== leaderStudentId) {
    return null;
  }

  const currentRoom = session.round3Rooms?.[leaderStudentId];
  if (!currentRoom) {
    return null;
  }

  const capacity = getLeaderCapacity(session, leaderStudentId);
  const roomMemberIds = [...new Set([...(currentRoom.observerMemberIds || []), ...(currentRoom.admittedMemberIds || [])])];
  const roomIsFull = roomMemberIds.length >= capacity;

  const nextApplications: Record<string, GroupRound3Application> = {
    ...(session.round3Applications || {})
  };
  const nextRooms: Record<string, GroupRound3Room> = {
    ...(session.round3Rooms || {})
  };

  if (decision === "accepted" && !roomIsFull) {
    const admittedMemberIds = [...new Set([...(currentRoom.admittedMemberIds || []), applicantStudentId])];
    const admittedMemberFullNames = admittedMemberIds.map((memberId) =>
      session.participants.find((participant) => participant.studentId === memberId)?.fullName || memberId
    );

    nextRooms[leaderStudentId] = {
      ...currentRoom,
      admittedMemberIds,
      admittedMemberFullNames
    };

    nextApplications[applicantStudentId] = {
      ...app,
      status: "accepted"
    };
  } else {
    nextApplications[applicantStudentId] = {
      ...app,
      status: "rejected"
    };
  }

  const refreshedRoom = nextRooms[leaderStudentId];
  if (refreshedRoom) {
    const refreshedCount = getRoomMemberCount(refreshedRoom);
    if (refreshedCount >= capacity) {
      Object.entries(nextApplications).forEach(([memberId, application]) => {
        if (application.status !== "pending") {
          return;
        }
        if (application.targetLeaderStudentId !== leaderStudentId) {
          return;
        }
        nextApplications[memberId] = {
          ...application,
          status: "rejected"
        };
      });
    }
  }

  const nextSession: GroupMatchingSession = {
    ...session,
    round3Rooms: nextRooms,
    round3Applications: nextApplications,
    updatedAt: Date.now()
  };

  return upsertGroupMatchingSession(nextSession);
}

function buildRound3ResultGroups(session: GroupMatchingSession) {
  const leaderIds = getLeaderIds(session);
  return leaderIds.map((leaderId) => {
    const baseGroup = (session.matchingResults || []).find((group) => group.leaderStudentId === leaderId);
    const room = session.round3Rooms?.[leaderId];
    const observerMemberIds = room?.observerMemberIds || baseGroup?.memberStudentIds || [];
    const admittedMemberIds = room?.admittedMemberIds || [];
    const memberStudentIds = [...new Set([...observerMemberIds, ...admittedMemberIds])];
    const memberFullNames = memberStudentIds.map((memberId) =>
      session.participants.find((participant) => participant.studentId === memberId)?.fullName || memberId
    );

    return {
      leaderStudentId: leaderId,
      leaderFullName: session.participants.find((participant) => participant.studentId === leaderId)?.fullName || leaderId,
      roomName: room?.roomName || "Chưa đặt tên",
      capacity: baseGroup?.capacity || getLeaderCapacity(session, leaderId),
      memberStudentIds,
      memberFullNames
    } as GroupMatchingGroup;
  });
}

export function finalizeRound3AndOpenRound4(sessionId: string) {
  const maybeExpired = expireRound3Applications(sessionId) || getGroupMatchingSession(sessionId);
  if (!maybeExpired) {
    return null;
  }
  const session = maybeExpired;

  const round3Results = buildRound3ResultGroups(session);
  const assignedIds = new Set(round3Results.flatMap((group) => group.memberStudentIds));
  const round3UnmatchedStudentIds = getMemberIds(session).filter((memberId) => !assignedIds.has(memberId));

  const nextApplications: Record<string, GroupRound3Application> = {
    ...(session.round3Applications || {})
  };
  Object.entries(nextApplications).forEach(([applicantId, application]) => {
    if (application.status === "pending") {
      nextApplications[applicantId] = {
        ...application,
        status: "rejected"
      };
    }
  });

  const now = Date.now();
  const nextSession: GroupMatchingSession = {
    ...session,
    round3Results,
    round3UnmatchedStudentIds,
    round3Applications: nextApplications,
    currentRound: "round4",
    roundOpenedAt: {
      ...(session.roundOpenedAt || {}),
      round4: now
    },
    updatedAt: now
  };

  return upsertGroupMatchingSession(nextSession);
}

function shuffleIds(values: string[]) {
  const nextValues = [...values];
  for (let index = nextValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const currentValue = nextValues[index];
    nextValues[index] = nextValues[swapIndex];
    nextValues[swapIndex] = currentValue;
  }
  return nextValues;
}

export function startRound4RandomFill(sessionId: string) {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  const baseGroups = session.round3Results && session.round3Results.length > 0
    ? session.round3Results
    : buildRound3ResultGroups(session);
  const assignedIds = new Set(baseGroups.flatMap((group) => group.memberStudentIds));
  const unmatchedIds = session.round3UnmatchedStudentIds && session.round3UnmatchedStudentIds.length > 0
    ? session.round3UnmatchedStudentIds
    : getMemberIds(session).filter((memberId) => !assignedIds.has(memberId));

  const shuffled = shuffleIds(unmatchedIds);
  let cursor = 0;
  const finalGroups = baseGroups.map((group) => {
    const memberStudentIds = [...group.memberStudentIds];
    const remainingSlots = Math.max(group.capacity - memberStudentIds.length, 0);
    for (let index = 0; index < remainingSlots && cursor < shuffled.length; index += 1) {
      memberStudentIds.push(shuffled[cursor]);
      cursor += 1;
    }
    const memberFullNames = memberStudentIds.map((memberId) =>
      session.participants.find((participant) => participant.studentId === memberId)?.fullName || memberId
    );
    return {
      ...group,
      memberStudentIds,
      memberFullNames
    } as GroupMatchingGroup;
  });

  const now = Date.now();
  const nextSession: GroupMatchingSession = {
    ...session,
    round3Results: baseGroups,
    finalGroups,
    round3UnmatchedStudentIds: shuffled.slice(cursor),
    currentRound: "completed",
    updatedAt: now
  };

  return upsertGroupMatchingSession(nextSession);
}

export function getRound2MemberSubmitterIds(session: GroupMatchingSession) {
  const expected = Math.min(2, getLeaderIds(session).length);
  if (expected <= 0) {
    return [] as string[];
  }
  return getMemberIds(session).filter(
    (memberId) => (session.round2MemberPreferences?.[memberId] || []).length === expected
  );
}

export function getRound2LeaderSubmitterIds(session: GroupMatchingSession) {
  return getLeaderIds(session).filter((leaderId) => {
    const expected = getLeaderCapacity(session, leaderId);
    return (session.round2LeaderRankings?.[leaderId] || []).length === expected;
  });
}

export function getRound3CreatedRoomLeaderIds(session: GroupMatchingSession) {
  return getRound3Rooms(session)
    .filter((room) => room.roomName.trim())
    .map((room) => room.leaderStudentId);
}

export function getRound3ApplicationSenderIds(session: GroupMatchingSession) {
  return Object.values(session.round3Applications || {}).map((application) => application.applicantStudentId);
}

export function getCurrentTeacherOwnedSessions() {
  const email = getCurrentTeacherEmail();
  if (!email) {
    return [] as GroupMatchingSession[];
  }
  return loadGroupMatchingSessionsByOwner(email);
}

function createSessionLogEntry(action: string, detail = "") {
  const timestamp = Date.now();
  const randomToken = Math.random().toString(36).slice(2, 10);
  return {
    id: `log_${timestamp}_${randomToken}`,
    at: timestamp,
    action: action.trim(),
    detail: detail.trim()
  } as GroupSessionLogEntry;
}

export function appendSessionActionLog(sessionId: string, action: string, detail = "") {
  const session = getGroupMatchingSession(sessionId);
  if (!session) {
    return null;
  }

  const nextLogs = [...(session.actionLogs || []), createSessionLogEntry(action, detail)].slice(-500);
  const nextSession: GroupMatchingSession = {
    ...session,
    actionLogs: nextLogs,
    updatedAt: Date.now()
  };

  return upsertGroupMatchingSession(nextSession);
}
