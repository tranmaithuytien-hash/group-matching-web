"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  activeClassIdKey,
  classAppStateRef,
  classParticipantDoc,
  classParticipantsCollection,
  classRound1VoteDoc,
  classRound2LeaderRankingDoc,
  classRound2MemberPreferenceDoc,
  classRound3ApplicationDoc,
  classRound3ApplicationsCollection,
  classRound3RoomDoc,
  classRound3RoomsCollection,
  resetCounterKey,
  round1DraftKey,
  round2LeaderDraftKey,
  round2MemberDraftKey,
  round3ApplicationDraftKey,
  round3RoomDraftKey,
  studentIdKey,
  studentNameKey
} from "../../lib/classHelpers";

type Participant = {
  docId: string;
  studentId: string;
  fullName: string;
  ranking: number;
  roleAfterRound1?: "leader" | "member" | "pending";
};

type LeaderResult = {
  studentId: string;
  fullName: string;
  ranking: number;
  voteCount: number;
};

type MatchingGroup = {
  leaderStudentId: string;
  leaderFullName: string;
  capacity: number;
  memberStudentIds: string[];
  memberFullNames: string[];
};

type Round3Room = {
  docId: string;
  leaderStudentId: string;
  roomName: string;
  observerMemberIds: string[];
  observerMemberFullNames: string[];
  admittedMemberIds: string[];
  admittedMemberFullNames: string[];
};

type Round3Application = {
  docId: string;
  applicantStudentId: string;
  targetLeaderStudentId: string;
  targetRoomName: string;
  applicationLetter: string;
  submittedAtMs: number;
  visibleDurationMs: number;
  isLateSubmission: boolean;
  status: "pending" | "accepted" | "rejected" | "expired";
};

type Round3ResultGroup = {
  leaderStudentId: string;
  leaderFullName: string;
  roomName: string;
  capacity: number;
  memberStudentIds: string[];
  memberFullNames: string[];
};

type UnmatchedStudent = {
  studentId: string;
  fullName: string;
};

type ArrayDraft = {
  resetCounter: string;
  values: string[];
};

type RoomDraft = {
  resetCounter: string;
  roomName: string;
};

type ApplicationDraft = {
  resetCounter: string;
  targetLeaderStudentId: string;
  applicationLetter: string;
};

function getRoundLabel(currentRound?: string) {
  switch (currentRound) {
    case "waiting":
      return "Phòng chờ";
    case "round1":
      return "Vòng 1";
    case "round2":
      return "Vòng 2";
    case "round3":
      return "Vòng 3";
    case "round3_completed":
      return "Đã chốt Vòng 3";
    case "round4_completed":
      return "Kết thúc trò chơi";
    default:
      return "Phòng chờ";
  }
}

function getLeaderQuota(
  leaders: LeaderResult[],
  currentStudentId: string,
  participantCount: number
) {
  const leaderIndex = leaders.findIndex((leader) => leader.studentId === currentStudentId);
  const leaderCount = leaders.length;

  if (leaderIndex < 0 || leaderCount <= 0) {
    return 0;
  }

  const totalMembers = Math.max(participantCount - leaderCount, 0);
  const baseQuota = Math.floor(totalMembers / leaderCount);
  const extraSlots = totalMembers % leaderCount;

  return baseQuota + (leaderIndex < extraSlots ? 1 : 0);
}

function buildEmptyArray(length: number) {
  return Array.from({ length }, () => "");
}

function getActiveResetCounter() {
  const activeClassId = localStorage.getItem(activeClassIdKey()) || "";

  if (!activeClassId) {
    return "0";
  }

  return localStorage.getItem(resetCounterKey(activeClassId)) || "0";
}

function getMillisFromUnknown(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: () => number }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }

  return 0;
}

function getApplicationExpiresAt(application: Round3Application) {
  return application.submittedAtMs + application.visibleDurationMs;
}

