"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import {
  buildClassLink,
  classAppStateRef,
  classDocRef,
  classParticipantDoc,
  classParticipantsCollection,
  classRound1VotesCollection,
  classRound1VoteDoc,
  classRound2LeaderRankingDoc,
  classRound2LeaderRankingsCollection,
  classRound2MemberPreferenceDoc,
  classRound2MemberPreferencesCollection,
  classRound3ApplicationDoc,
  classRound3ApplicationsCollection,
  classRound3RoomDoc,
  classRound3RoomsCollection,
  teacherSelectedClassKey
} from "../../lib/classHelpers";

type Participant = {
  docId: string;
  studentId: string;
  fullName: string;
  ranking: number;
  roleAfterRound1?: "leader" | "member" | "pending";
  hasSetPassword?: boolean;
};

type Round1Vote = {
  docId: string;
  voterStudentId: string;
  votedStudentIds: string[];
};

type LeaderResult = {
  studentId: string;
  fullName: string;
  ranking: number;
  voteCount: number;
};

type Round2MemberPreference = {
  docId: string;
  memberStudentId: string;
  preferredLeaderIds: string[];
};

type Round2LeaderRanking = {
  docId: string;
  leaderStudentId: string;
  preferredMemberIds: string[];
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

type ImportedParticipant = {
  studentId: string;
  fullName: string;
  ranking: number;
};

type TeacherClass = {
  docId: string;
  className: string;
  teacherUid: string;
  teacherEmail?: string;
  createdAtMs: number;
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

function getLeaderTargetCount(participantCount: number) {
  return Math.min(Math.max(participantCount, 0), 4);
}

function getLeaderCapacity(
  leaders: LeaderResult[],
  leaderId: string,
  participantCount: number
) {
  const leaderIndex = leaders.findIndex((leader) => leader.studentId === leaderId);
  const leaderCount = leaders.length;

  if (leaderIndex < 0 || leaderCount <= 0) {
    return 0;
  }

  const totalMembers = Math.max(participantCount - leaderCount, 0);
  const baseQuota = Math.floor(totalMembers / leaderCount);
  const extraSlots = totalMembers % leaderCount;

  return baseQuota + (leaderIndex < extraSlots ? 1 : 0);
}

function parseImportedParticipantLine(line: string, fallbackRanking: number) {
  const trimmedLine = line.trim();

  if (!trimmedLine) {
    return null;
  }

  let studentId = "";
  let fullName = "";
  let ranking = fallbackRanking;

  if (trimmedLine.includes("\t")) {
    const parts = trimmedLine.split(/\t+/).map((part) => part.trim()).filter(Boolean);

    if (parts.length >= 2) {
      studentId = parts[0];
      fullName = parts[1];
      if (parts[2] && /^\d+$/.test(parts[2])) {
        ranking = Number(parts[2]);
      }
    }
  } else if (/[;|,]/.test(trimmedLine)) {
    const parts = trimmedLine
      .split(/[;|,]/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      studentId = parts[0];
      fullName = parts[1];
      if (parts[2] && /^\d+$/.test(parts[2])) {
        ranking = Number(parts[2]);
      }
    }
  } else {
    const matched = trimmedLine.match(/^(\S+)\s+(.+?)(?:\s+(\d+))?$/);

    if (matched) {
      studentId = matched[1]?.trim() || "";
      fullName = matched[2]?.trim() || "";
      if (matched[3]) {
        ranking = Number(matched[3]);
      }
    }
  }

  if (!studentId || !fullName) {
    return null;
  }

  return {
    studentId,
    fullName,
    ranking
  };
}

function parseImportedParticipants(rawText: string) {
  const parsedItems: ImportedParticipant[] = [];
  const seenStudentIds = new Set<string>();
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line, index) => {
    const parsedItem = parseImportedParticipantLine(line, index + 1);

    if (!parsedItem) {
      throw new Error(`Không đọc được dòng ${index + 1}.`);
    }

    if (seenStudentIds.has(parsedItem.studentId)) {
      throw new Error(`Mã sinh viên ${parsedItem.studentId} đang bị trùng.`);
    }

    seenStudentIds.add(parsedItem.studentId);
    parsedItems.push(parsedItem);
  });

  return parsedItems;
}

function generateRandomClassCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let index = 0; index < 6; index += 1) {
    result += characters[Math.floor(Math.random() * characters.length)];
  }

  return result;
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

function buildRound3ResultGroups(
  leaders: LeaderResult[],
  matchingGroups: MatchingGroup[],
  rooms: Round3Room[],
  participantCount: number
): Round3ResultGroup[] {
  return leaders.map((leader) => {
    const matchingGroup = matchingGroups.find(
      (group) => group.leaderStudentId === leader.studentId
    );
    const room = rooms.find((item) => item.leaderStudentId === leader.studentId);
    const observerIds = room?.observerMemberIds || matchingGroup?.memberStudentIds || [];
    const observerNames = room?.observerMemberFullNames || matchingGroup?.memberFullNames || [];
    const admittedIds = room?.admittedMemberIds || [];
    const admittedNames = room?.admittedMemberFullNames || [];
    const memberIds = [...new Set([...observerIds, ...admittedIds])];
    const memberNames = [...observerNames, ...admittedNames].filter(
      (value, index, array) => array.indexOf(value) === index
    );

    return {
      leaderStudentId: leader.studentId,
      leaderFullName: leader.fullName,
      roomName: room?.roomName || "Chưa đặt tên",
      capacity:
        matchingGroup?.capacity || getLeaderCapacity(leaders, leader.studentId, participantCount),
      memberStudentIds: memberIds,
      memberFullNames: memberNames
    };
  });
}

function buildUnmatchedStudents(
  participants: Participant[],
  groups: Round3ResultGroup[]
): UnmatchedStudent[] {
  const assignedStudentIds = new Set(
    groups.flatMap((group) => group.memberStudentIds)
  );

  return participants
    .filter(
      (participant) =>
        participant.roleAfterRound1 === "member" &&
        !assignedStudentIds.has(participant.studentId)
    )
    .map((participant) => ({
      studentId: participant.studentId,
      fullName: participant.fullName
    }));
}

function shuffleStudents(students: UnmatchedStudent[]) {
  const clonedStudents = [...students];

  for (let index = clonedStudents.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const currentValue = clonedStudents[index];
    clonedStudents[index] = clonedStudents[swapIndex];
    clonedStudents[swapIndex] = currentValue;
  }

  return clonedStudents;
}

function buildRound4FinalGroups(
  round3Groups: Round3ResultGroup[],
  unmatchedStudents: UnmatchedStudent[]
) {
  const shuffledStudents = shuffleStudents(unmatchedStudents);
  let currentIndex = 0;

  const finalGroups = round3Groups.map((group) => {
    const memberIds = [...group.memberStudentIds];
    const memberNames = [...group.memberFullNames];
    const remainingSlots = Math.max(group.capacity - memberIds.length, 0);

    for (let count = 0; count < remainingSlots && currentIndex < shuffledStudents.length; count += 1) {
      const selectedStudent = shuffledStudents[currentIndex];
      currentIndex += 1;
      memberIds.push(selectedStudent.studentId);
      memberNames.push(selectedStudent.fullName);
    }

    return {
      ...group,
      memberStudentIds: memberIds,
      memberFullNames: memberNames
    };
  });

  return {
    finalGroups,
    leftoverStudents: shuffledStudents.slice(currentIndex)
  };
}