function formatCountdown(milliseconds: number) {
  if (milliseconds <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function readArrayDraft(key: string, expectedLength: number) {
  const rawValue = localStorage.getItem(key);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ArrayDraft | string[];

    if (Array.isArray(parsedValue)) {
      localStorage.removeItem(key);
      return null;
    }

    if (
      !parsedValue ||
      parsedValue.resetCounter !== getActiveResetCounter() ||
      !Array.isArray(parsedValue.values) ||
      parsedValue.values.length !== expectedLength
    ) {
      localStorage.removeItem(key);
      return null;
    }

    return parsedValue.values;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function writeArrayDraft(key: string, values: string[]) {
  const payload: ArrayDraft = {
    resetCounter: getActiveResetCounter(),
    values
  };

  localStorage.setItem(key, JSON.stringify(payload));
}

function readRoomDraft(key: string) {
  const rawValue = localStorage.getItem(key);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as RoomDraft;

    if (!parsedValue || parsedValue.resetCounter !== getActiveResetCounter()) {
      localStorage.removeItem(key);
      return null;
    }

    return parsedValue.roomName || "";
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function writeRoomDraft(key: string, roomName: string) {
  const payload: RoomDraft = {
    resetCounter: getActiveResetCounter(),
    roomName
  };

  localStorage.setItem(key, JSON.stringify(payload));
}

function readApplicationDraft(key: string) {
  const rawValue = localStorage.getItem(key);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as ApplicationDraft;

    if (!parsedValue || parsedValue.resetCounter !== getActiveResetCounter()) {
      localStorage.removeItem(key);
      return null;
    }

    return {
      targetLeaderStudentId: parsedValue.targetLeaderStudentId || "",
      applicationLetter: parsedValue.applicationLetter || ""
    };
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function writeApplicationDraft(
  key: string,
  targetLeaderStudentId: string,
  applicationLetter: string
) {
  const payload: ApplicationDraft = {
    resetCounter: getActiveResetCounter(),
    targetLeaderStudentId,
    applicationLetter
  };

  localStorage.setItem(key, JSON.stringify(payload));
}

export default function WaitingPage() {
  const router = useRouter();
  const params = useParams<{ code?: string }>();
  const routeClassCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const [classCode, setClassCode] = useState("");
  const [name, setName] = useState("Không rõ sinh viên");
  const [studentId, setStudentId] = useState("");
  const [roundStatus, setRoundStatus] = useState("Vui lòng chờ Giảng viên mở Vòng 1.");
  const [currentRound, setCurrentRound] = useState("waiting");
  const [round3StartedAtMs, setRound3StartedAtMs] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedVotes, setSelectedVotes] = useState(["", "", "", ""]);
  const [submittedVotes, setSubmittedVotes] = useState<string[]>([]);
  const [top4Leaders, setTop4Leaders] = useState<LeaderResult[]>([]);
  const [leadersVisible, setLeadersVisible] = useState(false);
  const [round2Matched, setRound2Matched] = useState(false);
  const [matchingResults, setMatchingResults] = useState<MatchingGroup[]>([]);
  const [round3Rooms, setRound3Rooms] = useState<Round3Room[]>([]);
  const [round3Applications, setRound3Applications] = useState<Round3Application[]>([]);
  const [round3Results, setRound3Results] = useState<Round3ResultGroup[]>([]);
  const [round3UnmatchedStudents, setRound3UnmatchedStudents] = useState<UnmatchedStudent[]>([]);
  const [finalGroups, setFinalGroups] = useState<Round3ResultGroup[]>([]);
  const [isSubmittingRound1, setIsSubmittingRound1] = useState(false);
  const [isSubmittingMemberPreference, setIsSubmittingMemberPreference] = useState(false);
  const [isSubmittingLeaderRanking, setIsSubmittingLeaderRanking] = useState(false);
  const [isSubmittingRoom, setIsSubmittingRoom] = useState(false);
  const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);
  const [reviewingApplicationId, setReviewingApplicationId] = useState("");
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [currentParticipantRole, setCurrentParticipantRole] = useState<
    "leader" | "member" | "pending"
  >("pending");
  const [selectedMemberPreferences, setSelectedMemberPreferences] = useState(["", ""]);
  const [submittedMemberPreferences, setSubmittedMemberPreferences] = useState<string[]>([]);
  const [selectedLeaderRanking, setSelectedLeaderRanking] = useState<string[]>([]);
  const [submittedLeaderRanking, setSubmittedLeaderRanking] = useState<string[]>([]);
  const [roomName, setRoomName] = useState("");
  const [selectedTargetLeaderId, setSelectedTargetLeaderId] = useState("");
  const [applicationLetter, setApplicationLetter] = useState("");

  useEffect(() => {
    if (currentRound !== "round3") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentRound]);

  useEffect(() => {
    const resolvedClassCode = routeClassCode || localStorage.getItem(activeClassIdKey()) || "";

    if (!resolvedClassCode) {
      router.replace("/");
      return;
    }

    localStorage.setItem(activeClassIdKey(), resolvedClassCode);
    setClassCode(resolvedClassCode);

    const savedName = localStorage.getItem(studentNameKey(resolvedClassCode));
    const savedStudentId = localStorage.getItem(studentIdKey(resolvedClassCode));

    if (!savedName || !savedStudentId) {
      router.replace(`/class/${resolvedClassCode}`);
      return;
    }

    setName(savedName);
    setStudentId(savedStudentId);
    setIsSessionReady(true);

    const unsubscribeAppState = onSnapshot(
      classAppStateRef(resolvedClassCode),
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const data = snapshot.data() as {
          currentRound?: string;
          waitingMessage?: string;
          leadersVisible?: boolean;
          top4Leaders?: LeaderResult[];
          round2Matched?: boolean;
          matchingResults?: MatchingGroup[];
          round3StartedAt?: unknown;
          round3Results?: Round3ResultGroup[];
          round3UnmatchedStudents?: UnmatchedStudent[];
          finalGroups?: Round3ResultGroup[];
          resetCounter?: number;
        };

        const newResetCounter = String(data.resetCounter || "");
        const savedResetCounter = localStorage.getItem(resetCounterKey(resolvedClassCode));

        if (newResetCounter) {
          if (savedResetCounter && savedResetCounter !== newResetCounter) {
            localStorage.removeItem(studentIdKey(resolvedClassCode));
            localStorage.removeItem(studentNameKey(resolvedClassCode));
            localStorage.removeItem(round1DraftKey(resolvedClassCode, savedStudentId));
            localStorage.removeItem(round2MemberDraftKey(resolvedClassCode, savedStudentId));
            localStorage.removeItem(round2LeaderDraftKey(resolvedClassCode, savedStudentId));
            localStorage.removeItem(round3RoomDraftKey(resolvedClassCode, savedStudentId));
            localStorage.removeItem(round3ApplicationDraftKey(resolvedClassCode, savedStudentId));
            localStorage.setItem(resetCounterKey(resolvedClassCode), newResetCounter);
            router.replace(`/class/${resolvedClassCode}`);
            return;
          }

          localStorage.setItem(resetCounterKey(resolvedClassCode), newResetCounter);
        }

        setCurrentRound(data.currentRound || "waiting");
        setRoundStatus(data.waitingMessage || "Vui lòng chờ Giảng viên mở Vòng 1.");
        setLeadersVisible(Boolean(data.leadersVisible));
        setTop4Leaders(data.top4Leaders || []);
        setRound2Matched(Boolean(data.round2Matched));
        setMatchingResults(data.matchingResults || []);
        setRound3StartedAtMs(getMillisFromUnknown(data.round3StartedAt));
        setRound3Results(data.round3Results || []);
        setRound3UnmatchedStudents(data.round3UnmatchedStudents || []);
        setFinalGroups(data.finalGroups || []);
      }
    );

    const unsubscribeParticipants = onSnapshot(
      classParticipantsCollection(resolvedClassCode),
      (snapshot) => {
        const items = snapshot.docs.map((docItem) => {
          const data = docItem.data() as {
            studentId?: string;
            fullName?: string;
            ranking?: number;
            roleAfterRound1?: "leader" | "member" | "pending";
          };

          return {
            docId: docItem.id,
            studentId: data.studentId || docItem.id,
            fullName: data.fullName || "Không rõ tên",
            ranking: data.ranking || 0,
            roleAfterRound1: data.roleAfterRound1 || "pending"
          };
        });

        items.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setParticipants(items);

        const currentParticipant = items.find(
          (participant) => participant.studentId === savedStudentId
        );

        setCurrentParticipantRole(currentParticipant?.roleAfterRound1 || "pending");
      }
    );

    const unsubscribeRound3Rooms = onSnapshot(
      classRound3RoomsCollection(resolvedClassCode),
      (snapshot) => {
        const items = snapshot.docs.map((docItem) => {
          const data = docItem.data() as {
            leaderStudentId?: string;
            roomName?: string;
            observerMemberIds?: string[];
            observerMemberFullNames?: string[];
            admittedMemberIds?: string[];
            admittedMemberFullNames?: string[];
          };

          return {
            docId: docItem.id,
            leaderStudentId: data.leaderStudentId || docItem.id,
            roomName: data.roomName || "",
            observerMemberIds: data.observerMemberIds || [],
            observerMemberFullNames: data.observerMemberFullNames || [],
            admittedMemberIds: data.admittedMemberIds || [],
            admittedMemberFullNames: data.admittedMemberFullNames || []
          };
        });

        setRound3Rooms(items);
      }
    );

    const unsubscribeRound3Applications = onSnapshot(
      classRound3ApplicationsCollection(resolvedClassCode),
      (snapshot) => {
        const items = snapshot.docs.map((docItem) => {
          const data = docItem.data() as {
            applicantStudentId?: string;
            targetLeaderStudentId?: string;
            targetRoomName?: string;
            applicationLetter?: string;
            submittedAtMs?: number;
            visibleDurationMs?: number;
            isLateSubmission?: boolean;
            status?: "pending" | "accepted" | "rejected" | "expired";
            submittedAt?: unknown;
          };

          return {
            docId: docItem.id,
            applicantStudentId: data.applicantStudentId || docItem.id,
            targetLeaderStudentId: data.targetLeaderStudentId || "",
            targetRoomName: data.targetRoomName || "",
            applicationLetter: data.applicationLetter || "",
            submittedAtMs: data.submittedAtMs || getMillisFromUnknown(data.submittedAt),
            visibleDurationMs: data.visibleDurationMs || 5 * 60 * 1000,
            isLateSubmission: Boolean(data.isLateSubmission),
            status: data.status || "pending"
          };
        });

        setRound3Applications(items);
      }
    );

    return () => {
      unsubscribeAppState();
      unsubscribeParticipants();
      unsubscribeRound3Rooms();
      unsubscribeRound3Applications();
    };
  }, [routeClassCode, router]);

  useEffect(() => {
    if (currentRound !== "round3") {
      return;
    }

    const expiredApplications = round3Applications.filter(
      (application) =>
        application.status === "pending" &&
        application.submittedAtMs > 0 &&
        nowMs > getApplicationExpiresAt(application)
    );

    if (expiredApplications.length === 0) {
      return;
    }

    void (async () => {
      const batch = writeBatch(db);

      expiredApplications.forEach((application) => {
        batch.set(
          classRound3ApplicationDoc(classCode, application.docId),
          {
            status: "expired",
            reviewedAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      await batch.commit();
    })();
  }, [currentRound, nowMs, round3Applications]);

  const leaderQuota = useMemo(() => {
    return getLeaderQuota(top4Leaders, studentId, participants.length);
  }, [participants.length, top4Leaders, studentId]);

  useEffect(() => {
    if (!studentId) {
      return;
    }

    const currentRound1DraftKey = round1DraftKey(classCode, studentId);
    const currentRound2MemberDraftKey = round2MemberDraftKey(classCode, studentId);
    const currentRound2LeaderDraftKey = round2LeaderDraftKey(classCode, studentId);
    const currentRound3RoomDraftKey = round3RoomDraftKey(classCode, studentId);
    const currentRound3ApplicationDraftKey = round3ApplicationDraftKey(classCode, studentId);

    const savedRound1Draft = readArrayDraft(currentRound1DraftKey, 4);

    if (savedRound1Draft) {
      setSelectedVotes(savedRound1Draft);
    }

    const savedRound2MemberDraft = readArrayDraft(currentRound2MemberDraftKey, 2);

    if (savedRound2MemberDraft) {
      setSelectedMemberPreferences(savedRound2MemberDraft);
    }

    const savedRound3RoomDraft = readRoomDraft(currentRound3RoomDraftKey);

    if (savedRound3RoomDraft) {
      setRoomName(savedRound3RoomDraft);
    }

    const savedRound3ApplicationDraft = readApplicationDraft(currentRound3ApplicationDraftKey);

    if (savedRound3ApplicationDraft) {
      setSelectedTargetLeaderId(savedRound3ApplicationDraft.targetLeaderStudentId);
      setApplicationLetter(savedRound3ApplicationDraft.applicationLetter);
    }

    const unsubscribeVote = onSnapshot(classRound1VoteDoc(classCode, studentId), (snapshot) => {
      if (!snapshot.exists()) {
        setSubmittedVotes([]);
        const restoredDraft = readArrayDraft(currentRound1DraftKey, 4);
        setSelectedVotes(restoredDraft || ["", "", "", ""]);
        return;
      }

      const data = snapshot.data() as {
        votedStudentIds?: string[];
      };

      const savedVotes = data.votedStudentIds || [];
      setSubmittedVotes(savedVotes);
      setSelectedVotes([
        savedVotes[0] || "",
        savedVotes[1] || "",
        savedVotes[2] || "",
        savedVotes[3] || ""
      ]);
      localStorage.removeItem(currentRound1DraftKey);
    });

    const unsubscribeMemberPreference = onSnapshot(
      classRound2MemberPreferenceDoc(classCode, studentId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setSubmittedMemberPreferences([]);
          return;
        }

        const data = snapshot.data() as {
          preferredLeaderIds?: string[];
        };

        const savedPreferences = data.preferredLeaderIds || [];
        setSubmittedMemberPreferences(savedPreferences);
        setSelectedMemberPreferences([
          savedPreferences[0] || "",
          savedPreferences[1] || ""
        ]);
        localStorage.removeItem(currentRound2MemberDraftKey);
      }
    );

    const unsubscribeLeaderRanking = onSnapshot(
      classRound2LeaderRankingDoc(classCode, studentId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setSubmittedLeaderRanking([]);
          return;
        }

        const data = snapshot.data() as {
          preferredMemberIds?: string[];
        };

        const savedRanking = data.preferredMemberIds || [];
        setSubmittedLeaderRanking(savedRanking);
        setSelectedLeaderRanking(savedRanking);
        localStorage.removeItem(currentRound2LeaderDraftKey);
      }
    );

    return () => {
      unsubscribeVote();
      unsubscribeMemberPreference();
      unsubscribeLeaderRanking();
    };
  }, [classCode, studentId]);

  useEffect(() => {
    if (!studentId || submittedVotes.length > 0) {
      return;
    }

    writeArrayDraft(round1DraftKey(classCode, studentId), selectedVotes);
  }, [classCode, selectedVotes, studentId, submittedVotes]);

  useEffect(() => {
    if (!studentId || currentParticipantRole !== "member" || submittedMemberPreferences.length > 0) {
      return;
    }

    writeArrayDraft(round2MemberDraftKey(classCode, studentId), selectedMemberPreferences);
  }, [classCode, selectedMemberPreferences, studentId, currentParticipantRole, submittedMemberPreferences]);

  useEffect(() => {
    if (
      !studentId ||
      currentParticipantRole !== "leader" ||
      leaderQuota <= 0 ||
      submittedLeaderRanking.length > 0
    ) {
      return;
    }

    if (selectedLeaderRanking.length === leaderQuota) {
      writeArrayDraft(round2LeaderDraftKey(classCode, studentId), selectedLeaderRanking);
    }
  }, [classCode, selectedLeaderRanking, studentId, currentParticipantRole, leaderQuota, submittedLeaderRanking]);

  useEffect(() => {
    if (!studentId || currentParticipantRole !== "leader") {
      return;
    }

    if (!roomName.trim()) {
      localStorage.removeItem(round3RoomDraftKey(classCode, studentId));
      return;
    }

    writeRoomDraft(round3RoomDraftKey(classCode, studentId), roomName);
  }, [classCode, roomName, studentId, currentParticipantRole]);

  const submittedApplication = useMemo(() => {
    return round3Applications.find((application) => application.applicantStudentId === studentId) || null;
  }, [round3Applications, studentId]);

  useEffect(() => {
    if (!studentId || currentParticipantRole !== "member" || submittedApplication) {
      return;
    }

    if (!selectedTargetLeaderId && !applicationLetter.trim()) {
      localStorage.removeItem(round3ApplicationDraftKey(classCode, studentId));
      return;
    }

    writeApplicationDraft(
      round3ApplicationDraftKey(classCode, studentId),
      selectedTargetLeaderId,
      applicationLetter
    );
  }, [classCode, selectedTargetLeaderId, applicationLetter, studentId, currentParticipantRole, submittedApplication]);

  useEffect(() => {
    if (!studentId || currentParticipantRole !== "leader" || leaderQuota <= 0) {
      return;
    }

    if (submittedLeaderRanking.length > 0) {
      setSelectedLeaderRanking(submittedLeaderRanking.slice(0, leaderQuota));
      return;
    }

    const savedDraft = readArrayDraft(round2LeaderDraftKey(classCode, studentId), leaderQuota);

    if (savedDraft) {
      setSelectedLeaderRanking(savedDraft);
      return;
    }

    setSelectedLeaderRanking((currentSelection) => {
      if (currentSelection.length === leaderQuota) {
        return currentSelection;
      }

      return buildEmptyArray(leaderQuota);
    });
  }, [studentId, currentParticipantRole, leaderQuota, submittedLeaderRanking]);

  const votingOptions = useMemo(() => {
    return participants;
  }, [participants]);

  const memberOptions = useMemo(() => {
    return participants.filter((participant) => participant.roleAfterRound1 === "member");
  }, [participants]);

  const currentMatchingGroup = useMemo(() => {
    if (!round2Matched) {
      return null;
    }

    if (currentParticipantRole === "leader") {
      return matchingResults.find((group) => group.leaderStudentId === studentId) || null;
    }

    if (currentParticipantRole === "member") {
      return (
        matchingResults.find((group) => group.memberStudentIds.includes(studentId)) || null
      );
    }

    return null;
  }, [round2Matched, currentParticipantRole, matchingResults, studentId]);

  const currentLeaderRoom = useMemo(() => {
    if (currentParticipantRole !== "leader") {
      return null;
    }

    return round3Rooms.find((room) => room.leaderStudentId === studentId) || null;
  }, [round3Rooms, currentParticipantRole, studentId]);

  const currentObservedRoom = useMemo(() => {
    if (currentParticipantRole !== "member" || !currentMatchingGroup) {
      return null;
    }

    return (
      round3Rooms.find((room) => room.leaderStudentId === currentMatchingGroup.leaderStudentId) ||
      null
    );
  }, [round3Rooms, currentParticipantRole, currentMatchingGroup]);

  const namedRooms = useMemo(() => {
    return top4Leaders
      .map((leader) => {
        const room = round3Rooms.find((item) => item.leaderStudentId === leader.studentId);

        if (!room || !room.roomName.trim()) {
          return null;
        }

        return room;
      })
      .filter(Boolean) as Round3Room[];
  }, [top4Leaders, round3Rooms]);

  const roomCards = useMemo(() => {
    return namedRooms.map((room) => {
      const matchingGroup = matchingResults.find(
        (group) => group.leaderStudentId === room.leaderStudentId
      );
      const currentMemberCount =
        room.observerMemberIds.length + room.admittedMemberIds.length;
      const roomCapacity = matchingGroup?.capacity || 0;

      return {
        ...room,
        currentMemberCount,
        roomCapacity,
        isFull: roomCapacity > 0 && currentMemberCount >= roomCapacity
      };
    });
  }, [namedRooms, matchingResults]);

  const selectedTargetRoomCard = useMemo(() => {
    return roomCards.find((room) => room.leaderStudentId === selectedTargetLeaderId) || null;
  }, [roomCards, selectedTargetLeaderId]);

  const leaderIncomingApplications = useMemo(() => {
    if (currentParticipantRole !== "leader") {
      return [];
    }

    return round3Applications
      .filter((application) => application.targetLeaderStudentId === studentId)
      .sort((a, b) => a.submittedAtMs - b.submittedAtMs);
  }, [round3Applications, currentParticipantRole, studentId]);

  const pendingLeaderApplications = useMemo(() => {
    return leaderIncomingApplications.filter(
      (application) =>
        application.status === "pending" && nowMs <= getApplicationExpiresAt(application)
    );
  }, [leaderIncomingApplications, nowMs]);

  const reviewedLeaderApplications = useMemo(() => {
    return leaderIncomingApplications.filter((application) => application.status !== "pending");
  }, [leaderIncomingApplications]);

  const currentLeaderMemberCount =
    (currentLeaderRoom?.observerMemberIds.length || currentMatchingGroup?.memberStudentIds.length || 0) +
    (currentLeaderRoom?.admittedMemberIds.length || 0);
  const currentLeaderRemainingSlots = Math.max(
    (currentMatchingGroup?.capacity || 0) - currentLeaderMemberCount,
    0
  );

  useEffect(() => {
    if (
      currentRound !== "round3" ||
      currentParticipantRole !== "leader" ||
      currentLeaderRemainingSlots > 0 ||
      pendingLeaderApplications.length === 0
    ) {
      return;
    }

    void (async () => {
      const batch = writeBatch(db);

      pendingLeaderApplications.forEach((application) => {
        batch.set(
          classRound3ApplicationDoc(classCode, application.docId),
          {
            status: "rejected",
            reviewedAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      await batch.commit();
    })();
  }, [
    currentRound,
    currentParticipantRole,
    currentLeaderRemainingSlots,
    pendingLeaderApplications
  ]);

  const round3ChoiceRemainingMs =
    round3StartedAtMs > 0 ? round3StartedAtMs + 5 * 60 * 1000 - nowMs : 0;
  const isRound3ChoiceWindowClosed = round3StartedAtMs > 0 && round3ChoiceRemainingMs <= 0;

  const acceptedRound3Application =
    submittedApplication?.status === "accepted" ? submittedApplication : null;
  const pendingRound3Application =
    submittedApplication?.status === "pending" ? submittedApplication : null;
  const rejectedRound3Application =
    submittedApplication &&
    (submittedApplication.status === "rejected" || submittedApplication.status === "expired")
      ? submittedApplication
      : null;
  const pendingRound3ApplicationRemainingMs = pendingRound3Application
    ? Math.max(getApplicationExpiresAt(pendingRound3Application) - nowMs, 0)
    : 0;

  const acceptedRound3Room = useMemo(() => {
    if (!acceptedRound3Application) {
      return null;
    }

    return (
      round3Rooms.find(
        (room) => room.leaderStudentId === acceptedRound3Application.targetLeaderStudentId
      ) || null
    );
  }, [acceptedRound3Application, round3Rooms]);

  const finalAssignedGroup = useMemo(() => {
    if (currentParticipantRole === "leader") {
      return finalGroups.find((group) => group.leaderStudentId === studentId) || null;
    }

    if (currentParticipantRole === "member") {
      return (
        finalGroups.find((group) => group.memberStudentIds.includes(studentId)) || null
      );
    }

    return null;
  }, [finalGroups, currentParticipantRole, studentId]);

  const handleVoteChange = (index: number, value: string) => {
    const nextVotes = [...selectedVotes];
    nextVotes[index] = value;
    setSelectedVotes(nextVotes);
  };

  const handleMemberPreferenceChange = (index: number, value: string) => {
    const nextPreferences = [...selectedMemberPreferences];
    nextPreferences[index] = value;
    setSelectedMemberPreferences(nextPreferences);
  };

  const handleLeaderRankingChange = (index: number, value: string) => {
    const nextRanking = [...selectedLeaderRanking];
    nextRanking[index] = value;
    setSelectedLeaderRanking(nextRanking);
  };

  const handleSubmitVote = async () => {
    if (!studentId) {
      alert("Không tìm thấy phiên đăng nhập của sinh viên.");
      return;
    }

    if (submittedVotes.length > 0) {
      alert("Bạn đã gửi bình chọn Vòng 1 rồi.");
      return;
    }

    const cleanedVotes = selectedVotes.map((vote) => vote.trim()).filter(Boolean);

    if (cleanedVotes.length !== 4) {
      alert("Vui lòng chọn đủ 4 tên.");
      return;
    }

    const uniqueVotes = new Set(cleanedVotes);

    if (uniqueVotes.size !== 4) {
      alert("Bạn không được chọn trùng tên.");
      return;
    }

    setIsSubmittingRound1(true);

    try {
      await setDoc(classRound1VoteDoc(classCode, studentId), {
        voterStudentId: studentId,
        votedStudentIds: cleanedVotes,
        submittedAt: serverTimestamp()
      });

      localStorage.removeItem(round1DraftKey(classCode, studentId));
      alert("Đã gửi bình chọn Vòng 1 thành công.");
    } catch {
      alert("Không thể gửi bình chọn. Vui lòng thử lại.");
    } finally {
      setIsSubmittingRound1(false);
    }
  };

  const handleSubmitMemberPreferences = async () => {
    if (!studentId) {
      alert("Không tìm thấy phiên đăng nhập của sinh viên.");
      return;
    }

    if (submittedMemberPreferences.length > 0) {
      alert("Bạn đã gửi nguyện vọng Vòng 2 rồi.");
      return;
    }

    const cleanedPreferences = selectedMemberPreferences
      .map((value) => value.trim())
      .filter(Boolean);

    if (cleanedPreferences.length !== 2) {
      alert("Vui lòng chọn đủ 2 nguyện vọng Nhóm trưởng.");
      return;
    }

    if (new Set(cleanedPreferences).size !== 2) {
      alert("Bạn không được chọn trùng Nhóm trưởng.");
      return;
    }

    setIsSubmittingMemberPreference(true);

    try {
      await setDoc(classRound2MemberPreferenceDoc(classCode, studentId), {
        memberStudentId: studentId,
        preferredLeaderIds: cleanedPreferences,
        submittedAt: serverTimestamp()
      });

      localStorage.removeItem(round2MemberDraftKey(classCode, studentId));
      alert("Đã gửi nguyện vọng Vòng 2 thành công.");
    } catch {
      alert("Không thể gửi nguyện vọng. Vui lòng thử lại.");
    } finally {
      setIsSubmittingMemberPreference(false);
    }
  };

  const handleSubmitLeaderRanking = async () => {
    if (!studentId) {
      alert("Không tìm thấy phiên đăng nhập của Nhóm trưởng.");
      return;
    }

    if (submittedLeaderRanking.length > 0) {
      alert("Bạn đã gửi danh sách ưu tiên Vòng 2 rồi.");
      return;
    }

    const cleanedRanking = selectedLeaderRanking.map((value) => value.trim()).filter(Boolean);

    if (cleanedRanking.length !== leaderQuota) {
      alert(`Vui lòng chọn đủ ${leaderQuota} Thành viên.`);
      return;
    }

    if (new Set(cleanedRanking).size !== leaderQuota) {
      alert("Bạn không được chọn trùng Thành viên.");
      return;
    }

    setIsSubmittingLeaderRanking(true);

    try {
      await setDoc(classRound2LeaderRankingDoc(classCode, studentId), {
        leaderStudentId: studentId,
        preferredMemberIds: cleanedRanking,
        submittedAt: serverTimestamp()
      });

      localStorage.removeItem(round2LeaderDraftKey(classCode, studentId));
      alert("Đã gửi danh sách ưu tiên Vòng 2 thành công.");
    } catch {
      alert("Không thể gửi danh sách ưu tiên. Vui lòng thử lại.");
    } finally {
      setIsSubmittingLeaderRanking(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!studentId || currentParticipantRole !== "leader") {
      alert("Chỉ Nhóm trưởng mới có thể tạo phòng.");
      return;
    }

    const trimmedRoomName = roomName.trim();

    if (!trimmedRoomName) {
      alert("Vui lòng nhập tên phòng.");
      return;
    }

    if (currentLeaderRoom?.roomName.trim()) {
      alert("Bạn đã tạo phòng rồi.");
      return;
    }

    setIsSubmittingRoom(true);

    try {
      await setDoc(classRound3RoomDoc(classCode, studentId), {
        leaderStudentId: studentId,
        roomName: trimmedRoomName,
        observerMemberIds: currentMatchingGroup?.memberStudentIds || [],
        observerMemberFullNames: currentMatchingGroup?.memberFullNames || [],
        admittedMemberIds: [],
        admittedMemberFullNames: [],
        createdAt: serverTimestamp()
      });

      localStorage.removeItem(round3RoomDraftKey(classCode, studentId));
      alert("Đã tạo phòng Vòng 3 thành công.");
    } catch {
      alert("Không thể tạo phòng. Vui lòng thử lại.");
    } finally {
      setIsSubmittingRoom(false);
    }
  };

  const handleSubmitRound3Application = async () => {
    if (!studentId || currentParticipantRole !== "member") {
      alert("Chỉ Thành viên mới có thể gửi thư xin gia nhập.");
      return;
    }

    if (submittedApplication) {
      alert("Bạn đã gửi thư xin gia nhập rồi.");
      return;
    }

    if (!selectedTargetRoomCard) {
      alert("Vui lòng chọn 1 phòng.");
      return;
    }

    if (selectedTargetRoomCard.isFull) {
      alert("Phòng này đã đủ thành viên.");
      return;
    }

    const trimmedLetter = applicationLetter.trim();

    if (!trimmedLetter) {
      alert("Vui lòng viết thư xin gia nhập.");
      return;
    }

    const submittedAtMs = Date.now();
    const isLateSubmission =
      round3StartedAtMs > 0 && submittedAtMs > round3StartedAtMs + 5 * 60 * 1000;
    const visibleDurationMs = isLateSubmission ? 3 * 60 * 1000 : 5 * 60 * 1000;

    setIsSubmittingApplication(true);

    try {
      await setDoc(classRound3ApplicationDoc(classCode, studentId), {
        applicantStudentId: studentId,
        targetLeaderStudentId: selectedTargetRoomCard.leaderStudentId,
        targetRoomName: selectedTargetRoomCard.roomName,
        applicationLetter: trimmedLetter,
        submittedAtMs,
        visibleDurationMs,
        isLateSubmission,
        status: "pending",
        submittedAt: serverTimestamp()
      });

      localStorage.removeItem(round3ApplicationDraftKey(classCode, studentId));
      alert("Đã gửi thư xin gia nhập thành công.");
    } catch {
      alert("Không thể gửi thư xin gia nhập. Vui lòng thử lại.");
    } finally {
      setIsSubmittingApplication(false);
    }
  };

  const handleReviewApplication = async (
    application: Round3Application,
    decision: "accepted" | "rejected"
  ) => {
    if (!studentId || currentParticipantRole !== "leader") {
      return;
    }

    if (application.status !== "pending") {
      return;
    }

    if (nowMs > getApplicationExpiresAt(application)) {
      alert("Lá thư này đã quá thời gian hiển thị.");
      return;
    }

    if (decision === "accepted" && currentLeaderRemainingSlots <= 0) {
      alert("Phòng của bạn đã đủ thành viên.");
      return;
    }

    const applicant = participants.find(
      (participant) => participant.studentId === application.applicantStudentId
    );

    if (!applicant) {
      alert("Không tìm thấy sinh viên gửi thư.");
      return;
    }

    setReviewingApplicationId(application.docId);

    try {
      const batch = writeBatch(db);

      if (decision === "accepted") {
        const admittedIds = currentLeaderRoom?.admittedMemberIds || [];
        const admittedNames = currentLeaderRoom?.admittedMemberFullNames || [];

        batch.set(
          classRound3RoomDoc(classCode, studentId),
          {
            admittedMemberIds: admittedIds.includes(applicant.studentId)
              ? admittedIds
              : [...admittedIds, applicant.studentId],
            admittedMemberFullNames: admittedNames.includes(applicant.fullName)
              ? admittedNames
              : [...admittedNames, applicant.fullName]
          },
          { merge: true }
        );
      }

      batch.set(
        classRound3ApplicationDoc(classCode, application.docId),
        {
          status: decision,
          reviewedAt: serverTimestamp()
        },
        { merge: true }
      );

      await batch.commit();
    } catch {
      alert("Không thể xử lý lá thư này. Vui lòng thử lại.");
    } finally {
      setReviewingApplicationId("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(studentIdKey(classCode));
    localStorage.removeItem(studentNameKey(classCode));
    router.push(classCode ? `/class/${classCode}` : "/");
  };

  const submittedParticipants = submittedVotes
    .map((voteId) =>
      participants.find((participant) => participant.studentId === voteId)
    )
    .filter(Boolean) as Participant[];

  const submittedPreferredLeaders = submittedMemberPreferences
    .map((leaderId) => top4Leaders.find((leader) => leader.studentId === leaderId))
    .filter(Boolean) as LeaderResult[];

  const submittedPreferredMembers = submittedLeaderRanking
    .map((memberId) => memberOptions.find((member) => member.studentId === memberId))
    .filter(Boolean) as Participant[];

  const matchedMemberInRound3 =
    currentRound === "round3" &&
    currentParticipantRole === "member" &&
    round2Matched &&
    Boolean(currentMatchingGroup);

  const leaderInRound3 =
    currentRound === "round3" && currentParticipantRole === "leader" && round2Matched;

  const acceptedApplicantInRound3 =
    currentRound === "round3" &&
    currentParticipantRole === "member" &&
    !currentMatchingGroup &&
    Boolean(acceptedRound3Application);

  const pendingApplicantInRound3 =
    currentRound === "round3" &&
    currentParticipantRole === "member" &&
    !currentMatchingGroup &&
    Boolean(pendingRound3Application);

  const rejectedApplicantInRound3 =
    currentRound === "round3" &&
    currentParticipantRole === "member" &&
    !currentMatchingGroup &&
    Boolean(rejectedRound3Application);

  const canApplyInRound3 =
    currentRound === "round3" &&
    currentParticipantRole === "member" &&
    !currentMatchingGroup &&
    !submittedApplication;

  const hasSubmittedRound1 = submittedVotes.length > 0;
  const hasSubmittedMemberPreferences = submittedMemberPreferences.length > 0;
  const hasSubmittedLeaderRanking = submittedLeaderRanking.length > 0;
  const isRound1Open = currentRound === "round1" && !leadersVisible;
  const isRound2Open = currentRound === "round2";

  if (!isSessionReady) {
    return (
      <main className="page-shell">
        <section className="card">
          <h1>Đang tải phiên Sinh viên...</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="card card-wide">
        <span className="eyebrow">Khu vực Sinh viên</span>
        <h1>Xin chào, {name}</h1>

        <div className="button-stack">
          <button className="secondary-button" onClick={handleLogout}>
            Đăng xuất và quay về trang chủ
          </button>
        </div>

        {currentRound === "waiting" ? (
          <>
            <div className="status-box">
              <p className="status-label">Vòng hiện tại</p>
              <p className="status-value">{getRoundLabel(currentRound)}</p>
            </div>

            <div className="status-box">
              <p className="status-label">Trạng thái</p>
              <p className="status-value">{roundStatus}</p>
            </div>
          </>
        ) : (
          <div className="student-status-row">
            <div className="status-box status-box-compact">
              <p className="status-label">Vòng hiện tại</p>
              <p className="status-value status-value-compact">{getRoundLabel(currentRound)}</p>
            </div>

            <div className="status-box status-box-compact">
              <p className="status-label">Trạng thái</p>
              <p className="status-value status-value-compact">{roundStatus}</p>
            </div>
          </div>
        )}

        {leadersVisible ? (
          <>
            <div className="status-box">
              <p className="status-label">Vai trò của bạn sau Vòng 1</p>
              <p className="status-value">
                {currentParticipantRole === "leader"
                  ? "Nhóm trưởng"
                  : currentParticipantRole === "member"
                    ? "Thành viên"
                    : "Chưa xác định"}
              </p>
            </div>

            <div className="status-box">
              <p className="status-label">{top4Leaders.length} Nhóm trưởng chính thức</p>
              <div className="name-list">
                {top4Leaders.map((leader, index) => (
                  <div className="name-item" key={leader.studentId}>
                    {index + 1}. {leader.fullName}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {currentRound !== "round3" && round2Matched && currentMatchingGroup ? (
          <div className="status-box">
            <p className="status-label">Kết quả matching Vòng 2</p>
            {currentParticipantRole === "leader" ? (
              <>
                <p className="status-value">Bạn là Nhóm trưởng của nhóm này.</p>
                <div className="name-list">
                  {currentMatchingGroup.memberFullNames.length > 0 ? (
                    currentMatchingGroup.memberFullNames.map((memberName, index) => (
                      <div
                        className="name-item"
                        key={`${currentMatchingGroup.leaderStudentId}-${memberName}`}
                      >
                        Thành viên {index + 1}: {memberName}
                      </div>
                    ))
                  ) : (
                    <div className="name-item">Bạn chưa có bất kì thành viên nào</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="status-value">
                  Bạn đã được xếp vào nhóm của {currentMatchingGroup.leaderFullName}.
                </p>
                <div className="name-list">
                  {currentMatchingGroup.memberFullNames.map((memberName, index) => (
                    <div
                      className="name-item"
                      key={`${currentMatchingGroup.leaderStudentId}-${memberName}`}
                    >
                      Thành viên {index + 1}: {memberName}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {leadersVisible && !isRound2Open && !round2Matched && currentParticipantRole === "leader" ? (
          <div className="status-box">
            <p className="status-label">Vai trò của bạn</p>
            <p className="status-value">
              Ở vòng tiếp theo, bạn cần chọn ra {leaderQuota} thành viên theo nguyện vọng của mình và sắp xếp theo thứ tự ưu tiên.
            </p>
          </div>
        ) : null}

        {leadersVisible && !isRound2Open && !round2Matched && currentParticipantRole === "member" ? (
          <div className="status-box">
            <p className="status-label">Vai trò của bạn</p>
            <p className="status-value">
              Bạn là Thành viên. Ở bước tiếp theo, bạn sẽ chọn 2 nguyện vọng Nhóm trưởng.
            </p>
          </div>
        ) : null}

        {isRound2Open && currentParticipantRole === "member" ? (
          <>
            <div className="status-box">
              <p className="status-label">Vai trò của bạn</p>
              <p className="status-value">
                Bạn là Thành viên. Hãy chọn 2 nguyện vọng Nhóm trưởng.
              </p>
            </div>

            {hasSubmittedMemberPreferences ? (
              <div className="status-box">
                <p className="status-label">Nguyện vọng Vòng 2</p>
                <p className="status-value">Bạn đã gửi nguyện vọng và hiện đã bị khóa.</p>
              </div>
            ) : (
              <>
                <label className="field">
                  <span>Nguyện vọng 1</span>
                  <select
                    value={selectedMemberPreferences[0]}
                    onChange={(event) => handleMemberPreferenceChange(0, event.target.value)}
                  >
                    <option value="">-- Chọn Nhóm trưởng --</option>
                    {top4Leaders.map((leader) => (
                      <option key={leader.studentId} value={leader.studentId}>
                        {leader.fullName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Nguyện vọng 2</span>
                  <select
                    value={selectedMemberPreferences[1]}
                    onChange={(event) => handleMemberPreferenceChange(1, event.target.value)}
                  >
                    <option value="">-- Chọn Nhóm trưởng --</option>
                    {top4Leaders.map((leader) => (
                      <option key={leader.studentId} value={leader.studentId}>
                        {leader.fullName}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="primary-button"
                  onClick={handleSubmitMemberPreferences}
                  disabled={isSubmittingMemberPreference}
                >
                  {isSubmittingMemberPreference
                    ? "Đang gửi..."
                    : "Gửi nguyện vọng Vòng 2"}
                </button>
              </>
            )}

            {submittedPreferredLeaders.length > 0 ? (
              <div className="status-box" style={{ marginTop: 16 }}>
                <p className="status-label">2 nguyện vọng bạn đã gửi</p>
                <div className="name-list">
                  {submittedPreferredLeaders.map((leader, index) => (
                    <div className="name-item" key={leader.studentId}>
                      Nguyện vọng {index + 1}: {leader.fullName}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {isRound2Open && currentParticipantRole === "leader" ? (
          <>
            <div className="status-box">
              <p className="status-label">Vai trò của bạn</p>
              <p className="status-value">
                Ở vòng tiếp theo, bạn cần chọn ra {leaderQuota} thành viên theo nguyện vọng của mình và sắp xếp theo thứ tự ưu tiên.
              </p>
            </div>

            {hasSubmittedLeaderRanking ? (
              <div className="status-box">
                <p className="status-label">Danh sách ưu tiên Vòng 2</p>
                <p className="status-value">Bạn đã gửi danh sách ưu tiên và hiện đã bị khóa.</p>
              </div>
            ) : (
              <>
                {buildEmptyArray(leaderQuota).map((_, index) => (
                  <label className="field" key={index}>
                    <span>Ưu tiên {index + 1}</span>
                    <select
                      value={selectedLeaderRanking[index] || ""}
                      onChange={(event) => handleLeaderRankingChange(index, event.target.value)}
                    >
                      <option value="">-- Chọn Thành viên --</option>
                      {memberOptions.map((member) => (
                        <option key={member.studentId} value={member.studentId}>
                          {member.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}

                <button
                  className="primary-button"
                  onClick={handleSubmitLeaderRanking}
                  disabled={isSubmittingLeaderRanking}
                >
                  {isSubmittingLeaderRanking
                    ? "Đang gửi..."
                    : "Gửi danh sách ưu tiên Vòng 2"}
                </button>
              </>
            )}

            {submittedPreferredMembers.length > 0 ? (
              <div className="status-box" style={{ marginTop: 16 }}>
                <p className="status-label">Danh sách ưu tiên bạn đã gửi</p>
                <div className="name-list">
                  {submittedPreferredMembers.map((member, index) => (
                    <div className="name-item" key={member.studentId}>
                      Ưu tiên {index + 1}: {member.fullName}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {leaderInRound3 ? (
          <>
            <div className="status-box">
              <p className="status-label">Vai trò của bạn</p>
              <p className="status-value">
                Bạn là Nhóm trưởng. Hãy đặt tên phòng theo cách ẩn danh, mang tính mô tả mục tiêu của nhóm và gợi nhẹ phong cách dẫn dắt của bạn.
              </p>
            </div>

            <div className="status-box">
              <p className="status-label">Thành viên hiện có trong phòng</p>
              <div className="name-list">
                {currentLeaderRoom?.observerMemberFullNames.length ||
                currentLeaderRoom?.admittedMemberFullNames.length ||
                currentMatchingGroup?.memberFullNames.length ? (
                  <>
                    {(currentLeaderRoom?.observerMemberFullNames.length
                      ? currentLeaderRoom.observerMemberFullNames
                      : currentMatchingGroup?.memberFullNames || []
                    ).map((memberName) => (
                      <div className="name-item" key={`${studentId}-observer-${memberName}`}>
                        {memberName} (quan sát)
                      </div>
                    ))}
                    {(currentLeaderRoom?.admittedMemberFullNames || []).map((memberName) => (
                      <div className="name-item" key={`${studentId}-admitted-${memberName}`}>
                        {memberName} (đã duyệt)
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="name-item">Bạn chưa có bất kì thành viên nào</div>
                )}
              </div>
              <p className="muted-text">
                Số chỗ còn lại trong phòng: {currentLeaderRemainingSlots}
              </p>
              {currentLeaderRemainingSlots <= 0 ? (
                <p className="muted-text">Phòng này đã đủ slot và hiện được khóa tự động.</p>
              ) : null}
            </div>

            {currentLeaderRoom?.roomName.trim() ? (
              <div className="status-box">
                <p className="status-label">Phòng của bạn</p>
                <p className="status-value" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                  {currentLeaderRoom.roomName}
                </p>
                <p className="muted-text">
                  Tên phòng đã được khóa. Thành viên chưa match sẽ nhìn thấy tên phòng này để viết thư xin gia nhập.
                </p>
              </div>
            ) : (
              <>
                <label className="field">
                  <span>Đặt tên phòng</span>
                  <textarea
                    className="text-input"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    placeholder="Ví dụ: Phòng thiên về chiến lược, thích làm việc chắc tay và quan tâm kết quả lâu dài"
                    style={{ minHeight: 120, paddingTop: 12, resize: "vertical" }}
                  />
                </label>

                <p className="muted-text">
                  Gợi ý: tên phòng nên mang tính mô tả, nói lên mục tiêu hoặc khí chất nhóm, tránh dùng tên thật hay manh mối lộ danh tính Nhóm trưởng.
                </p>

                <button
                  className="primary-button"
                  onClick={handleCreateRoom}
                  disabled={isSubmittingRoom}
                >
                  {isSubmittingRoom ? "Đang tạo phòng..." : "Tạo phòng Vòng 3"}
                </button>
              </>
            )}

            {currentLeaderRoom?.roomName.trim() ? (
              <div className="status-box danger-box">
                <p className="status-label">Thư xin gia nhập đang chờ xử lý</p>
                {pendingLeaderApplications.length > 0 ? (
                  <div className="name-list">
                    {pendingLeaderApplications.map((application, index) => {
                      const remainingMs = Math.max(
                        getApplicationExpiresAt(application) - nowMs,
                        0
                      );

                      return (
                        <div
                          className="name-item"
                          key={application.docId}
                          style={{ textAlign: "left" }}
                        >
                          <div style={{ fontWeight: 700, marginBottom: 8 }}>
                            Lá thư ẩn danh #{index + 1}
                          </div>
                          <div className="muted-text" style={{ marginTop: 0 }}>
                            {application.isLateSubmission
                              ? "Thư nộp quá hạn, còn hiển thị "
                              : "Thư nộp đúng hạn, còn hiển thị "}
                            <span className="countdown-alert">
                              {formatCountdown(remainingMs)}
                            </span>
                          </div>
                          <div
                            style={{
                              marginTop: 12,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              lineHeight: 1.7
                            }}
                          >
                            {application.applicationLetter}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gap: 10,
                              marginTop: 14
                            }}
                          >
                            <button
                              className="primary-button"
                              onClick={() => void handleReviewApplication(application, "accepted")}
                              disabled={
                                reviewingApplicationId === application.docId ||
                                currentLeaderRemainingSlots <= 0
                              }
                            >
                              {reviewingApplicationId === application.docId
                                ? "Đang xử lý..."
                                : "Đồng ý thư này"}
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() => void handleReviewApplication(application, "rejected")}
                              disabled={reviewingApplicationId === application.docId}
                            >
                              {reviewingApplicationId === application.docId
                                ? "Đang xử lý..."
                                : "Từ chối thư này"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="status-value">Hiện chưa có thư nào đang chờ bạn đọc.</p>
                )}
              </div>
            ) : null}

            {reviewedLeaderApplications.length > 0 ? (
              <div className="status-box">
                <p className="status-label">Các thư đã xử lý</p>
                <div className="name-list">
                  {reviewedLeaderApplications.map((application, index) => (
                    <div className="name-item" key={`reviewed-${application.docId}`}>
                      Lá thư ẩn danh #{index + 1}:{" "}
                      {application.status === "accepted"
                        ? "Đã được chấp nhận"
                        : application.status === "expired"
                          ? "Quá hạn, tự động từ chối"
                          : "Đã bị từ chối"}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {matchedMemberInRound3 ? (
          <>
            <div className="status-box">
              <p className="status-label">Kết quả Vòng 2</p>
              <p className="status-value">
                Bạn đã được xếp vào nhóm của {currentMatchingGroup?.leaderFullName} và hiện đang ở sẵn trong phòng với vai trò quan sát.
              </p>
            </div>

            <div className="status-box">
              <p className="status-label">Phòng hiện tại</p>
              <p className="status-value" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                {currentObservedRoom?.roomName.trim()
                  ? currentObservedRoom.roomName
                  : "Nhóm trưởng đang đặt tên phòng, vui lòng chờ."}
              </p>
            </div>
          </>
        ) : null}

        {acceptedApplicantInRound3 ? (
          <div className="status-box">
            <p className="status-label">Kết quả thư xin gia nhập</p>
            <p className="status-value">
              Bạn đã được chấp nhận vào phòng {acceptedRound3Room?.roomName || acceptedRound3Application?.targetRoomName}.
            </p>
          </div>
        ) : null}

        {pendingApplicantInRound3 ? (
          <div className="status-box danger-box">
            <p className="status-label">Thư xin gia nhập của bạn</p>
            <p className="status-value">
              Bạn đã gửi thư đến phòng {pendingRound3Application?.targetRoomName}.
            </p>
            <p className="muted-text">
              {pendingRound3Application?.isLateSubmission
                ? "Thư của bạn nộp quá hạn và còn hiển thị "
                : "Thư của bạn nộp đúng hạn và còn hiển thị "}
              <span className="countdown-alert">
                {formatCountdown(pendingRound3ApplicationRemainingMs)}
              </span>
              .
            </p>
            <p className="muted-text" style={{ whiteSpace: "pre-wrap" }}>
              {pendingRound3Application?.applicationLetter}
            </p>
          </div>
        ) : null}

        {rejectedApplicantInRound3 ? (
          <div className="status-box">
            <p className="status-label">Đảo hoang</p>
            <p className="status-value">
              {rejectedRound3Application?.status === "expired"
                ? "Thư của bạn đã quá hạn nên bị tự động từ chối. Bạn đang ở Đảo hoang và sẽ chờ Round sau để được random fill vào nhóm chưa đủ thành viên."
                : "Thư của bạn đã bị từ chối. Bạn đang ở Đảo hoang và sẽ chờ Round sau để được random fill vào nhóm chưa đủ thành viên."}
            </p>
          </div>
        ) : null}

        {currentRound === "round3_completed" ? (
          <>
            <div className="status-box">
              <p className="status-label">Kết quả Vòng 3</p>
              {currentParticipantRole === "leader" ? (
                <p className="status-value">
                  Giảng viên đã chốt Vòng 3. Bạn có thể xem đầy đủ 4 nhóm bên dưới.
                </p>
              ) : round3Results.some((group) => group.memberStudentIds.includes(studentId)) ? (
                <p className="status-value">
                  Bạn đã có nhóm tạm thời sau Vòng 3.
                </p>
              ) : round3UnmatchedStudents.some((student) => student.studentId === studentId) ? (
                <p className="status-value">
                  Bạn đang ở Đảo hoang và chờ Giảng viên bắt đầu Round 4 để random fill.
                </p>
              ) : (
                <p className="status-value">Giảng viên đang xem kết quả Vòng 3.</p>
              )}
            </div>

            <div className="status-box">
              <p className="status-label">4 nhóm sau Vòng 3</p>
              <div className="name-list">
                {round3Results.map((group, index) => (
                  <div className="name-item" key={`round3-group-${group.leaderStudentId}`}>
                    <strong>
                      Nhóm {index + 1}: {group.roomName}
                    </strong>
                    <div style={{ marginTop: 8 }}>
                      Nhóm trưởng: {group.leaderFullName}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      {group.memberFullNames.length > 0
                        ? group.memberFullNames.join(", ")
                        : "Chưa có thành viên nào"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {currentRound === "round4_completed" ? (
          <div className="status-box">
            <p className="status-label">Kết quả cuối cùng</p>
            {finalAssignedGroup ? (
              <>
                <p className="status-value">
                  {currentParticipantRole === "leader"
                    ? `Bạn là Nhóm trưởng của phòng ${finalAssignedGroup.roomName}.`
                    : `Bạn thuộc phòng ${finalAssignedGroup.roomName}.`}
                </p>
                <div className="name-list">
                  <div className="name-item">
                    Nhóm trưởng: {finalAssignedGroup.leaderFullName}
                  </div>
                  {finalAssignedGroup.memberFullNames.map((memberName) => (
                    <div className="name-item" key={`${finalAssignedGroup.leaderStudentId}-${memberName}`}>
                      {memberName}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="status-value">Trò chơi đã kết thúc.</p>
            )}
          </div>
        ) : null}

        {canApplyInRound3 ? (
          <>
            <div className="status-box">
              <p className="status-label">Kết quả Vòng 2</p>
              <p className="status-value">
                Bạn chưa được xếp vào nhóm nào vì chưa có match 2 chiều với Nhóm trưởng.
              </p>
            </div>

            {roomCards.length === 4 ? (
              <>
                <div className="status-box danger-box">
                  <p className="status-label">Thời gian gửi thư xin gia nhập</p>
                  <p className="status-value">
                    {isRound3ChoiceWindowClosed
                      ? "Đã quá 5 phút. Nếu gửi bây giờ, thư sẽ chỉ hiển thị trong 3 phút."
                      : "Bạn còn "}
                    {!isRound3ChoiceWindowClosed ? (
                      <span className="countdown-alert">
                        {formatCountdown(round3ChoiceRemainingMs)}
                      </span>
                    ) : null}
                    {!isRound3ChoiceWindowClosed ? " để chọn phòng và viết thư đúng hạn." : ""}
                  </p>
                </div>

                <div className="status-box">
                  <p className="status-label">Chọn 1 trong 4 phòng</p>
                  <div className="name-list">
                    {roomCards.map((room) => {
                      const isSelected = selectedTargetLeaderId === room.leaderStudentId;

                      return (
                        <button
                          key={room.leaderStudentId}
                          className={isSelected ? "primary-button" : "secondary-button"}
                          onClick={() =>
                            !room.isFull ? setSelectedTargetLeaderId(room.leaderStudentId) : null
                          }
                          disabled={room.isFull}
                          style={{
                            textAlign: "left",
                            padding: "16px",
                            minHeight: 0
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              whiteSpace: "normal",
                              wordBreak: "break-word",
                              lineHeight: 1.6
                            }}
                          >
                            {room.roomName}
                          </div>
                          <div style={{ marginTop: 8, opacity: 0.85 }}>
                            Đang có {room.currentMemberCount}/{room.roomCapacity} thành viên
                          </div>
                          {room.isFull ? (
                            <div style={{ marginTop: 8, opacity: 0.85 }}>
                              Phòng này đã đủ thành viên
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="field">
                  <span>Thư xin gia nhập</span>
                  <textarea
                    className="text-input"
                    value={applicationLetter}
                    onChange={(event) => setApplicationLetter(event.target.value)}
                    placeholder="Hãy viết rõ vì sao bạn muốn vào phòng này, bạn có thể đóng góp gì và bạn có cam kết gì trong việc làm việc nhóm nếu được vào."
                    style={{ minHeight: 180, paddingTop: 12, resize: "vertical" }}
                  />
                </label>

                <p className="muted-text">
                  Hãy viết rõ vì sao bạn muốn vào phòng này, bạn có thể đóng góp gì và bạn có cam kết gì trong việc làm việc nhóm nếu được vào.
                </p>

                <button
                  className="primary-button"
                  onClick={handleSubmitRound3Application}
                  disabled={isSubmittingApplication}
                >
                  {isSubmittingApplication ? "Đang gửi thư..." : "Gửi thư xin gia nhập"}
                </button>
              </>
            ) : (
              <div className="status-box">
                <p className="status-label">Vòng 3</p>
                <p className="status-value">
                  Vui lòng chờ đủ {top4Leaders.length} Nhóm trưởng đặt tên phòng. Khi đó bạn sẽ được chọn 1 phòng và viết thư xin gia nhập.
                </p>
              </div>
            )}
          </>
        ) : null}

        {isRound1Open ? (
          <>
            {hasSubmittedRound1 ? (
              <div className="status-box">
                <p className="status-label">Bình chọn Vòng 1</p>
                <p className="status-value">Bạn đã gửi bình chọn và hiện đã bị khóa.</p>
              </div>
            ) : (
              <>
                <p className="lead">
                  Vòng 1: hãy chọn 4 sinh viên khác nhau để đề cử làm Nhóm trưởng.
                </p>

                {[0, 1, 2, 3].map((index) => (
                  <label className="field" key={index}>
                    <span>Lựa chọn {index + 1}</span>
                    <select
                      value={selectedVotes[index]}
                      onChange={(event) => handleVoteChange(index, event.target.value)}
                    >
                      <option value="">-- Chọn một sinh viên --</option>
                      {votingOptions.map((participant) => (
                        <option key={participant.docId} value={participant.studentId}>
                          {participant.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}

                <button
                  className="primary-button"
                  onClick={handleSubmitVote}
                  disabled={isSubmittingRound1}
                >
                  {isSubmittingRound1 ? "Đang gửi..." : "Gửi bình chọn Vòng 1"}
                </button>
              </>
            )}

            {submittedParticipants.length > 0 ? (
              <div className="status-box" style={{ marginTop: 16 }}>
                <p className="status-label">4 lựa chọn bạn đã gửi</p>
                <div className="name-list">
                  {submittedParticipants.map((participant) => (
                    <div className="name-item" key={participant.studentId}>
                      {participant.fullName}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