function buildRound2Matching(
  leaders: LeaderResult[],
  participants: Participant[],
  memberPreferences: Round2MemberPreference[],
  leaderRankings: Round2LeaderRanking[]
): MatchingGroup[] {
  const members = participants
    .filter((participant) => participant.roleAfterRound1 === "member")
    .sort((a, b) => a.ranking - b.ranking);

  const memberById = new Map(members.map((member) => [member.studentId, member]));
  const rankingByLeader = new Map(
    leaderRankings.map((item) => [item.leaderStudentId, item.preferredMemberIds])
  );
  const capacityByLeader = new Map(
    leaders.map((leader) => [
      leader.studentId,
      getLeaderCapacity(leaders, leader.studentId, participants.length)
    ])
  );
  const leaderRankIndexMap = new Map<string, Map<string, number>>(
    leaders.map((leader) => {
      const rankingList = rankingByLeader.get(leader.studentId) || [];
      return [
        leader.studentId,
        new Map(rankingList.map((memberId, index) => [memberId, index]))
      ];
    })
  );
  const mutualLeaderChoicesByMember = new Map<string, string[]>();
  const acceptedMembersByLeader = new Map<string, string[]>(
    leaders.map((leader) => [leader.studentId, []])
  );
  const nextProposalIndexByMember = new Map<string, number>();
  const queue: string[] = [];

  memberPreferences.forEach((preference) => {
    const mutualLeaderIds = preference.preferredLeaderIds.filter((leaderId) =>
      leaderRankIndexMap.get(leaderId)?.has(preference.memberStudentId)
    );

    mutualLeaderChoicesByMember.set(preference.memberStudentId, mutualLeaderIds);

    if (mutualLeaderIds.length > 0) {
      queue.push(preference.memberStudentId);
      nextProposalIndexByMember.set(preference.memberStudentId, 0);
    }
  });

  const compareMembersForLeader = (leaderId: string, memberAId: string, memberBId: string) => {
    const memberRankIndexMap = leaderRankIndexMap.get(leaderId);
    const leaderPreferenceA = memberRankIndexMap?.get(memberAId) ?? Number.MAX_SAFE_INTEGER;
    const leaderPreferenceB = memberRankIndexMap?.get(memberBId) ?? Number.MAX_SAFE_INTEGER;

    if (leaderPreferenceA !== leaderPreferenceB) {
      return leaderPreferenceA - leaderPreferenceB;
    }

    const rankingA = memberById.get(memberAId)?.ranking ?? Number.MAX_SAFE_INTEGER;
    const rankingB = memberById.get(memberBId)?.ranking ?? Number.MAX_SAFE_INTEGER;

    if (rankingA !== rankingB) {
      return rankingA - rankingB;
    }

    return memberAId.localeCompare(memberBId);
  };

  while (queue.length > 0) {
    const memberId = queue.shift();

    if (!memberId) {
      continue;
    }

    const mutualLeaderIds = mutualLeaderChoicesByMember.get(memberId) || [];
    const nextProposalIndex = nextProposalIndexByMember.get(memberId) || 0;

    if (nextProposalIndex >= mutualLeaderIds.length) {
      continue;
    }

    const leaderId = mutualLeaderIds[nextProposalIndex];
    nextProposalIndexByMember.set(memberId, nextProposalIndex + 1);

    const acceptedMembers = [...(acceptedMembersByLeader.get(leaderId) || []), memberId].sort(
      (memberAId, memberBId) => compareMembersForLeader(leaderId, memberAId, memberBId)
    );
    const capacity = capacityByLeader.get(leaderId) || 0;
    const keptMembers = acceptedMembers.slice(0, capacity);
    const rejectedMembers = acceptedMembers.slice(capacity);

    acceptedMembersByLeader.set(leaderId, keptMembers);

    rejectedMembers.forEach((rejectedMemberId) => {
      if ((nextProposalIndexByMember.get(rejectedMemberId) || 0) < (mutualLeaderChoicesByMember.get(rejectedMemberId) || []).length) {
        queue.push(rejectedMemberId);
      }
    });
  }

  return leaders.map((leader) => {
    const memberIds = acceptedMembersByLeader.get(leader.studentId) || [];

    return {
      leaderStudentId: leader.studentId,
      leaderFullName: leader.fullName,
      capacity: getLeaderCapacity(leaders, leader.studentId, participants.length),
      memberStudentIds: memberIds,
      memberFullNames: memberIds.map(
        (memberId) => memberById.get(memberId)?.fullName || memberId
      )
    };
  });
}

export default function AdminPage() {
  const router = useRouter();
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [currentRound, setCurrentRound] = useState("waiting");
  const [roundStatus, setRoundStatus] = useState("Vui lòng chờ Giảng viên mở Vòng 1.");
  const [participantCount, setParticipantCount] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [round1Votes, setRound1Votes] = useState<Round1Vote[]>([]);
  const [top4Leaders, setTop4Leaders] = useState<LeaderResult[]>([]);
  const [leadersVisible, setLeadersVisible] = useState(false);
  const [memberPreferences, setMemberPreferences] = useState<Round2MemberPreference[]>([]);
  const [leaderRankings, setLeaderRankings] = useState<Round2LeaderRanking[]>([]);
  const [matchingResults, setMatchingResults] = useState<MatchingGroup[]>([]);
  const [round2Matched, setRound2Matched] = useState(false);
  const [round3Rooms, setRound3Rooms] = useState<Round3Room[]>([]);
  const [round3Applications, setRound3Applications] = useState<Round3Application[]>([]);
  const [round3Results, setRound3Results] = useState<Round3ResultGroup[]>([]);
  const [round3UnmatchedStudents, setRound3UnmatchedStudents] = useState<UnmatchedStudent[]>([]);
  const [finalGroups, setFinalGroups] = useState<Round3ResultGroup[]>([]);
  const [isStartingRound1, setIsStartingRound1] = useState(false);
  const [isPublishingRound2, setIsPublishingRound2] = useState(false);
  const [isMatchingRound2, setIsMatchingRound2] = useState(false);
  const [isFinalizingRound3, setIsFinalizingRound3] = useState(false);
  const [isStartingRound4, setIsStartingRound4] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isImportingParticipants, setIsImportingParticipants] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importText, setImportText] = useState("");
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [rosterModalMode, setRosterModalMode] = useState<"view" | "edit">("view");
  const [editClassName, setEditClassName] = useState("");
  const [editRosterText, setEditRosterText] = useState("");
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [activityModalTitle, setActivityModalTitle] = useState("");
  const [activityModalSummary, setActivityModalSummary] = useState("");
  const [activityModalEntries, setActivityModalEntries] = useState<string[]>([]);
  const autoStartedRound1Ref = useRef(false);
  const autoOpenedRound2Ref = useRef(false);
  const autoMatchedRound2Ref = useRef(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      if (!user) {
        router.replace("/");
        return;
      }

      setIsSessionReady(true);
    });

    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!currentUser) {
      setTeacherClasses([]);
      setSelectedClassId("");
      return;
    }

    const selectedClassStorageKey = teacherSelectedClassKey(currentUser.uid);
    const classesQuery = query(collection(db, "classes"), where("teacherUid", "==", currentUser.uid));

    const unsubscribeClasses = onSnapshot(classesQuery, (snapshot) => {
      const items = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as {
            className?: string;
            teacherUid?: string;
            teacherEmail?: string;
            createdAt?: unknown;
          };

          return {
            docId: docItem.id,
            className: data.className || "Lớp chưa đặt tên",
            teacherUid: data.teacherUid || "",
            teacherEmail: data.teacherEmail || "",
            createdAtMs: getMillisFromUnknown(data.createdAt)
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);

      setTeacherClasses(items);

      const savedSelectedClassId = localStorage.getItem(selectedClassStorageKey) || "";
      const nextSelectedClassId =
        items.find((item) => item.docId === selectedClassId)?.docId ||
        items.find((item) => item.docId === savedSelectedClassId)?.docId ||
        items[0]?.docId ||
        "";

      setSelectedClassId(nextSelectedClassId);

      if (nextSelectedClassId) {
        localStorage.setItem(selectedClassStorageKey, nextSelectedClassId);
      } else {
        localStorage.removeItem(selectedClassStorageKey);
      }
    });

    return () => unsubscribeClasses();
  }, [currentUser, selectedClassId]);

  useEffect(() => {
    if (!currentUser || !selectedClassId) {
      setCurrentRound("waiting");
      setRoundStatus("Vui lòng chọn hoặc tạo một lớp để bắt đầu.");
      setParticipants([]);
      setParticipantCount(0);
      setRound1Votes([]);
      setTop4Leaders([]);
      setLeadersVisible(false);
      setMemberPreferences([]);
      setLeaderRankings([]);
      setMatchingResults([]);
      setRound2Matched(false);
      setRound3Rooms([]);
      setRound3Applications([]);
      setRound3Results([]);
      setRound3UnmatchedStudents([]);
      setFinalGroups([]);
      return;
    }

    const unsubscribeAppState = onSnapshot(
      classAppStateRef(selectedClassId),
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
          round3Results?: Round3ResultGroup[];
          round3UnmatchedStudents?: UnmatchedStudent[];
          finalGroups?: Round3ResultGroup[];
        };

        setCurrentRound(data.currentRound || "waiting");
        setRoundStatus(data.waitingMessage || "Vui lòng chờ Giảng viên mở Vòng 1.");
        setLeadersVisible(Boolean(data.leadersVisible));
        setTop4Leaders(data.top4Leaders || []);
        setRound2Matched(Boolean(data.round2Matched));
        setMatchingResults(data.matchingResults || []);
        setRound3Results(data.round3Results || []);
        setRound3UnmatchedStudents(data.round3UnmatchedStudents || []);
        setFinalGroups(data.finalGroups || []);
      }
    );

    const unsubscribeParticipants = onSnapshot(
      classParticipantsCollection(selectedClassId),
      (snapshot) => {
        const items = snapshot.docs.map((docItem) => {
          const data = docItem.data() as {
            studentId?: string;
            fullName?: string;
            ranking?: number;
            roleAfterRound1?: "leader" | "member" | "pending";
            hasSetPassword?: boolean;
          };

          return {
            docId: docItem.id,
            studentId: data.studentId || docItem.id,
            fullName: data.fullName || "Không rõ tên",
            ranking: data.ranking || 0,
            roleAfterRound1: data.roleAfterRound1 || "pending",
            hasSetPassword: Boolean(data.hasSetPassword)
          };
        });

        items.sort((a, b) => a.ranking - b.ranking);
        setParticipants(items);
        setParticipantCount(items.length);
      }
    );

    const unsubscribeRound1Votes = onSnapshot(
      classRound1VotesCollection(selectedClassId),
      (snapshot) => {
        const items = snapshot.docs.map((docItem) => {
          const data = docItem.data() as {
            voterStudentId?: string;
            votedStudentIds?: string[];
          };

          return {
            docId: docItem.id,
            voterStudentId: data.voterStudentId || docItem.id,
            votedStudentIds: data.votedStudentIds || []
          };
        });

        setRound1Votes(items);
      }
    );

    const unsubscribeMemberPreferences = onSnapshot(
      classRound2MemberPreferencesCollection(selectedClassId),
      (snapshot) => {
        const items = snapshot.docs.map((docItem) => {
          const data = docItem.data() as {
            memberStudentId?: string;
            preferredLeaderIds?: string[];
          };

          return {
            docId: docItem.id,
            memberStudentId: data.memberStudentId || docItem.id,
            preferredLeaderIds: data.preferredLeaderIds || []
          };
        });

        setMemberPreferences(items);
      }
    );

    const unsubscribeLeaderRankings = onSnapshot(
      classRound2LeaderRankingsCollection(selectedClassId),
      (snapshot) => {
        const items = snapshot.docs.map((docItem) => {
          const data = docItem.data() as {
            leaderStudentId?: string;
            preferredMemberIds?: string[];
          };

          return {
            docId: docItem.id,
            leaderStudentId: data.leaderStudentId || docItem.id,
            preferredMemberIds: data.preferredMemberIds || []
          };
        });

        setLeaderRankings(items);
      }
    );

    const unsubscribeRound3Rooms = onSnapshot(
      classRound3RoomsCollection(selectedClassId),
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
      classRound3ApplicationsCollection(selectedClassId),
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
      unsubscribeRound1Votes();
      unsubscribeMemberPreferences();
      unsubscribeLeaderRankings();
      unsubscribeRound3Rooms();
      unsubscribeRound3Applications();
    };
  }, [currentUser, selectedClassId]);

  useEffect(() => {
    if (currentRound !== "round3") {
      return;
    }

    const expiredApplications = round3Applications.filter(
      (application) =>
        application.status === "pending" &&
        application.submittedAtMs > 0 &&
        Date.now() > getApplicationExpiresAt(application)
    );

    if (expiredApplications.length === 0) {
      return;
    }

    void (async () => {
      const batch = writeBatch(db);

      expiredApplications.forEach((application) => {
        batch.set(
          classRound3ApplicationDoc(selectedClassId, application.docId),
          {
            status: "expired",
            reviewedAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      await batch.commit();
    })();
  }, [currentRound, round3Applications]);

  useEffect(() => {
    if (currentRound !== "round3") {
      return;
    }

    const leaders = top4Leaders;

    if (leaders.length === 0) {
      return;
    }

    const round3Groups = buildRound3ResultGroups(
      leaders,
      matchingResults,
      round3Rooms,
      participants.length
    );
    const fullLeaderIds = new Set(
      round3Groups
        .filter((group) => group.memberStudentIds.length >= group.capacity)
        .map((group) => group.leaderStudentId)
    );

    const pendingApplicationsToReject = round3Applications.filter(
      (application) =>
        application.status === "pending" &&
        fullLeaderIds.has(application.targetLeaderStudentId)
    );

    if (pendingApplicationsToReject.length === 0) {
      return;
    }

    void (async () => {
      const batch = writeBatch(db);

      pendingApplicationsToReject.forEach((application) => {
        batch.set(
          classRound3ApplicationDoc(selectedClassId, application.docId),
          {
            status: "rejected",
            reviewedAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      await batch.commit();
    })();
  }, [currentRound, matchingResults, participants.length, round3Applications, round3Rooms, top4Leaders]);

  const leaderTargetCount = getLeaderTargetCount(participantCount);

  const top4Preview = useMemo(() => {
    const voteMap = new Map<string, number>();

    participants.forEach((participant) => {
      voteMap.set(participant.studentId, 0);
    });

    round1Votes.forEach((vote) => {
      vote.votedStudentIds.forEach((votedStudentId) => {
        voteMap.set(votedStudentId, (voteMap.get(votedStudentId) || 0) + 1);
      });
    });

    return participants
      .map((participant) => ({
        studentId: participant.studentId,
        fullName: participant.fullName,
        ranking: participant.ranking,
        voteCount: voteMap.get(participant.studentId) || 0
      }))
      .sort((a, b) => {
        if (b.voteCount !== a.voteCount) {
          return b.voteCount - a.voteCount;
        }

        return a.ranking - b.ranking;
      })
      .slice(0, leaderTargetCount);
  }, [leaderTargetCount, participants, round1Votes]);

  const loggedInParticipantCount = participants.filter(
    (participant) => participant.hasSetPassword
  ).length;
  const loggedInParticipants = participants
    .filter((participant) => participant.hasSetPassword)
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const round1VoterNames = round1Votes
    .map((vote) => participants.find((participant) => participant.studentId === vote.voterStudentId)?.fullName)
    .filter(Boolean) as string[];
  const round2MemberSubmitterNames = memberPreferences
    .map((preference) =>
      participants.find((participant) => participant.studentId === preference.memberStudentId)?.fullName
    )
    .filter(Boolean) as string[];
  const round2LeaderSubmitterNames = leaderRankings
    .map((ranking) =>
      participants.find((participant) => participant.studentId === ranking.leaderStudentId)?.fullName
    )
    .filter(Boolean) as string[];
  const expectedLeaderSubmissionCount = top4Leaders.length || top4Preview.length;
  const expectedMemberSubmissionCount = participants.filter(
    (participant) => participant.roleAfterRound1 === "member"
  ).length;
  const expectedRound2MemberCount = Math.max(participantCount - leaderTargetCount, 0);
  const round3RoomTargetCount =
    top4Leaders.length || top4Preview.length || leaderTargetCount;
  const createdRoomCount = round3Rooms.filter((room) => room.roomName.trim()).length;
  const round3CreatedRoomLeaderNames = round3Rooms
    .filter((room) => room.roomName.trim())
    .map((room) => participants.find((participant) => participant.studentId === room.leaderStudentId)?.fullName)
    .filter(Boolean) as string[];
  const round3ApplicationSenderNames = round3Applications
    .map((application) =>
      participants.find((participant) => participant.studentId === application.applicantStudentId)?.fullName
    )
    .filter(Boolean) as string[];
  const liveRound3Groups = buildRound3ResultGroups(
    top4Leaders.length > 0 ? top4Leaders : top4Preview,
    matchingResults,
    round3Rooms,
    participantCount
  );
  const liveRound3UnmatchedStudents = buildUnmatchedStudents(participants, liveRound3Groups);
  const currentTeacherClass = teacherClasses.find((classItem) => classItem.docId === selectedClassId);

  const buildRosterTextFromParticipants = () => {
    return participants
      .slice()
      .sort((a, b) => a.ranking - b.ranking)
      .map((participant) => `${participant.studentId}\t${participant.fullName}\t${participant.ranking}`)
      .join("\n");
  };

  const openRosterModal = (mode: "view" | "edit") => {
    if (!selectedClassId) {
      setImportMessage("Vui lòng chọn một lớp trước.");
      return;
    }

    setRosterModalMode(mode);
    setEditClassName(currentTeacherClass?.className || "");
    setEditRosterText(buildRosterTextFromParticipants());
    setIsRosterModalOpen(true);
  };

  const closeRosterModal = () => {
    setIsRosterModalOpen(false);
  };

  const openActivityModal = (title: string, summary: string, entries: string[]) => {
    setActivityModalTitle(title);
    setActivityModalSummary(summary);
    setActivityModalEntries(entries);
    setIsActivityModalOpen(true);
  };

  const handleCreateClass = async () => {
    if (!currentUser) {
      return;
    }

    if (!newClassName.trim()) {
      setImportMessage("Vui lòng nhập tên lớp trước khi tạo.");
      return;
    }

    setIsImportingParticipants(true);
    setImportMessage("");

    try {
      const parsedParticipants = parseImportedParticipants(importText);

      if (parsedParticipants.length === 0) {
        setImportMessage("Vui lòng dán ít nhất 1 sinh viên.");
        return;
      }

      let nextClassCode = "";

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidateCode = generateRandomClassCode();
        const existingClass = await getDoc(classDocRef(candidateCode));

        if (!existingClass.exists()) {
          nextClassCode = candidateCode;
          break;
        }
      }

      if (!nextClassCode) {
        setImportMessage("Không thể tạo code lớp mới. Vui lòng thử lại.");
        return;
      }

      const batch = writeBatch(db);

      batch.set(
        classDocRef(nextClassCode),
        {
          className: newClassName.trim(),
          classCode: nextClassCode,
          teacherUid: currentUser.uid,
          teacherEmail: currentUser.email || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      batch.set(
        classAppStateRef(nextClassCode),
        {
          currentRound: "waiting",
          round1Status: "not_started",
          waitingMessage: "Vui lòng chờ Giảng viên mở Vòng 1.",
          leadersVisible: false,
          top4Leaders: [],
          round2Matched: false,
          matchingResults: [],
          round3Results: [],
          round3UnmatchedStudents: [],
          finalGroups: [],
          round3StartedAt: null,
          updatedAt: serverTimestamp(),
          resetCounter: Date.now()
        },
        { merge: true }
      );

      parsedParticipants.forEach((participant) => {
        batch.set(
          classParticipantDoc(nextClassCode, participant.studentId),
          {
            studentId: participant.studentId,
            fullName: participant.fullName,
            ranking: participant.ranking,
            roleAfterRound1: "pending",
            hasSetPassword: false,
            password: "",
            createdAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      await batch.commit();

      setNewClassName("");
      setImportText("");
      setImportMessage(
        `Đã tạo lớp ${newClassName.trim()} với code ${nextClassCode}. Link: ${buildClassLink(nextClassCode)}`
      );
      setSelectedClassId(nextClassCode);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể tạo lớp mới từ danh sách này.";
      setImportMessage(errorMessage);
    } finally {
      setIsImportingParticipants(false);
    }
  };

  const handleDeleteCurrentClass = async () => {
    if (!selectedClassId) {
      return;
    }

    const confirmed = window.confirm(
      "Bạn có chắc muốn xóa lớp hiện tại không? Toàn bộ dữ liệu game của lớp này sẽ bị xóa."
    );

    if (!confirmed) {
      return;
    }

    setIsResetting(true);

    try {
      const batch = writeBatch(db);

      participants.forEach((participant) => {
        batch.delete(classParticipantDoc(selectedClassId, participant.studentId));
      });

      round1Votes.forEach((vote) => {
        batch.delete(classRound1VoteDoc(selectedClassId, vote.docId));
      });

      memberPreferences.forEach((preference) => {
        batch.delete(classRound2MemberPreferenceDoc(selectedClassId, preference.docId));
      });

      leaderRankings.forEach((ranking) => {
        batch.delete(classRound2LeaderRankingDoc(selectedClassId, ranking.docId));
      });

      round3Rooms.forEach((room) => {
        batch.delete(classRound3RoomDoc(selectedClassId, room.docId));
      });

      round3Applications.forEach((application) => {
        batch.delete(classRound3ApplicationDoc(selectedClassId, application.docId));
      });

      batch.delete(classAppStateRef(selectedClassId));
      batch.delete(classDocRef(selectedClassId));

      await batch.commit();
      setSelectedClassId("");
      setImportMessage("Đã xóa lớp hiện tại.");
    } catch {
      setImportMessage("Không thể xóa lớp hiện tại. Vui lòng thử lại.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleImportParticipants = async () => {
    if (!selectedClassId) {
      setImportMessage("Vui lòng chọn một lớp trước khi import lại danh sách.");
      return;
    }

    setIsImportingParticipants(true);
    setImportMessage("");

    try {
      const parsedParticipants = parseImportedParticipants(importText);

      if (parsedParticipants.length === 0) {
        setImportMessage("Vui lòng dán ít nhất 1 sinh viên.");
        return;
      }

      const confirmed = window.confirm(
        `Import sẽ thay toàn bộ danh sách hiện tại bằng ${parsedParticipants.length} sinh viên và reset dữ liệu các vòng. Bạn có muốn tiếp tục không?`
      );

      if (!confirmed) {
        return;
      }

      const batch = writeBatch(db);
      const importedIds = new Set(parsedParticipants.map((participant) => participant.studentId));

      participants.forEach((participant) => {
        if (!importedIds.has(participant.studentId)) {
          batch.delete(classParticipantDoc(selectedClassId, participant.studentId));
        }
      });

      parsedParticipants.forEach((participant) => {
        batch.set(
          classParticipantDoc(selectedClassId, participant.studentId),
          {
            studentId: participant.studentId,
            fullName: participant.fullName,
            ranking: participant.ranking,
            roleAfterRound1: "pending",
            hasSetPassword: false,
            password: "",
            createdAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      round1Votes.forEach((vote) => {
        batch.delete(classRound1VoteDoc(selectedClassId, vote.docId));
      });

      memberPreferences.forEach((preference) => {
        batch.delete(classRound2MemberPreferenceDoc(selectedClassId, preference.docId));
      });

      leaderRankings.forEach((ranking) => {
        batch.delete(classRound2LeaderRankingDoc(selectedClassId, ranking.docId));
      });

      round3Rooms.forEach((room) => {
        batch.delete(classRound3RoomDoc(selectedClassId, room.docId));
      });

      round3Applications.forEach((application) => {
        batch.delete(classRound3ApplicationDoc(selectedClassId, application.docId));
      });

      batch.set(
        classAppStateRef(selectedClassId),
        {
          currentRound: "waiting",
          round1Status: "not_started",
          waitingMessage: "Vui lòng chờ Giảng viên mở Vòng 1.",
          leadersVisible: false,
          top4Leaders: [],
          round2Matched: false,
          matchingResults: [],
          round3Results: [],
          round3UnmatchedStudents: [],
          finalGroups: [],
          round3StartedAt: null,
          updatedAt: serverTimestamp(),
          resetCounter: Date.now()
        },
        { merge: true }
      );

      await batch.commit();
      setImportMessage(`Đã import ${parsedParticipants.length} sinh viên và làm mới trò chơi.`);
      setImportText("");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể import danh sách sinh viên.";
      setImportMessage(errorMessage);
    } finally {
      setIsImportingParticipants(false);
    }
  };

  const handleSaveClassEdits = async () => {
    if (!selectedClassId) {
      setImportMessage("Vui lòng chọn một lớp trước khi sửa.");
      return;
    }

    if (!editClassName.trim()) {
      setImportMessage("Vui lòng nhập tên lớp.");
      return;
    }

    setIsImportingParticipants(true);
    setImportMessage("");

    try {
      const parsedParticipants = parseImportedParticipants(editRosterText);

      if (parsedParticipants.length === 0) {
        setImportMessage("Vui lòng nhập ít nhất 1 sinh viên.");
        return;
      }

      const confirmed = window.confirm(
        `Lưu thay đổi sẽ cập nhật tên lớp, thay toàn bộ danh sách hiện tại bằng ${parsedParticipants.length} sinh viên và reset dữ liệu các vòng. Bạn có muốn tiếp tục không?`
      );

      if (!confirmed) {
        return;
      }

      const batch = writeBatch(db);
      const importedIds = new Set(parsedParticipants.map((participant) => participant.studentId));

      batch.set(
        classDocRef(selectedClassId),
        {
          className: editClassName.trim(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      participants.forEach((participant) => {
        if (!importedIds.has(participant.studentId)) {
          batch.delete(classParticipantDoc(selectedClassId, participant.studentId));
        }
      });

      parsedParticipants.forEach((participant) => {
        batch.set(
          classParticipantDoc(selectedClassId, participant.studentId),
          {
            studentId: participant.studentId,
            fullName: participant.fullName,
            ranking: participant.ranking,
            roleAfterRound1: "pending",
            hasSetPassword: false,
            password: "",
            createdAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      round1Votes.forEach((vote) => {
        batch.delete(classRound1VoteDoc(selectedClassId, vote.docId));
      });

      memberPreferences.forEach((preference) => {
        batch.delete(classRound2MemberPreferenceDoc(selectedClassId, preference.docId));
      });

      leaderRankings.forEach((ranking) => {
        batch.delete(classRound2LeaderRankingDoc(selectedClassId, ranking.docId));
      });

      round3Rooms.forEach((room) => {
        batch.delete(classRound3RoomDoc(selectedClassId, room.docId));
      });

      round3Applications.forEach((application) => {
        batch.delete(classRound3ApplicationDoc(selectedClassId, application.docId));
      });

      batch.set(
        classAppStateRef(selectedClassId),
        {
          currentRound: "waiting",
          round1Status: "not_started",
          waitingMessage: "Vui lòng chờ Giảng viên mở Vòng 1.",
          leadersVisible: false,
          top4Leaders: [],
          round2Matched: false,
          matchingResults: [],
          round3Results: [],
          round3UnmatchedStudents: [],
          finalGroups: [],
          round3StartedAt: null,
          updatedAt: serverTimestamp(),
          resetCounter: Date.now()
        },
        { merge: true }
      );

      await batch.commit();
      setImportMessage(`Đã cập nhật lớp ${editClassName.trim()} với ${parsedParticipants.length} sinh viên.`);
      closeRosterModal();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể cập nhật lớp hiện tại.";
      setImportMessage(errorMessage);
    } finally {
      setIsImportingParticipants(false);
    }
  };

  const openRound1 = async (shouldAlert = true) => {
    if (!selectedClassId) {
      if (shouldAlert) {
        alert("Vui lòng chọn một lớp trước.");
      }
      return;
    }

    setIsStartingRound1(true);

    try {
      await setDoc(
        classAppStateRef(selectedClassId),
        {
          currentRound: "round1",
          round1Status: "open",
          waitingMessage: "Vòng 1 đang mở. Sinh viên có thể bình chọn.",
          leadersVisible: false,
          top4Leaders: [],
          round2Matched: false,
          matchingResults: [],
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      if (shouldAlert) {
        alert("Đã mở Vòng 1.");
      }
    } catch {
      if (shouldAlert) {
        alert("Không thể mở Vòng 1. Vui lòng thử lại.");
      }
    } finally {
      setIsStartingRound1(false);
    }
  };

  const publishLeadersAndOpenRound2 = async (shouldAlert = true) => {
    if (!selectedClassId) {
      if (shouldAlert) {
        alert("Vui lòng chọn một lớp trước.");
      }
      return;
    }

    if (top4Preview.length < leaderTargetCount) {
      if (shouldAlert) {
        alert(`Chưa đủ dữ liệu để công bố ${leaderTargetCount} Nhóm trưởng.`);
      }
      return;
    }

    setIsPublishingRound2(true);

    try {
      const batch = writeBatch(db);
      const top4Ids = new Set(top4Preview.map((leader) => leader.studentId));

      participants.forEach((participant) => {
        batch.set(
          classParticipantDoc(selectedClassId, participant.studentId),
          {
            roleAfterRound1: top4Ids.has(participant.studentId) ? "leader" : "member"
          },
          { merge: true }
        );
      });

      batch.set(
        classAppStateRef(selectedClassId),
        {
          currentRound: "round2",
          round1Status: "closed",
          waitingMessage:
            "Vòng 2 đang mở. Thành viên chọn 2 nguyện vọng Nhóm trưởng, Nhóm trưởng sắp xếp danh sách Thành viên theo thứ tự ưu tiên.",
          leadersVisible: true,
          top4Leaders: top4Preview,
          round2Matched: false,
          matchingResults: [],
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      await batch.commit();

      if (shouldAlert) {
        alert(`Đã công bố ${leaderTargetCount} Nhóm trưởng và mở Vòng 2.`);
      }
    } catch {
      if (shouldAlert) {
        alert("Không thể công bố Nhóm trưởng và mở Vòng 2. Vui lòng thử lại.");
      }
    } finally {
      setIsPublishingRound2(false);
    }
  };

  const startRound2Matching = async (shouldAlert = true, forceStart = false) => {
    if (!selectedClassId) {
      if (shouldAlert) {
        alert("Vui lòng chọn một lớp trước.");
      }
      return;
    }

    if (
      expectedLeaderSubmissionCount !== leaderTargetCount ||
      expectedMemberSubmissionCount !== expectedRound2MemberCount
    ) {
      if (shouldAlert) {
        alert("Vui lòng hoàn tất Vòng 1 trước khi chạy matching Vòng 2.");
      }
      return;
    }

    if (!forceStart && memberPreferences.length !== expectedMemberSubmissionCount) {
      if (shouldAlert) {
        alert(`Chưa đủ ${expectedMemberSubmissionCount} Thành viên gửi nguyện vọng Vòng 2.`);
      }
      return;
    }

    if (!forceStart && leaderRankings.length !== expectedLeaderSubmissionCount) {
      if (shouldAlert) {
        alert(`Chưa đủ ${expectedLeaderSubmissionCount} Nhóm trưởng gửi danh sách ưu tiên.`);
      }
      return;
    }

    setIsMatchingRound2(true);

    try {
      const leaders = top4Leaders.length > 0 ? top4Leaders : top4Preview;
      const matchingGroups = buildRound2Matching(
        leaders,
        participants,
        memberPreferences,
        leaderRankings
      );

      await setDoc(
        classAppStateRef(selectedClassId),
        {
          currentRound: "round3",
          waitingMessage:
            "Vòng 3 đang mở. Nhóm trưởng đặt tên phòng, Thành viên chưa có match chờ đủ 4 phòng để gửi thư xin gia nhập.",
          round2Matched: true,
          matchingResults: matchingGroups,
          round3StartedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          round2MatchedAt: serverTimestamp()
        },
        { merge: true }
      );

      if (shouldAlert) {
        alert("Đã hoàn tất matching Vòng 2 và mở Vòng 3.");
      }
    } catch {
      if (shouldAlert) {
        alert("Không thể chạy matching Vòng 2. Vui lòng thử lại.");
      }
    } finally {
      setIsMatchingRound2(false);
    }
  };

  const handleFinalizeRound3 = async () => {
    if (!selectedClassId) {
      return;
    }

    setIsFinalizingRound3(true);

    try {
      const batch = writeBatch(db);
      const finalizedGroups = liveRound3Groups;
      const unmatchedStudents = buildUnmatchedStudents(participants, finalizedGroups);

      round3Applications
        .filter((application) => application.status === "pending")
        .forEach((application) => {
          batch.set(
            classRound3ApplicationDoc(selectedClassId, application.docId),
            {
              status: "rejected",
              reviewedAt: serverTimestamp()
            },
            { merge: true }
          );
        });

      batch.set(
        classAppStateRef(selectedClassId),
        {
          currentRound: "round3_completed",
          waitingMessage: "Vòng 3 đã kết thúc. Giảng viên đang xem kết quả.",
          round3Results: finalizedGroups,
          round3UnmatchedStudents: unmatchedStudents,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      await batch.commit();
      alert("Đã kết thúc và hiển thị kết quả Vòng 3.");
    } catch {
      alert("Không thể kết thúc Vòng 3. Vui lòng thử lại.");
    } finally {
      setIsFinalizingRound3(false);
    }
  };

  const handleStartRound4 = async () => {
    if (!selectedClassId) {
      return;
    }

    setIsStartingRound4(true);

    try {
      const baseGroups = round3Results.length > 0 ? round3Results : liveRound3Groups;
      const baseUnmatched =
        round3UnmatchedStudents.length > 0
          ? round3UnmatchedStudents
          : buildUnmatchedStudents(participants, baseGroups);
      const { finalGroups: filledGroups } = buildRound4FinalGroups(baseGroups, baseUnmatched);
      const batch = writeBatch(db);
      const participantNameById = new Map(
        participants.map((participant) => [participant.studentId, participant.fullName])
      );

      filledGroups.forEach((group) => {
        const currentRoom = round3Rooms.find(
          (room) => room.leaderStudentId === group.leaderStudentId
        );
        const observerIds = currentRoom?.observerMemberIds || [];
        const observerNames = currentRoom?.observerMemberFullNames || [];
        const admittedIds = group.memberStudentIds.filter(
          (memberId) => !observerIds.includes(memberId)
        );
        const admittedNames = admittedIds.map(
          (memberId) => participantNameById.get(memberId) || memberId
        );

        batch.set(
          classRound3RoomDoc(selectedClassId, group.leaderStudentId),
          {
            leaderStudentId: group.leaderStudentId,
            roomName: group.roomName,
            observerMemberIds: observerIds,
            observerMemberFullNames: observerNames,
            admittedMemberIds: admittedIds,
            admittedMemberFullNames: admittedNames,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      });

      batch.set(
        classAppStateRef(selectedClassId),
        {
          currentRound: "round4_completed",
          waitingMessage: "Đã hoàn tất trò chơi. Đây là kết quả cuối cùng sau random fill.",
          finalGroups: filledGroups,
          round3UnmatchedStudents: [],
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      await batch.commit();
      alert("Đã random fill và kết thúc game.");
    } catch {
      alert("Không thể start Round 4. Vui lòng thử lại.");
    } finally {
      setIsStartingRound4(false);
    }
  };

  useEffect(() => {
    const shouldAutoStartRound1 =
      currentRound === "waiting" &&
      participantCount > 0 &&
      loggedInParticipantCount === participantCount;

    if (shouldAutoStartRound1 && !autoStartedRound1Ref.current && !isStartingRound1) {
      autoStartedRound1Ref.current = true;
      void openRound1(false);
      return;
    }

    if (!shouldAutoStartRound1) {
      autoStartedRound1Ref.current = false;
    }
  }, [currentRound, participantCount, loggedInParticipantCount, isStartingRound1]);

  useEffect(() => {
    const shouldAutoOpenRound2 =
      currentRound === "round1" &&
      participantCount > 0 &&
      round1Votes.length === participantCount;

    if (shouldAutoOpenRound2 && !autoOpenedRound2Ref.current && !isPublishingRound2) {
      autoOpenedRound2Ref.current = true;
      void publishLeadersAndOpenRound2(false);
      return;
    }

    if (!shouldAutoOpenRound2) {
      autoOpenedRound2Ref.current = false;
    }
  }, [currentRound, participantCount, round1Votes.length, isPublishingRound2]);

  useEffect(() => {
    const shouldAutoMatchRound2 =
      currentRound === "round2" &&
      expectedLeaderSubmissionCount === leaderTargetCount &&
      expectedMemberSubmissionCount === expectedRound2MemberCount &&
      memberPreferences.length === expectedMemberSubmissionCount &&
      leaderRankings.length === expectedLeaderSubmissionCount &&
      !round2Matched;

    if (shouldAutoMatchRound2 && !autoMatchedRound2Ref.current && !isMatchingRound2) {
      autoMatchedRound2Ref.current = true;
      void startRound2Matching(false, false);
      return;
    }

    if (!shouldAutoMatchRound2) {
      autoMatchedRound2Ref.current = false;
    }
  }, [
    currentRound,
    leaderTargetCount,
    expectedLeaderSubmissionCount,
    expectedMemberSubmissionCount,
    expectedRound2MemberCount,
    memberPreferences.length,
    leaderRankings.length,
    round2Matched,
    isMatchingRound2
  ]);

  const handleResetGame = async () => {
    if (!selectedClassId) {
      return;
    }

    const confirmed = window.confirm(
      "Bạn có chắc muốn reset toàn bộ hệ thống không?"
    );

    if (!confirmed) {
      return;
    }

    setIsResetting(true);

    try {
      const batch = writeBatch(db);

      participants.forEach((participant) => {
        batch.set(
          classParticipantDoc(selectedClassId, participant.studentId),
          {
            roleAfterRound1: "pending",
            password: "",
            hasSetPassword: false
          },
          { merge: true }
        );
      });

      round1Votes.forEach((vote) => {
        batch.delete(classRound1VoteDoc(selectedClassId, vote.docId));
      });

      memberPreferences.forEach((preference) => {
        batch.delete(classRound2MemberPreferenceDoc(selectedClassId, preference.docId));
      });

      leaderRankings.forEach((ranking) => {
        batch.delete(classRound2LeaderRankingDoc(selectedClassId, ranking.docId));
      });

      round3Rooms.forEach((room) => {
        batch.delete(classRound3RoomDoc(selectedClassId, room.docId));
      });

      round3Applications.forEach((application) => {
        batch.delete(classRound3ApplicationDoc(selectedClassId, application.docId));
      });

      batch.set(
        classAppStateRef(selectedClassId),
        {
          currentRound: "waiting",
          round1Status: "not_started",
          waitingMessage: "Vui lòng chờ Giảng viên mở Vòng 1.",
          leadersVisible: false,
          top4Leaders: [],
          round2Matched: false,
          matchingResults: [],
          round3Results: [],
          round3UnmatchedStudents: [],
          finalGroups: [],
          round3StartedAt: null,
          updatedAt: serverTimestamp(),
          resetCounter: Date.now()
        },
        { merge: true }
      );

      await batch.commit();
      alert("Đã reset toàn bộ hệ thống.");
    } catch {
      alert("Không thể reset hệ thống. Vui lòng thử lại.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleLogoutTeacher = () => {
    void signOut(auth);
    router.push("/");
  };

  const displayedTop4 =
    leadersVisible && top4Leaders.length > 0 ? top4Leaders : top4Preview;

  if (!isSessionReady) {
    return (
      <main className="page-shell">
        <section className="card">
          <h1>Đang tải phiên Giảng viên...</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="card card-wide">
        <span className="eyebrow">Khu vực Giảng viên</span>
        <h1>Bảng điều khiển các vòng</h1>
        <p className="lead lead-compact">
          Hệ thống tự chạy theo đúng số SV đang có trong danh sách: đủ người đăng nhập thì tự mở Vòng 1, đủ phiếu Vòng 1 thì tự công bố Nhóm trưởng và mở Vòng 2, đủ nguyện vọng Vòng 2 thì tự chạy matching. Nếu Giảng viên bấm nút tay thì hệ thống vẫn force start ngay.
        </p>

        <div className="button-stack">
          <button className="secondary-button teacher-button-soft" onClick={handleLogoutTeacher}>
            Đăng xuất Giảng viên
          </button>
        </div>

        <div className="status-box">
          <p className="status-label">Lớp đang quản lý</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
              gap: 16,
              alignItems: "end",
              marginBottom: 16
            }}
          >
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Chọn lớp</span>
              <select
                value={selectedClassId}
                onChange={(event) => {
                  setSelectedClassId(event.target.value);
                  if (currentUser) {
                    localStorage.setItem(
                      teacherSelectedClassKey(currentUser.uid),
                      event.target.value
                    );
                  }
                }}
              >
                <option value="">-- Chọn lớp --</option>
                {teacherClasses.map((classItem) => (
                  <option key={classItem.docId} value={classItem.docId}>
                    {classItem.className} ({classItem.docId})
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="status-label" style={{ marginBottom: 8 }}>
                {currentTeacherClass?.className || "Chưa chọn lớp"}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 10
                }}
              >
                <button
                  className="secondary-button teacher-button-soft"
                  onClick={() => openRosterModal("view")}
                  disabled={!selectedClassId}
                >
                  Xem DS
                </button>

                <button
                  className="secondary-button teacher-button-soft"
                  onClick={() => openRosterModal("edit")}
                  disabled={!selectedClassId}
                >
                  Sửa lớp
                </button>

                <button
                  className="secondary-button danger-button"
                  onClick={handleDeleteCurrentClass}
                  disabled={isResetting || !selectedClassId}
                >
                  Xóa lớp
                </button>
              </div>
            </div>
          </div>

          {selectedClassId ? (
            <div className="status-box" style={{ marginBottom: 16 }}>
              <p className="status-label">Link lớp hiện tại</p>
              <p className="status-value">{buildClassLink(selectedClassId)}</p>
            </div>
          ) : null}

        </div>

        <div className="panel-grid stats-grid">
          <div className="status-box stat-box">
            <p className="status-label">Vòng</p>
            <p className="status-value stat-value-sm">{getRoundLabel(currentRound)}</p>
          </div>

          <div className="status-box stat-box">
            <p className="status-label">Trạng thái</p>
            <p className="status-value stat-value-xs">{roundStatus}</p>
          </div>

          <div className="status-box stat-box">
            <p className="status-label">Số SV đăng nhập</p>
            <button
              type="button"
              onClick={() =>
                openActivityModal(
                  "Danh sách SV đã đăng nhập",
                  `${loggedInParticipantCount}/${participantCount} sinh viên`,
                  loggedInParticipants.map((participant) => participant.fullName)
                )
              }
              disabled={loggedInParticipantCount === 0}
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                textAlign: "left",
                cursor: loggedInParticipantCount > 0 ? "pointer" : "default"
              }}
            >
              <p className="status-value stat-value-sm">
                {loggedInParticipantCount}/{participantCount}
              </p>
            </button>
          </div>

          <div className="status-box stat-box">
            <p className="status-label">Đã vote R1</p>
            <button
              type="button"
              onClick={() =>
                openActivityModal(
                  "Danh sách SV đã vote R1",
                  `${round1Votes.length}/${participantCount} sinh viên`,
                  round1VoterNames
                )
              }
              disabled={round1Votes.length === 0}
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                textAlign: "left",
                cursor: round1Votes.length > 0 ? "pointer" : "default"
              }}
            >
              <p className="status-value stat-value-sm">
                {round1Votes.length}/{participantCount}
              </p>
            </button>
          </div>

          <div className="status-box stat-box">
            <p className="status-label">Thành viên đã gửi R2</p>
            <button
              type="button"
              onClick={() =>
                openActivityModal(
                  "Danh sách Thành viên đã gửi R2",
                  `${memberPreferences.length}/${expectedMemberSubmissionCount} thành viên`,
                  round2MemberSubmitterNames
                )
              }
              disabled={memberPreferences.length === 0}
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                textAlign: "left",
                cursor: memberPreferences.length > 0 ? "pointer" : "default"
              }}
            >
              <p className="status-value stat-value-sm">
                {memberPreferences.length}/{expectedMemberSubmissionCount}
              </p>
            </button>
          </div>

          <div className="status-box stat-box">
            <p className="status-label">Nhóm trưởng đã gửi R2</p>
            <button
              type="button"
              onClick={() =>
                openActivityModal(
                  "Danh sách Nhóm trưởng đã gửi R2",
                  `${leaderRankings.length}/${expectedLeaderSubmissionCount} nhóm trưởng`,
                  round2LeaderSubmitterNames
                )
              }
              disabled={leaderRankings.length === 0}
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                textAlign: "left",
                cursor: leaderRankings.length > 0 ? "pointer" : "default"
              }}
            >
              <p className="status-value stat-value-sm">
                {leaderRankings.length}/{expectedLeaderSubmissionCount}
              </p>
            </button>
          </div>

          <div className="status-box stat-box">
            <p className="status-label">Tạo phòng R3</p>
            <button
              type="button"
              onClick={() =>
                openActivityModal(
                  "Danh sách Nhóm trưởng đã tạo phòng R3",
                  `${createdRoomCount}/${round3RoomTargetCount} nhóm`,
                  round3CreatedRoomLeaderNames
                )
              }
              disabled={createdRoomCount === 0}
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                textAlign: "left",
                cursor: createdRoomCount > 0 ? "pointer" : "default"
              }}
            >
              <p className="status-value stat-value-sm">
                {createdRoomCount}/{round3RoomTargetCount}
              </p>
            </button>
          </div>

          <div className="status-box stat-box">
            <p className="status-label">Thư đã gửi R3</p>
            <button
              type="button"
              onClick={() =>
                openActivityModal(
                  "Danh sách Sinh viên đã gửi thư R3",
                  `${round3Applications.length} thư`,
                  round3ApplicationSenderNames
                )
              }
              disabled={round3Applications.length === 0}
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                textAlign: "left",
                cursor: round3Applications.length > 0 ? "pointer" : "default"
              }}
            >
              <p className="status-value stat-value-sm">{round3Applications.length}</p>
            </button>
          </div>
        </div>

        <div className="status-box">
          <p className="status-label">Import danh sách SV</p>
          <p className="muted-text" style={{ marginTop: 0, marginBottom: 8 }}>
            Dán mỗi dòng theo dạng `MSSV[TAB]Họ tên[TAB]Thứ hạng` hoặc `MSSV, Họ tên, Thứ hạng`.
          </p>
          <p
            className="muted-text"
            style={{ marginTop: 0, marginBottom: 14, fontSize: 14, opacity: 0.85 }}
          >
            (Thứ hạng ở đây chỉ dùng để quyết định khi có các sinh viên hòa phiếu bầu, thầy/cô có
            thể lấy thứ hạng của sinh viên dựa trên điểm TB kì học/môn học trước, hoặc bất kì thứ
            hạng nào thầy/cô có. Nếu không có cột thứ hạng, hệ thống sẽ tự đánh số theo thứ tự
            dòng.)
          </p>
          <label className="field">
            <span>Tên lớp</span>
            <input
              className="text-input"
              value={newClassName}
              onChange={(event) => setNewClassName(event.target.value)}
              placeholder="Ví dụ: SU26-BL2-DM2001"
            />
          </label>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder={"TX00065\tNguyen Van A\t1\nTX00070\tTran Thi B\t2"}
            style={{
              width: "100%",
              minHeight: 180,
              borderRadius: 14,
              border: "1px solid var(--border)",
              padding: "14px 16px",
              font: "inherit",
              resize: "vertical",
              background: "#ffffff"
            }}
          />
          <div className="button-stack" style={{ marginTop: 14, marginBottom: 0 }}>
            <button
              className="primary-button teacher-button-soft"
              onClick={handleCreateClass}
              disabled={isImportingParticipants}
            >
              {isImportingParticipants
                ? "Đang import danh sách..."
                : "Import danh sách SV và tạo lớp mới"}
            </button>
          </div>
          {importMessage ? (
            <p className="lead" style={{ marginTop: 14, marginBottom: 0 }}>
              {importMessage}
            </p>
          ) : null}
        </div>

        <div className="button-stack">
          <button
            className="primary-button"
            onClick={() => void openRound1(true)}
            disabled={isStartingRound1 || !selectedClassId || currentRound !== "waiting"}
          >
            {isStartingRound1 ? "Đang mở Vòng 1..." : "Mở Vòng 1"}
          </button>

          <button
            className="secondary-button teacher-button-soft"
            onClick={() => void publishLeadersAndOpenRound2(true)}
            disabled={
              isPublishingRound2 ||
              !selectedClassId ||
              currentRound === "round2" ||
              currentRound === "round3"
            }
          >
            {isPublishingRound2
              ? "Đang công bố kết quả..."
              : "Công bố Nhóm trưởng và mở Vòng 2"}
          </button>

          <button
            className="secondary-button teacher-button-soft"
            onClick={() => void startRound2Matching(true, true)}
            disabled={isMatchingRound2 || !selectedClassId || currentRound !== "round2" || round2Matched}
          >
            {isMatchingRound2 ? "Đang matching Vòng 2..." : "Bắt đầu matching Vòng 2"}
          </button>

          <button
            className="secondary-button teacher-button-soft"
            onClick={() => void handleFinalizeRound3()}
            disabled={isFinalizingRound3 || !selectedClassId || currentRound !== "round3"}
          >
            {isFinalizingRound3
              ? "Đang chốt Vòng 3..."
              : "Kết thúc và show kết quả Vòng 3"}
          </button>

          <button
            className="secondary-button teacher-button-soft"
            onClick={() => void handleStartRound4()}
            disabled={isStartingRound4 || !selectedClassId || currentRound !== "round3_completed"}
          >
            {isStartingRound4 ? "Đang random fill..." : "Bắt đầu random fill"}
          </button>

          <button
            className="secondary-button danger-button"
            onClick={handleResetGame}
            disabled={isResetting || !selectedClassId}
          >
            {isResetting ? "Đang reset hệ thống..." : "Reset game"}
          </button>
        </div>

        <div className="status-box">
          <p className="status-label">
            {leadersVisible
              ? `${displayedTop4.length} Nhóm trưởng chính thức`
              : `Top ${displayedTop4.length} Nhóm trưởng tạm thời`}
          </p>
          <div className="name-list">
            {displayedTop4.map((leader, index) => (
              <div className="name-item" key={leader.studentId}>
                {index + 1}. {leader.fullName}
              </div>
            ))}
          </div>
        </div>

        {round2Matched && matchingResults.length > 0 ? (
          <div className="status-box">
            <p className="status-label">Kết quả matching Vòng 2</p>
            <div className="name-list">
              {matchingResults.map((group, index) => (
                <div className="name-item" key={group.leaderStudentId}>
                  <strong>Nhóm {index + 1}: {group.leaderFullName}</strong>
                  <div style={{ marginTop: 8 }}>
                    {group.memberFullNames.length > 0
                      ? group.memberFullNames.join(", ")
                      : "Chưa có match 2 chiều"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {currentRound === "round3" ? (
          <>
            <div className="status-box">
              <p className="status-label">Trạng thái realtime các nhóm ở Vòng 3</p>
              <div className="name-list">
                {liveRound3Groups.map((group, index) => (
                  <div className="name-item" key={`live-round3-${group.leaderStudentId}`}>
                    <strong>
                      Nhóm {index + 1}: {group.roomName}
                    </strong>
                    <div style={{ marginTop: 8 }}>
                      Nhóm trưởng: {group.leaderFullName}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      Số lượng hiện tại: {group.memberStudentIds.length}/{group.capacity}
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

            <div className="status-box">
              <p className="status-label">Sinh viên đang ở Đảo hoang</p>
              <div className="name-list">
                {liveRound3UnmatchedStudents.length > 0 ? (
                  liveRound3UnmatchedStudents.map((student) => (
                    <div className="name-item" key={`live-unmatched-${student.studentId}`}>
                      {student.fullName}
                    </div>
                  ))
                ) : (
                  <div className="name-item">Hiện không có sinh viên nào ở Đảo hoang.</div>
                )}
              </div>
            </div>
          </>
        ) : null}

        {currentRound === "round3_completed" ? (
          <>
            <div className="status-box">
              <p className="status-label">Kết quả đầy đủ của 4 nhóm sau Vòng 3</p>
              <div className="name-list">
                {round3Results.map((group, index) => (
                  <div className="name-item" key={`round3-result-${group.leaderStudentId}`}>
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

            <div className="status-box">
              <p className="status-label">Danh sách sinh viên chưa được match</p>
              <div className="name-list">
                {round3UnmatchedStudents.length > 0 ? (
                  round3UnmatchedStudents.map((student) => (
                    <div className="name-item" key={`round3-unmatched-${student.studentId}`}>
                      {student.fullName}
                    </div>
                  ))
                ) : (
                  <div className="name-item">Tất cả sinh viên đã vào nhóm.</div>
                )}
              </div>
            </div>
          </>
        ) : null}

        {currentRound === "round4_completed" ? (
          <div className="status-box">
            <p className="status-label">Kết quả cuối cùng sau random fill</p>
            <div className="name-list">
              {finalGroups.map((group, index) => (
                <div className="name-item" key={`final-${group.leaderStudentId}`}>
                  <strong>
                    Nhóm {index + 1}: {group.roomName}
                  </strong>
                  <div style={{ marginTop: 8 }}>
                    Nhóm trưởng: {group.leaderFullName}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {group.memberFullNames.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <Link className="secondary-button link-button" href="/">
          Quay về trang đầu
        </Link>
      </section>

      {isActivityModalOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 49
          }}
        >
          <div
            style={{
              width: "min(100%, 720px)",
              maxHeight: "80vh",
              overflow: "auto",
              background: "#ffffff",
              borderRadius: 20,
              padding: 24,
              border: "1px solid var(--border)",
              boxShadow: "0 20px 50px rgba(15, 23, 42, 0.2)"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 18
              }}
            >
              <div>
                <p className="status-label" style={{ marginBottom: 6 }}>
                  {activityModalTitle}
                </p>
                <p className="status-value" style={{ fontSize: 20 }}>
                  {activityModalSummary}
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() => setIsActivityModalOpen(false)}
                style={{ width: 120 }}
              >
                Đóng
              </button>
            </div>

            <div className="name-list">
              {activityModalEntries.length > 0 ? (
                activityModalEntries.map((entry, index) => (
                  <div className="name-item" key={`activity-entry-${index}-${entry}`}>
                    {index + 1}. {entry}
                  </div>
                ))
              ) : (
                <div className="name-item">Hiện chưa có dữ liệu để hiển thị.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isRosterModalOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 50
          }}
        >
          <div
            style={{
              width: "min(100%, 820px)",
              maxHeight: "85vh",
              overflow: "auto",
              background: "#ffffff",
              borderRadius: 20,
              padding: 24,
              border: "1px solid var(--border)",
              boxShadow: "0 20px 50px rgba(15, 23, 42, 0.2)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
              <div>
                <p className="status-label" style={{ marginBottom: 6 }}>
                  {rosterModalMode === "view" ? "Danh sách SV" : "Sửa lớp hiện tại"}
                </p>
                <p className="status-value" style={{ fontSize: 20 }}>
                  {currentTeacherClass?.className || "Lớp đang chọn"}
                </p>
              </div>
              <button className="secondary-button" onClick={closeRosterModal} style={{ width: 120 }}>
                Đóng
              </button>
            </div>

            {rosterModalMode === "view" ? (
              <div className="name-list">
                {participants
                  .slice()
                  .sort((a, b) => a.ranking - b.ranking)
                  .map((participant, index) => (
                    <div className="name-item" key={participant.studentId}>
                      {index + 1}. {participant.studentId} - {participant.fullName} - Hạng {participant.ranking}
                    </div>
                  ))}
              </div>
            ) : (
              <>
                <label className="field">
                  <span>Tên lớp</span>
                  <input
                    className="text-input"
                    value={editClassName}
                    onChange={(event) => setEditClassName(event.target.value)}
                    placeholder="Ví dụ: SU26-BL2-DM2001"
                  />
                </label>

                <label className="field">
                  <span>Danh sách SV</span>
                  <textarea
                    value={editRosterText}
                    onChange={(event) => setEditRosterText(event.target.value)}
                    style={{
                      width: "100%",
                      minHeight: 260,
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      padding: "14px 16px",
                      font: "inherit",
                      resize: "vertical",
                      background: "#ffffff"
                    }}
                  />
                </label>

                <div className="button-stack" style={{ marginTop: 12 }}>
                  <button
                    className="primary-button teacher-button-soft"
                    onClick={handleSaveClassEdits}
                    disabled={isImportingParticipants}
                  >
                    {isImportingParticipants ? "Đang lưu thay đổi..." : "Lưu thay đổi lớp"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
