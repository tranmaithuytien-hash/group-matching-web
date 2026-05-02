"use client";

import { useEffect, useMemo, useState } from "react";
import { ensureFirebaseAnonymousAuth } from "../../../../lib/firebase-auth-bootstrap";
import { loadLearningMaterialsByTeacher, type LearningMaterial } from "../../../../lib/learning-materials";
import {
  approveGroup3InviteDraft,
  cancelGroup3InviteDraft,
  cancelWave,
  closeType1Group3Phase,
  confirmGroup3InviteDraft,
  confirmKeepPairDecision,
  createGroup3AcceptDecisionDraft,
  createKeepPairDecisionDraft,
  finalizeTopic2Selection,
  getType1GroupLeaderId,
  getTopicSessionByCodeAny,
  getTopicSessionByCode,
  getTopicSessionById,
  inviteThirdMember,
  joinTopic2Room,
  leaveTopic2Room,
  rejectOverflowType1Group3Requests,
  resolveBiddingRound,
  respondGroup3Wave,
  respondWave,
  saveType1BidDraft,
  sendWave,
  sendGroup3Wave,
  sendType1GroupMessage,
  setKeepPairDecisionApproval,
  setType1BidApproval,
  shouldResolveType1Bidding,
  teacherMoveType1ToGroup3,
  lockTopic2Room,
  sendTopic2RoomMessage,
  submitBid,
  setTopic2RoomAgreement,
  upsertTopicSession,
  type TopicSession
} from "../../../../lib/topic-picker";

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
    if (url.hostname.toLowerCase().includes("drive.google.com")) {
      const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
      if (fileMatch?.[1]) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    }
    return normalized;
  } catch {
    return normalized;
  }
}

export default function TopicPickerJoinPage() {
  const [classCode, setClassCode] = useState("");
  const [session, setSession] = useState<TopicSession | null>(null);
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isAutoLookingUp, setIsAutoLookingUp] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [chatInput, setChatInput] = useState("");
  const [previewTopic, setPreviewTopic] = useState("");
  const [showBidModal, setShowBidModal] = useState(false);
  const [bidModalPointsInput, setBidModalPointsInput] = useState("");
  const [bidTopicInput, setBidTopicInput] = useState("");
  const [bidPointsInput, setBidPointsInput] = useState("");
  const [bidModalError, setBidModalError] = useState("");
  const [materialsMap, setMaterialsMap] = useState<Record<string, LearningMaterial>>({});

  const getGroupLabelByTopic = (topic: string, fallbackIndex = 0) => {
    const match = topic.match(/\d+/);
    const number = match ? Number(match[0]) : fallbackIndex + 1;
    return `Nhóm ${number}`;
  };

  const toDisplayName = (name: string) =>
    (name || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  useEffect(() => {
    void ensureFirebaseAnonymousAuth();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("code") || "").trim().toUpperCase();
    if (!code) return;
    setIsAutoLookingUp(true);
    setClassCode(code);
    void (async () => {
      const found = (await getTopicSessionByCodeAny(code)) || getTopicSessionByCode(code);
      if (!found) {
        setIsAutoLookingUp(false);
        return;
      }
      setSession(found);
      setStudentId("");
      setPreviewTopic(found.topics[0] || "");
      setStatusMessage("");
      setIsAutoLookingUp(false);
    })();
  }, []);

  useEffect(() => {
    if (!session?.id) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const latest = (await getTopicSessionByCodeAny(session.classCode)) || getTopicSessionById(session.id);
        if (latest) setSession(latest);
      })();
    }, 1200);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.classCode]);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!session || session.type !== 2 || session!.status !== "running") return;
    if (!session.topic2EndsAt || session!.topic2FinalizedAt) return;
    if (Date.now() < session.topic2EndsAt) return;
    const next = finalizeTopic2Selection(session, "Hết giờ chọn chủ đề");
    setSession(next);
    setStatusMessage("Hết giờ chọn phòng. Hệ thống đã chốt kết quả.");
  }, [session]);

  useEffect(() => {
    if (!session || session.type !== 1 || session.status !== "running") return;
    if (session.type1Stage === "bidding" && shouldResolveType1Bidding(session)) {
      const next = resolveBiddingRound(session);
      setSession(next);
      if (next.type1Stage === "completed") {
        setStatusMessage("Đã kết thúc đấu giá và công bố kết quả cuối.");
      } else {
        setStatusMessage(`Đã chốt vòng ${(session.biddingRound || 1)} và chuyển sang vòng ${next.biddingRound || 1}.`);
      }
      return;
    }
    if (
      session.type1Stage === "pairing" &&
      session.type1PairingEndsAt &&
      Date.now() >= session.type1PairingEndsAt
    ) {
      const moved = teacherMoveType1ToGroup3(session);
      if (moved.id !== session.id || moved.updatedAt !== session.updatedAt) {
        setSession(moved);
        setStatusMessage("Hết thời gian ghép cặp. Hệ thống đã chuyển sang lượt mời thành viên thứ 3.");
      }
      return;
    }
    const closedGroup3 = closeType1Group3Phase(session);
    if (closedGroup3.id !== session.id || closedGroup3.updatedAt !== session.updatedAt) {
      setSession(closedGroup3);
      setStatusMessage("Hết giờ mời thành viên thứ 3. Hệ thống đã tự random nhóm và công bố kết quả chia nhóm.");
      return;
    }
    const normalized = rejectOverflowType1Group3Requests(session);
    if (normalized.id !== session.id || normalized.updatedAt !== session.updatedAt) {
      setSession(normalized);
      return;
    }
    if (session.type1Stage !== "pairing") return;
    if (!session.type1PairingEndsAt) return;
    if (Date.now() < session.type1PairingEndsAt) return;
    setStatusMessage("Hết thời gian vẫy tay. Đã chốt kết quả ghép cặp, chờ GV mở lượt nhóm 3.");
  }, [session]);

  useEffect(() => {
    if (!session?.ownerTeacherEmail) return;
    const mats = loadLearningMaterialsByTeacher(session.ownerTeacherEmail).filter(
      (m) => m.category === "presentation-topic" && m.courseCode === session.subjectName
    );
    const next: Record<string, LearningMaterial> = {};
    session.topics.forEach((topic) => {
      const found = mats.find((m) => m.title.trim().toLowerCase() === topic.trim().toLowerCase());
      if (found) next[topic] = found;
    });
    setMaterialsMap(next);
  }, [session]);

  const selectedStudent = useMemo(
    () => session?.students.find((s) => s.studentId === studentId) || null,
    [session, studentId]
  );
  const myType1Group = useMemo(() => {
    if (!session || session.type !== 1 || !studentId) return null;
    return (session.workingGroups || []).find((group) => group.memberStudentIds.includes(studentId)) || null;
  }, [session, studentId]);
  const type1IncomingRequests = useMemo(() => {
    if (!session || session.type !== 1 || !studentId) return [];
    return (session.waveRequests || []).filter((item) => item.toStudentId === studentId && item.status === "pending");
  }, [session, studentId]);
  const type1UnpairedOthers = useMemo(() => {
    if (!session || session.type !== 1 || !studentId) return [];
    const groupedIds = new Set((session.workingGroups || []).flatMap((group) => group.memberStudentIds));
    return session.students.filter(
      (student) => student.studentId !== studentId && !groupedIds.has(student.studentId)
    );
  }, [session, studentId]);
  const myOutgoingWaves = useMemo(() => {
    if (!session || session.type !== 1 || !studentId) return new Set<string>();
    return new Set(
      (session.waveRequests || [])
        .filter((item) => item.fromStudentId === studentId && item.status === "pending")
        .map((item) => item.toStudentId)
    );
  }, [session, studentId]);
  const myPendingGroup3LeaderId = useMemo(() => {
    if (!session || session.type !== 1 || !studentId || session.type1Stage !== "group3") return "";
    return (
      (session.waveRequests || []).find(
        (item) => item.fromStudentId === studentId && item.status === "pending"
      )?.toStudentId || ""
    );
  }, [session, studentId]);
  const myPendingWaveTargetId = useMemo(() => {
    if (!session || session.type !== 1 || !studentId) return "";
    return (
      (session.waveRequests || []).find((item) => item.fromStudentId === studentId && item.status === "pending")?.toStudentId || ""
    );
  }, [session, studentId]);
  const myGroupLeaderId = useMemo(() => {
    if (!session || !myType1Group) return "";
    const scores = myType1Group.memberStudentIds.map((id) => ({
      id,
      score: session.students.find((s) => s.studentId === id)?.scoreValue || 0
    }));
    scores.sort((a, b) => b.score - a.score);
    return scores[0]?.id || "";
  }, [session, myType1Group]);
  const myGroupLeaderName = useMemo(() => {
    if (!session || !myGroupLeaderId) return "";
    return session.students.find((s) => s.studentId === myGroupLeaderId)?.fullName || myGroupLeaderId;
  }, [session, myGroupLeaderId]);
  const myGroupAveragePoints = useMemo(() => {
    if (!session || !myType1Group) return 0;
    const scores = myType1Group.memberStudentIds.map((id) => session.students.find((s) => s.studentId === id)?.scoreValue || 0);
    if (scores.length === 0) return 0;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10);
  }, [session, myType1Group]);
  const myGroup3IncomingRequests = useMemo(() => {
    if (!session || session.type !== 1 || session.type1Stage !== "group3" || !myType1Group) return [];
    const leaderId = getType1GroupLeaderId(session, myType1Group.id);
    return (session.waveRequests || []).filter(
      (item) =>
        item.toStudentId === leaderId && item.status === "pending"
    );
  }, [session, studentId, myType1Group]);
  const group3PairGroups = useMemo(() => {
    if (!session || session.type !== 1 || session.type1Stage !== "group3") return [];
    const locked = new Set(session.type1LockedGroupIds || []);
    return (session.workingGroups || []).filter((group) => group.memberStudentIds.length === 2 && !locked.has(group.id));
  }, [session]);
  const type1GroupSlotStats = useMemo(() => {
    if (!session || session.type !== 1) return { group2Remain: 0, group3Remain: 0 };
    const groups = session.workingGroups || [];
    const group3Used = groups.filter((group) => group.memberStudentIds.length >= 3).length;
    return {
      group2Remain: Math.max(0, session.groupsOf2 - (session.type1KeptGroup2Count || 0)),
      group3Remain: Math.max(0, session.groupsOf3 - group3Used)
    };
  }, [session]);
  const type1PairingOpen = Boolean(
    session &&
      session.type === 1 &&
      session.type1Stage === "pairing" &&
      (!session.type1PairingEndsAt || Date.now() < session.type1PairingEndsAt)
  );
  const type1Group3Ended = Boolean(
    session && session.type === 1 && session.type1Stage === "group3" && session.type1Group3EndsAt && Date.now() >= session.type1Group3EndsAt
  );
  const canLeaderInviteInGroup3 = Boolean(
    session &&
      session.type === 1 &&
      session.type1Stage === "group3" &&
      myType1Group &&
      myGroupLeaderId === studentId &&
      myType1Group.memberStudentIds.length === 2 &&
      !(session.type1LockedGroupIds || []).includes(myType1Group.id) &&
      !type1Group3Ended
  );
  const leaderGroup3Draft = useMemo(() => {
    if (!session || session.type !== 1 || session.type1Stage !== "group3" || !myType1Group) return null;
    if (myGroupLeaderId !== studentId) return null;
    return (
      (session.waveRequests || []).find(
        (item) => item.status === "draft_member3" && item.fromStudentId === studentId
      ) || null
    );
  }, [session, myType1Group, myGroupLeaderId, studentId]);
  const partnerGroup3Draft = useMemo(() => {
    if (!session || session.type !== 1 || session.type1Stage !== "group3" || !myType1Group) return null;
    if (myGroupLeaderId === studentId) return null;
    return (
      (session.waveRequests || []).find(
        (item) =>
          item.status === "draft_member3" &&
          item.fromStudentId === myGroupLeaderId &&
          myType1Group.memberStudentIds.includes(studentId)
      ) || null
    );
  }, [session, myType1Group, myGroupLeaderId, studentId]);
  const leaderDraftTargetName = useMemo(() => {
    if (!session || !leaderGroup3Draft) return "";
    return session.students.find((s) => s.studentId === leaderGroup3Draft.toStudentId)?.fullName || leaderGroup3Draft.toStudentId;
  }, [session, leaderGroup3Draft]);
  const partnerApprovedLeaderDraft = Boolean(partnerGroup3Draft?.approvalByStudentId?.[studentId]);
  const myKeep2Draft = useMemo(() => {
    if (!session || !myType1Group || session.type !== 1 || session.type1Stage !== "group3") return null;
    return session.type1Keep2DraftByGroupId?.[myType1Group.id] || null;
  }, [session, myType1Group]);
  const myKeep2ApprovedCount =
    myType1Group && myKeep2Draft
      ? myType1Group.memberStudentIds.filter((id) => Boolean(myKeep2Draft.approvalByStudentId?.[id])).length
      : 0;
  const myKeep2Locked = Boolean(
    session &&
      myType1Group &&
      session.type === 1 &&
      session.type1Stage === "group3" &&
      (session.type1LockedGroupIds || []).includes(myType1Group.id)
  );
  const disableGroup3RightPanel = Boolean(
    session &&
      session.type === 1 &&
      session.type1Stage === "group3" &&
      myType1Group &&
      (myKeep2Locked || myType1Group.memberStudentIds.length >= 3)
  );
  const canUseKeep2Decision = Boolean(
    session &&
      session.type === 1 &&
      session.type1Stage === "group3" &&
      type1GroupSlotStats.group2Remain > 0
  );
  const myGroup3DecisionDrafts = useMemo(() => {
    if (!session || session.type !== 1 || session.type1Stage !== "group3" || !myType1Group) return [];
    return (session.waveRequests || []).filter(
      (item) =>
        item.status === "draft_member3" &&
        item.fromStudentId === myGroupLeaderId &&
        !(session.waveRequests || []).some(
          (pending) =>
            pending.status === "pending" &&
            pending.fromStudentId === item.toStudentId &&
            pending.toStudentId === item.fromStudentId
        )
    );
  }, [session, myType1Group, myGroupLeaderId]);
  const myGroupPendingInviteTargetId = useMemo(() => {
    if (!session || session.type !== 1 || session.type1Stage !== "group3" || !myType1Group) return "";
    const leaderId = getType1GroupLeaderId(session, myType1Group.id);
    return (
      (session.waveRequests || []).find(
        (item) => item.status === "pending" && item.fromStudentId === leaderId
      )?.toStudentId || ""
    );
  }, [session, myType1Group]);

  const joinedTopic = useMemo(() => {
    if (!session || !studentId) return "";
    return Object.entries(session!.topic2RoomMembers || {}).find(([, members]) => members.includes(studentId))?.[0] || "";
  }, [session, studentId]);

  const joinedTopicLocked = Boolean(joinedTopic && (session?.topic2LockedTopics || []).includes(joinedTopic));

  const selectableTopics = useMemo(() => {
    if (!session) return [];
    return session.topics.filter((topic) => !(session!.topic2LockedTopics || []).includes(topic));
  }, [session]);

  const roomMembers = useMemo(() => {
    if (!session || !joinedTopic) return [];
    return (session!.topic2RoomMembers?.[joinedTopic] || []).map((id) => ({
      id,
      name: session.students.find((s) => s.studentId === id)?.fullName || id
    }));
  }, [session, joinedTopic]);

  const roomMessages = useMemo(() => {
    if (!session || !joinedTopic) return [];
    return session.topic2MessagesByTopic?.[joinedTopic] || [];
  }, [session, joinedTopic]);

  const roomAgreement = useMemo(() => {
    if (!session || !joinedTopic) return {};
    return session.topic2AgreementByTopic?.[joinedTopic] || {};
  }, [session, joinedTopic]);

  const allMembersAgreed = roomMembers.length > 0 && roomMembers.every((m) => Boolean(roomAgreement[m.id]));
  const canConfirmRoom = roomMembers.length >= 2 && allMembersAgreed;

  const availabilityStats = useMemo(() => {
    if (!session) return { group2Available: 0, group3Available: 0 };
    let group2Available = 0;
    let group3Available = 0;
    const topics = session.topics.slice(0, session.topicCount);
    topics.forEach((topic, index) => {
      if ((session!.topic2LockedTopics || []).includes(topic)) return;
      const target = index < session.groupsOf3 ? 3 : 2;
      const members = session!.topic2RoomMembers?.[topic]?.length || 0;
      if (members < target) {
        if (target === 2) group2Available += 1;
        else group3Available += 1;
      }
    });
    return { group2Available, group3Available };
  }, [session]);

  const currentTopic = joinedTopic || previewTopic;
  const currentMaterial = materialsMap[currentTopic];
  const isFinalized = Boolean(session?.topic2FinalizedAt || session?.status === "completed");

  const formatCountdown = (endsAt?: number) => {
    if (!endsAt) return "--:--";
    const remainMs = Math.max(0, endsAt - nowMs);
    const sec = Math.floor(remainMs / 1000);
    return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  };

  const getType1StageLabel = (current: TopicSession) => {
    if (current.type !== 1) return "";
    if (current.type1Stage === "pairing") return "Vòng ghép cặp";
    if (current.type1Stage === "group3") return "Vòng mời thành viên thứ 3";
    if (current.type1Stage === "bidding") return `Vòng đấu giá ${current.biddingRound || 1}/5`;
    return "Đã hoàn tất";
  };

  const handleFind = () => {
    if (!classCode.trim()) {
      setStatusMessage("Vui lòng nhập class code.");
      return;
    }
    const found = getTopicSessionByCode(classCode);
    if (!found) return setStatusMessage("Không tìm thấy phiên.");
    setSession(found);
    setStudentId("");
    setPreviewTopic(found.topics[0] || "");
    setIsLoggedIn(false);
    setStatusMessage("");
  };

  const handleLogin = () => {
    if (!session || !studentId) return;
    const hasOld = Boolean(session.credentialsByStudentId?.[studentId]);
    if (!hasOld) {
      if (newPassword.trim().length < 4 || newPassword !== confirmPassword) {
        return setStatusMessage("Mật khẩu chưa hợp lệ hoặc chưa khớp.");
      }
      const next = upsertTopicSession({
        ...session,
        credentialsByStudentId: { ...session.credentialsByStudentId, [studentId]: newPassword.trim() },
        updatedAt: Date.now()
      });
      setSession(next);
      setIsLoggedIn(true);
      return setStatusMessage("");
    }
    if (session.credentialsByStudentId[studentId] !== password) return setStatusMessage("Mật khẩu không đúng.");
    setIsLoggedIn(true);
    setStatusMessage("");
  };

  const myFinalGroup = session?.finalGroups.find((g) => g.memberStudentIds.includes(studentId)) || null;
  const hasWonTopic = Boolean(session && session.type === 1 && myType1Group && (session.finalGroups || []).some((g) => g.id === myType1Group.id));
  const isType1Completed = Boolean(session && session.type === 1 && (session.type1Stage === "completed" || session.status === "completed"));
  const isType1Started = Boolean(
    session &&
      session.type === 1 &&
      (session.status !== "preparing" ||
        Boolean(session.type1PairingEndsAt) ||
        session.type1Stage === "group3" ||
        session.type1Stage === "bidding" ||
        session.type1Stage === "completed")
  );
  const myGroupId = myType1Group?.id || "";
  const myRoundSubmitted = Boolean(
    session &&
      session.type === 1 &&
      session.type1Stage === "bidding" &&
      myGroupId &&
      (session.bidRecords || []).some((bid) => bid.groupId === myGroupId && bid.round === (session.biddingRound || 1))
  );
  const myBidDraft =
    session && session.type === 1 && myGroupId ? session.type1BidDraftByGroupId?.[myGroupId] : undefined;
  const myBidApprovals =
    session && session.type === 1 && myGroupId ? session.type1BidApprovalsByGroupId?.[myGroupId] || {} : {};
  const myRemainingPoints =
    session && session.type === 1 && myGroupId ? session.groupRemainingPoints?.[myGroupId] || 0 : 0;
  const myType1PenaltySummary =
    session && session.type === 1 && myGroupId
      ? session.type1PenaltySummaryByGroupId?.[myGroupId]
      : undefined;
  const myType1PenaltyNote =
    myType1PenaltySummary?.kind === "no_bid_80_percent"
      ? "Vì nhóm chưa tham gia đấu giá nên điểm còn lại bị trừ 80% theo quy định."
      : myType1PenaltySummary?.kind === "bid_no_win_35_points"
        ? "Vì bạn chưa thắng vòng đấu giá nào nên phải mua chủ đề còn lại với phí 35 điểm."
        : "";
  const usedTopics = new Set((session?.finalGroups || []).map((group) => group.topic));
  const availableBidTopics =
    session && session.type === 1
      ? session.topics.filter((topic) => !usedTopics.has(topic))
      : [];
  const selectedLeftBidTopic = hasWonTopic ? (myFinalGroup?.topic || "") : (myBidDraft?.topic || previewTopic);
  const myBidAllApproved = Boolean(
    session &&
      myType1Group &&
      myBidDraft &&
      myBidDraft.round === (session.biddingRound || 1) &&
      myType1Group.memberStudentIds.every((id) => Boolean(myBidApprovals[id]))
  );
  const myBidHistoryCount =
    session && session.type === 1 && myGroupId
      ? (session.bidRecords || []).filter((bid) => bid.groupId === myGroupId).length
      : 0;
  const biddingRoundStatusNote =
    session && session.type === 1 && session.type1Stage === "bidding" && myType1Group
      ? hasWonTopic
        ? `Nhóm bạn đã thắng chủ đề ${myFinalGroup?.topic}. Bạn chỉ cần theo dõi kết quả các nhóm còn lại.`
        : myBidHistoryCount > 0
          ? `Nhóm bạn chưa thắng ở các vòng trước. Hãy tiếp tục đấu giá ở vòng ${session.biddingRound || 1}.`
          : `Nhóm bạn chưa nộp ở vòng nào. Hãy chốt quyết định cho vòng ${session.biddingRound || 1}.`
      : "";

  useEffect(() => {
    if (!session || session.type !== 1 || session.type1Stage !== "bidding") return;
    if (!myType1Group) return;
    if (!previewTopic || !availableBidTopics.includes(previewTopic)) {
      setPreviewTopic(availableBidTopics[0] || "");
    }
    const draft = session.type1BidDraftByGroupId?.[myType1Group.id];
    if (draft && draft.round === (session.biddingRound || 1)) {
      setBidTopicInput(draft.topic);
      setBidPointsInput(String(draft.points));
      return;
    }
    setBidTopicInput((prev) => prev || availableBidTopics[0] || "");
    setBidPointsInput((prev) => prev || "1");
  }, [session, myType1Group, availableBidTopics]);

  useEffect(() => {
    if (!showBidModal) return;
    setBidModalPointsInput((prev) => prev || String(Math.min(Math.max(1, myRemainingPoints), 10)));
  }, [showBidModal, myRemainingPoints]);

  return (
    <main className="section-page">
      <div className="site-shell group-shell">
        <section className="group-form-card" style={{ background: "transparent", border: "none", boxShadow: "none", padding: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <span className="section-eyebrow">KHU VỰC SINH VIÊN</span>
              {session ? <h2 style={{ marginTop: 10, fontSize: 30 }}>{`Phiên lựa chọn chủ đề của ${session.className}`}</h2> : null}
              {session ? (
                <p style={{ marginTop: 6 }}>
                  Class code: <strong>{session.classCode}</strong> · Trạng thái:{" "}
                  <strong>
                    {session.type === 1
                      ? getType1StageLabel(session)
                      : session!.status === "completed" || session!.topic2FinalizedAt
                        ? "Đã kết thúc"
                        : session!.status === "running"
                          ? "Đang diễn ra"
                          : "Chuẩn bị"}
                  </strong>
                </p>
              ) : null}
              {statusMessage ? (
                <p className="hint-copy" style={{ marginTop: 8, color: "#c0192f", fontWeight: 400, fontSize: 18 }}>
                  {statusMessage}
                </p>
              ) : null}
              {session && session.type === 2 ? (
                <p className="hint-copy" style={{ marginTop: 4, fontSize: 18, color: "#c0192f", fontWeight: 600 }}>
                  Số nhóm 2 thành viên còn lại: <strong>{availabilityStats.group2Available}</strong>. Số nhóm 3 thành viên còn lại:{" "}
                  <strong>{availabilityStats.group3Available}</strong>
                </p>
              ) : null}
              {session && session.type === 1 && (session.type1Stage === "pairing" || session.type1Stage === "group3") ? (
                <p className="hint-copy" style={{ marginTop: 4, fontSize: 18, color: "#c0192f", fontWeight: 600 }}>
                  Số nhóm 2 thành viên còn lại: <strong>{type1GroupSlotStats.group2Remain}</strong>. Số nhóm 3 thành viên còn lại:{" "}
                  <strong>{type1GroupSlotStats.group3Remain}</strong>
                </p>
              ) : null}
            </div>
            <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
              {session && session.type === 1 && session.type1Stage === "bidding" ? (
                <p className="hint-copy" style={{ margin: 0, fontSize: 24, color: "#c0192f", fontWeight: 800 }}>
                  {formatCountdown(session.type1RoundEndsAt || Date.now() + 5 * 60 * 1000)}
                </p>
              ) : null}
              <a href="/" className="hero-secondary">Về trang chủ</a>
            </div>
          </div>

          {!session && !isAutoLookingUp ? (
            <div style={{ marginTop: 14 }}>
              <label className="field">
                <span>Class code</span>
                <input
                  className="text-input"
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleFind();
                    }
                  }}
                />
              </label>
              <button type="button" className="hero-secondary" onClick={handleFind}>Tìm phiên</button>
            </div>
          ) : !session && isAutoLookingUp ? (
            <article className="content-card" style={{ marginTop: 14 }}>
              <p className="hint-copy">Đang tìm phiên...</p>
            </article>
          ) : !isLoggedIn ? (
            <article className="content-card" style={{ marginTop: 14 }}>
              <label className="field">
                <span>Chọn tên Sinh viên</span>
                <select className="text-input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="" disabled>
                    ---Chọn tên của bạn---
                  </option>
                  {session!.students.map((s) => (
                    <option key={s.studentId} value={s.studentId}>{s.fullName}</option>
                  ))}
                </select>
              </label>
              {session!.credentialsByStudentId?.[studentId] ? (
                <label className="field">
                  <span>Mật khẩu phiên</span>
                  <input
                    className="text-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleLogin();
                      }
                    }}
                  />
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>Tạo mật khẩu</span>
                    <input
                      className="text-input"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleLogin();
                        }
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Nhập lại mật khẩu</span>
                    <input
                      className="text-input"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleLogin();
                        }
                      }}
                    />
                  </label>
                </>
              )}
              <button type="button" className="hero-primary" style={{ width: "100%" }} onClick={handleLogin} disabled={!studentId}>Bắt đầu</button>
            </article>
          ) : session && session.type === 3 ? (
            <>
              {session!.status === "preparing" ? (
                <article className="content-card" style={{ marginTop: 14, position: "relative" }}>
                  {session.type1Stage === "bidding" ? (
                    <div style={{ position: "absolute", top: 14, right: 16, color: "#c0192f", fontSize: 24, fontWeight: 800 }}>
                      {formatCountdown(session.type1RoundEndsAt)}
                    </div>
                  ) : null}
                  <p style={{ fontSize: 28 }}>Xin chào, <strong>{selectedStudent?.fullName}</strong></p>
                  <h3>Phòng chờ</h3>
                  <p className="hint-copy">Giáo viên chưa bắt đầu phiên. Bạn đang ở trạng thái chờ.</p>
                </article>
              ) : null}
              {session!.status === "running" ? (
                <article className="content-card" style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 28 }}>Xin chào, <strong>{selectedStudent?.fullName}</strong></p>
                  <h3>Phòng chờ</h3>
                  <p className="hint-copy">Phiên đã bắt đầu. Vui lòng chờ giáo viên bấm random để công bố kết quả chia chủ đề.</p>
                </article>
              ) : null}
              {session!.status === "completed" ? (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, marginTop: 14 }}>
                  <article className="content-card" style={{ padding: 12 }}>
                    <p style={{ fontSize: 28 }}>Xin chào, <strong>{selectedStudent?.fullName}</strong></p>
                    <h3>Kết quả sau vòng chọn chủ đề</h3>
                    {myFinalGroup ? (
                      <article className="hero-secondary" style={{ textAlign: "left", display: "block", marginTop: 10, padding: "14px 16px" }}>
                        <span style={{ display: "block", fontWeight: 700 }}>
                          {getGroupLabelByTopic(myFinalGroup.topic)} · {myFinalGroup.topic}
                        </span>
                        <ul style={{ margin: "10px 0 0 22px", padding: 0, lineHeight: 1.7 }}>
                          {myFinalGroup.memberNames.map((name) => (
                            <li key={`${myFinalGroup.topic}-${name}`}>{name}</li>
                          ))}
                        </ul>
                      </article>
                    ) : (
                      <p className="hint-copy">Đang cập nhật kết quả của bạn...</p>
                    )}
                  </article>

                  <article className="content-card" style={{ padding: 12, position: "relative" }}>
                    <div style={{ position: "absolute", right: 12, top: 12, color: "#c0192f", fontSize: 22, fontWeight: 800 }}>
                      Đã kết thúc
                    </div>
                    <h3 style={{ paddingRight: 140 }}>{myFinalGroup?.topic || "Chủ đề của nhóm bạn"}</h3>
                    <p style={{ marginTop: 8 }}>
                      {myFinalGroup ? (materialsMap[myFinalGroup.topic]?.description?.trim() || "Chưa có nội dung chi tiết.") : "Đang cập nhật nội dung chủ đề."}
                    </p>
                    {myFinalGroup ? (
                      <p className="hint-copy" style={{ marginTop: 6 }}>
                        Thành viên trong nhóm: <strong>{myFinalGroup.memberNames.length}</strong>
                      </p>
                    ) : null}
                    {myFinalGroup && materialsMap[myFinalGroup.topic]?.attachments?.[0]?.dataUrl ? (
                      <img
                        src={materialsMap[myFinalGroup.topic]?.attachments?.[0]?.dataUrl}
                        alt={materialsMap[myFinalGroup.topic]?.attachments?.[0]?.name || myFinalGroup.topic}
                        style={{ width: "100%", borderRadius: 10, marginTop: 10 }}
                      />
                    ) : null}
                    {myFinalGroup && materialsMap[myFinalGroup.topic]?.externalUrl ? (
                      <div style={{ marginTop: 8 }}>
                        {(() => {
                          const openUrl = normalizeExternalUrl(materialsMap[myFinalGroup.topic]?.externalUrl || "");
                          const embedUrl = toEmbeddableUrl(openUrl);
                          if (!openUrl) return null;
                          return (
                            <>
                              <a className="materials-text-action" href={openUrl} target="_blank" rel="noreferrer">
                                Mở tab mới
                              </a>
                              <iframe
                                title={`Preview ${myFinalGroup.topic}`}
                                src={embedUrl}
                                className="materials-preview-frame"
                                style={{ marginTop: 8, borderRadius: 10, minHeight: 280 }}
                              />
                              <p className="hint-copy" style={{ marginTop: 6, fontSize: 10, fontWeight: 400, color: "#d7d3e6", lineHeight: 1.4 }}>
                                Nhấp vào khung trắng để link drive được hiển thị. Nếu vẫn không, vui lòng bấm Mở tab mới
                              </p>
                            </>
                          );
                        })()}
                        <p className="hint-copy" style={{ marginTop: 4, fontSize: 13, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                          Link: {materialsMap[myFinalGroup.topic]?.externalUrl}
                        </p>
                      </div>
                    ) : null}
                  </article>
                </div>
              ) : null}
            </>
          ) : session && session.type === 1 ? (
            <>
              {!isType1Started ? (
                <article className="content-card" style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 28 }}>Xin chào, <strong>{selectedStudent?.fullName}</strong></p>
                  {selectedStudent ? (
                    <p className="hint-copy" style={{ marginTop: 6 }}>
                      Số điểm bạn đang có là <strong>{Math.round((selectedStudent.scoreValue || 0) * 10)}</strong> điểm.
                    </p>
                  ) : null}
                  <h3>Phòng chờ</h3>
                  <p className="hint-copy">Giáo viên chưa bắt đầu vòng bắt nhóm. Bạn đang ở trạng thái chờ.</p>
                </article>
              ) : null}
              {isType1Started ? (
                <article className="content-card" style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                    <p style={{ fontSize: 28, margin: 0 }}>Xin chào, <strong>{selectedStudent?.fullName}</strong></p>
                    {selectedStudent ? (
                      <p className="hint-copy" style={{ margin: 0 }}>
                        {myType1Group
                          ? <>Số điểm nhóm của bạn là <strong>{Math.round(myRemainingPoints || myGroupAveragePoints)}</strong> điểm.</>
                          : <>Số điểm bạn đang có là <strong>{Math.round((selectedStudent.scoreValue || 0) * 10)}</strong> điểm.</>}
                      </p>
                    ) : null}
                  </div>
                  {session.type1Stage === "pairing" ? (
                    <p className="hint-copy" style={{ marginTop: 8, fontSize: 18, color: "#c0192f", fontWeight: 600 }}>
                      Thời gian vẫy tay ghép cặp còn lại: <strong>{formatCountdown(session.type1PairingEndsAt)}</strong>
                    </p>
                  ) : null}
                  {session.type1Stage === "group3" ? (
                    <p className="hint-copy" style={{ marginTop: 8, fontSize: 18, color: "#c0192f", fontWeight: 600 }}>
                      Thời gian còn lại cho lượt mời thành viên thứ 3:{" "}
                      <strong>{type1Group3Ended ? "Đã kết thúc" : formatCountdown(session.type1Group3EndsAt)}</strong>
                    </p>
                  ) : null}
                  {type1Group3Ended ? (
                    <p className="hint-copy" style={{ marginTop: 8, fontSize: 18, color: "#c0192f", fontWeight: 700 }}>
                      Lượt mời thành viên thứ 3 đã kết thúc. Nếu bạn chưa có nhóm, vui lòng chờ GV bấm random xếp nhóm.
                    </p>
                  ) : null}
                  {biddingRoundStatusNote ? (
                    <p className="hint-copy" style={{ marginTop: 8, fontSize: 18, color: hasWonTopic ? "#0d6b2f" : "#c0192f", fontWeight: 700 }}>
                      {biddingRoundStatusNote}
                    </p>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, marginTop: 10 }}>
                    <article className="content-card" style={{ padding: 16, display: "flex", flexDirection: "column" }}>
                      <h3>Thông tin của bạn</h3>
                      {myType1Group ? (
                        <article className="hero-secondary" style={{ marginTop: 10, textAlign: "left", display: "block" }}>
                          <span style={{ fontSize: 18, display: "block" }}>Bạn đã ghép nhóm</span>
                          <small style={{ display: "block", marginTop: 8, lineHeight: 1.7, fontSize: 16 }}>
                            {myType1Group.memberNames.map((name) => (
                              <span key={`group-member-${myType1Group.id}-${name}`} style={{ display: "block", fontWeight: 400 }}>
                                {name}
                                {name === myGroupLeaderName ? " (Nhóm trưởng)" : ""}
                              </span>
                            ))}
                          </small>
                        </article>
                      ) : (
                        <p className="hint-copy" style={{ marginTop: 8 }}>Bạn chưa ghép nhóm.</p>
                      )}
                      {session.type1Stage === "group3" && myType1Group ? (
                        <article className="content-card" style={{ marginTop: 10, padding: 12 }}>
                          <p><strong>Tổng điểm trung bình nhóm:</strong> {myGroupAveragePoints} điểm</p>
                          <p style={{ marginTop: 6 }}><strong>Nhóm trưởng:</strong> {myGroupLeaderName}</p>
                          {myGroupLeaderId === studentId ? (
                            <p className="hint-copy" style={{ marginTop: 6, color: "#c0192f", fontWeight: 400, fontSize: 16 }}>
                              Bạn là nhóm trưởng, bạn có quyền tạo quyết định nhưng vẫn phải có sự đồng ý từ thành viên thứ 2 mới được xác nhận thực hiện quyết định đó.
                            </p>
                          ) : null}
                          {!myKeep2Locked && myType1Group.memberStudentIds.length === 2 && canUseKeep2Decision ? (
                            <article className="status-box" style={{ marginTop: 10 }}>
                              <p className="status-label">Quyết định giữ nguyên nhóm 2 thành viên</p>
                              {myGroupLeaderId === studentId && !myKeep2Draft ? (
                                <button
                                  type="button"
                                  className="hero-secondary"
                                  style={{ marginTop: 8 }}
                                  onClick={() => {
                                    const next = createKeepPairDecisionDraft(session, studentId);
                                    if (next.updatedAt === session.updatedAt) {
                                      setStatusMessage("Không thể tạo quyết định giữ nguyên nhóm lúc này.");
                                      return;
                                    }
                                    setSession(next);
                                    setStatusMessage("Đã tạo quyết định giữ nguyên nhóm 2 TV.");
                                  }}
                                >
                                  Giữ nguyên đội hình nhóm 2 thành viên
                                </button>
                              ) : myKeep2Draft ? (
                                <div style={{ marginTop: 8 }}>
                                  <button
                                    type="button"
                                    className="hero-primary"
                                    onClick={() => {
                                      const currentlyApproved = Boolean(myKeep2Draft.approvalByStudentId?.[studentId]);
                                      let next = setKeepPairDecisionApproval(session, myType1Group.id, studentId, !currentlyApproved);
                                      const nextDraft = next.type1Keep2DraftByGroupId?.[myType1Group.id];
                                      const allApproved = myType1Group.memberStudentIds.every((id) =>
                                        Boolean(nextDraft?.approvalByStudentId?.[id])
                                      );
                                      if (allApproved) {
                                        next = confirmKeepPairDecision(next, myGroupLeaderId || studentId);
                                        setStatusMessage("Đã đủ đồng ý 2/2. Hệ thống tự chốt giữ nguyên nhóm 2 thành viên.");
                                      } else {
                                        const newCount = myType1Group.memberStudentIds.filter((id) =>
                                          Boolean(nextDraft?.approvalByStudentId?.[id])
                                        ).length;
                                        setStatusMessage(`Đã cập nhật đồng ý ${newCount}/2.`);
                                      }
                                      setSession(next);
                                    }}
                                  >
                                    {`Đồng ý ${myKeep2ApprovedCount}/2`}
                                  </button>
                                </div>
                              ) : (
                                <p className="hint-copy" style={{ marginTop: 8 }}>
                                  Chờ nhóm trưởng tạo quyết định giữ nguyên đội hình 2 TV.
                                </p>
                              )}
                            </article>
                          ) : null}
                          {!myKeep2Locked && myType1Group.memberStudentIds.length === 2 && !canUseKeep2Decision ? (
                            <article className="status-box" style={{ marginTop: 10 }}>
                              <p className="status-label">Quyết định giữ nguyên nhóm 2 thành viên</p>
                              <p className="hint-copy" style={{ marginTop: 8 }}>
                                Đã hết slot nhóm 2 thành viên, không thể giữ nguyên đội hình 2 TV.
                              </p>
                            </article>
                          ) : null}
                          {!myKeep2Locked && myType1Group.memberStudentIds.length === 2 ? (
                            <article className="status-box" style={{ marginTop: 10 }}>
                              <p className="status-label">Quyết định đồng ý thêm thành viên thứ 3</p>
                              {myGroup3DecisionDrafts.length === 0 ? (
                                <p className="hint-copy" style={{ marginTop: 8 }}>
                                  Chưa có quyết định mời TV3.
                                </p>
                              ) : (
                                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                                  {myGroup3DecisionDrafts.map((draft) => {
                                    const candidateName =
                                      session.students.find((student) => student.studentId === draft.toStudentId)?.fullName ||
                                      draft.toStudentId;
                                    const approvedCount = myType1Group.memberStudentIds.filter((id) =>
                                      Boolean(draft.approvalByStudentId?.[id])
                                    ).length;
                                    const myApproved = Boolean(draft.approvalByStudentId?.[studentId]);
                                    return (
                                      <article key={`draft-member3-${draft.fromStudentId}-${draft.toStudentId}`} className="hero-secondary" style={{ textAlign: "left", display: "block", padding: "10px 12px" }}>
                                        <p><strong>Mời:</strong> {toDisplayName(candidateName)}</p>
                                        <div className="group-action-row" style={{ marginTop: 8 }}>
                                          <button
                                            type="button"
                                            className="hero-primary"
                                            onClick={() => {
                                              let next = approveGroup3InviteDraft(
                                                session,
                                                studentId,
                                                myGroupLeaderId,
                                                draft.toStudentId,
                                                !myApproved
                                              );
                                              const nextDraft = (next.waveRequests || []).find(
                                                (item) =>
                                                  item.status === "draft_member3" &&
                                                  item.fromStudentId === myGroupLeaderId &&
                                                  item.toStudentId === draft.toStudentId
                                              );
                                              const enough = myType1Group.memberStudentIds.every((id) =>
                                                Boolean(nextDraft?.approvalByStudentId?.[id])
                                              );
                                              if (enough) {
                                                next = confirmGroup3InviteDraft(next, myGroupLeaderId, draft.toStudentId);
                                                setStatusMessage("Đã đủ đồng ý 2/2. Đã gửi lời mời, chờ sinh viên xác nhận.");
                                              }
                                              setSession(next);
                                            }}
                                          >
                                            {`Đồng ý ${approvedCount}/2`}
                                          </button>
                                          {myGroupLeaderId !== studentId ? (
                                            <button
                                              type="button"
                                              className="hero-secondary"
                                              onClick={() => {
                                                const next = cancelGroup3InviteDraft(session, myGroupLeaderId, draft.toStudentId);
                                                setSession(next);
                                                setStatusMessage("Thành viên đã từ chối. Đã hủy yêu cầu mời để nhóm trưởng chọn người khác.");
                                              }}
                                            >
                                              Từ chối
                                            </button>
                                          ) : null}
                                        </div>
                                      </article>
                                    );
                                  })}
                                </div>
                              )}
                            </article>
                          ) : null}
                          {myKeep2Locked ? (
                            <article className="status-box" style={{ marginTop: 10 }}>
                              <p className="status-label">Nhóm đã chốt giữ nguyên 2 thành viên</p>
                            </article>
                          ) : null}
                          {type1Group3Ended ? (
                            <article className="status-box" style={{ marginTop: 10 }}>
                              <p className="status-label">Chuẩn bị bước vào đấu giá chủ đề</p>
                              <p className="hint-copy" style={{ marginTop: 6 }}>
                                Điểm trung bình nhóm ({myGroupAveragePoints} điểm) sẽ là ngân sách gốc để đấu giá.
                              </p>
                              <ul style={{ margin: "8px 0 0 20px", padding: 0, lineHeight: 1.6 }}>
                                <li>Mỗi nhóm dùng điểm để đặt giá cho chủ đề muốn chọn.</li>
                                <li>Đặt giá cao hơn sẽ có ưu thế nhận chủ đề trong vòng đó.</li>
                                <li>Điểm đã dùng sẽ bị trừ vào ngân sách còn lại của nhóm.</li>
                              </ul>
                            </article>
                          ) : null}
                        </article>
                      ) : null}
                      {myType1Group ? (
                        <article className="content-card" style={{ marginTop: 10, padding: 10, order: 99 }}>
                          <h4>Chat nhóm riêng</h4>
                          <div style={{ marginTop: 8, border: "1px solid #d9cfff", borderRadius: 10, padding: 8, minHeight: 90, maxHeight: 180, overflowY: "auto" }}>
                            {(session.type1GroupChatByGroupId?.[myType1Group.id] || []).map((msg) => (
                              <p key={msg.id} style={{ margin: "0 0 6px", fontSize: 15 }}>
                                <strong>{msg.studentName}:</strong> {msg.text}
                              </p>
                            ))}
                            {(session.type1GroupChatByGroupId?.[myType1Group.id] || []).length === 0 ? (
                              <p className="hint-copy">Chưa có tin nhắn.</p>
                            ) : null}
                          </div>
                          <div className="group-action-row" style={{ marginTop: 8 }}>
                            <input
                              className="text-input"
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              placeholder="Nhắn cho thành viên nhóm..."
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                if (!chatInput.trim()) return;
                                setSession(sendType1GroupMessage(session, myType1Group.id, studentId, chatInput));
                                setChatInput("");
                              }}
                            />
                            <button
                              type="button"
                              className="hero-primary"
                              onClick={() => {
                                if (!chatInput.trim()) return;
                                setSession(sendType1GroupMessage(session, myType1Group.id, studentId, chatInput));
                                setChatInput("");
                              }}
                            >
                              Gửi
                            </button>
                          </div>
                        </article>
                      ) : null}
                      {session.type1Stage === "bidding" && myType1Group ? (
                        <article className="content-card" style={{ marginTop: 10, padding: 12 }}>
                          <h3>{selectedLeftBidTopic || "Chọn chủ đề bên trái"}</h3>
                          <p style={{ marginTop: 8 }}>
                            {selectedLeftBidTopic
                              ? materialsMap[selectedLeftBidTopic]?.description?.trim() || "Chưa có nội dung chi tiết."
                              : "Hãy chọn 1 chủ đề ở cột bên trái để xem chi tiết."}
                          </p>
                          {selectedLeftBidTopic && materialsMap[selectedLeftBidTopic]?.attachments?.[0]?.dataUrl ? (
                            <img
                              src={materialsMap[selectedLeftBidTopic]?.attachments?.[0]?.dataUrl}
                              alt={materialsMap[selectedLeftBidTopic]?.attachments?.[0]?.name || selectedLeftBidTopic}
                              style={{ width: "100%", borderRadius: 10, marginTop: 10 }}
                            />
                          ) : null}
                          {selectedLeftBidTopic && materialsMap[selectedLeftBidTopic]?.externalUrl ? (
                            <div style={{ marginTop: 8 }}>
                              {(() => {
                                const openUrl = normalizeExternalUrl(materialsMap[selectedLeftBidTopic]?.externalUrl || "");
                                if (!openUrl) return null;
                                return (
                                  <>
                                    <div className="group-action-row" style={{ marginTop: 6 }}>
                                      <a className="materials-text-action" href={openUrl} target="_blank" rel="noreferrer">
                                        Mở tab mới
                                      </a>
                                    </div>
                                  </>
                                );
                              })()}
                              <p className="hint-copy" style={{ marginTop: 4, fontSize: 13, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                                Link: {materialsMap[selectedLeftBidTopic]?.externalUrl}
                              </p>
                            </div>
                          ) : null}
                          {!hasWonTopic && selectedLeftBidTopic && myGroupLeaderId === studentId && !myRoundSubmitted ? (
                            <button
                              type="button"
                              className="hero-secondary"
                              style={{ marginTop: 10 }}
                              onClick={() => {
                                setBidTopicInput(selectedLeftBidTopic);
                                setBidModalPointsInput(myBidDraft?.topic === selectedLeftBidTopic ? String(myBidDraft.points) : "");
                                setBidModalError("");
                                setShowBidModal(true);
                              }}
                            >
                              Đấu giá cho chủ đề này
                            </button>
                          ) : null}
                          <p><strong>Vòng đấu giá:</strong> {session.biddingRound || 1}/5</p>
                          <p style={{ marginTop: 6 }}><strong>Điểm nhóm còn lại:</strong> {myRemainingPoints}</p>
                          {hasWonTopic ? (
                            <p className="hint-copy" style={{ marginTop: 8, color: "#0d6b2f", fontWeight: 700 }}>
                              Nhóm bạn đã thắng chủ đề <strong>{myFinalGroup?.topic}</strong>. Nhóm sẽ không đấu giá ở các vòng tiếp theo.
                            </p>
                          ) : myRoundSubmitted ? (
                            <p className="hint-copy" style={{ marginTop: 8, color: "#0d6b2f", fontWeight: 700 }}>
                              Nhóm bạn đã nộp quyết định cho vòng này.
                            </p>
                          ) : null}
                          {myBidDraft ? (
                            <p className="hint-copy" style={{ marginTop: 8 }}>
                              Quyết định hiện tại: <strong>{myBidDraft.topic}</strong> · đặt <strong>{myBidDraft.points}</strong> điểm.
                            </p>
                          ) : null}
                          {myBidDraft ? (
                            <div style={{ marginTop: 8 }}>
                              <strong>Trạng thái đồng ý thành viên:</strong>
                              <ul style={{ margin: "6px 0 0 18px", padding: 0, lineHeight: 1.6 }}>
                                {myType1Group.memberStudentIds.map((memberId) => {
                                  const memberName =
                                    session.students.find((student) => student.studentId === memberId)?.fullName || memberId;
                                  const approved = Boolean(myBidApprovals[memberId]);
                                  return (
                                    <li key={`bid-approval-${myType1Group.id}-${memberId}`}>
                                      {memberName}: {approved ? "Đã đồng ý" : "Chưa đồng ý"}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : null}

                          {myGroupLeaderId === studentId && !hasWonTopic && !myRoundSubmitted && myBidDraft && myBidAllApproved ? (
                            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                              <div className="group-action-row">
                                <button
                                  type="button"
                                  className="hero-primary"
                                  onClick={() => {
                                    if (!myBidDraft) return;
                                    const next = submitBid(session, myType1Group.id, myBidDraft.topic, myBidDraft.points);
                                    if (next.updatedAt === session.updatedAt) {
                                      setStatusMessage("Cần đủ đồng ý của toàn bộ thành viên trước khi nộp.");
                                      return;
                                    }
                                    setSession(next);
                                    setStatusMessage("Nhóm đã nộp quyết định cho vòng hiện tại.");
                                  }}
                                >
                                  Nộp quyết định
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {myGroupLeaderId !== studentId && !hasWonTopic && myBidDraft && !myRoundSubmitted ? (
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(myBidApprovals[studentId])}
                                onChange={(e) => setSession(setType1BidApproval(session, myType1Group.id, studentId, e.target.checked))}
                              />
                              <span style={{ fontWeight: 700, fontSize: 17 }}>Đồng ý quyết định của nhóm</span>
                            </label>
                          ) : null}

                          {session.type1Stage === "bidding" ? (
                            <p className="hint-copy" style={{ marginTop: 8 }}>
                              Chỉ nhóm trưởng mới tạo và nộp quyết định. Tất cả thành viên phải đồng ý trước khi nộp.
                            </p>
                          ) : null}
                        </article>
                      ) : null}
                      {!isType1Completed ? (
                        <>
                          <h4 style={{ marginTop: 14 }}>
                            {session.type1Stage === "group3"
                              ? "Yêu cầu vẫy tay nhận được (TV3)"
                              : session.type1Stage === "bidding"
                                ? "Trạng thái nộp quyết định"
                                : "Yêu cầu vẫy tay nhận được"}
                          </h4>
                          {session.type1Stage === "bidding" ? (
                            <p className="hint-copy" style={{ marginTop: 6 }}>
                              Đã nộp:{" "}
                              <strong>
                                {(session.bidRecords || []).filter((bid) => bid.round === (session.biddingRound || 1)).length}
                              </strong>{" "}
                              / {Math.max(0, (session.workingGroups || []).length - (session.finalGroups || []).length)} nhóm.
                            </p>
                          ) : (
                            session.type1Stage === "group3" && myType1Group ? myGroup3IncomingRequests.length : type1IncomingRequests.length
                          ) === 0 ? (
                            <p className="hint-copy" style={{ marginTop: 6 }}>Chưa có yêu cầu mới.</p>
                          ) : (
                            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                              {(session.type1Stage === "group3" && myType1Group ? myGroup3IncomingRequests : type1IncomingRequests).map((request) => {
                                const fromName =
                                  session.students.find((student) => student.studentId === request.fromStudentId)?.fullName || request.fromStudentId;
                                const requestLeaderId = myType1Group ? getType1GroupLeaderId(session, myType1Group.id) : studentId;
                                const decisionDraft =
                                  session.type1Stage === "group3" && myType1Group
                                    ? (session.waveRequests || []).find(
                                        (item) =>
                                          item.status === "draft_member3" &&
                                          item.fromStudentId === requestLeaderId &&
                                          item.toStudentId === request.fromStudentId
                                      ) || null
                                    : null;
                                const approvedCount =
                                  session.type1Stage === "group3" && myType1Group
                                    ? myType1Group.memberStudentIds.filter((id) => Boolean(decisionDraft?.approvalByStudentId?.[id])).length
                                    : 0;
                                const myApproved =
                                  session.type1Stage === "group3" && myType1Group ? Boolean(decisionDraft?.approvalByStudentId?.[studentId]) : false;
                                return (
                                  <article
                                    key={`${request.fromStudentId}-${request.toStudentId}-${request.createdAt}`}
                                    className="hero-secondary"
                                    style={{ textAlign: "left", display: "block", padding: "12px 14px" }}
                                  >
                                    <span style={{ fontWeight: 400 }}>{toDisplayName(fromName)}</span>
                                    <div className="group-action-row" style={{ marginTop: 8 }}>
                                      <button
                                        type="button"
                                        className="hero-primary"
                                        onClick={() =>
                                          (() => {
                                            if (session.type1Stage === "group3") {
                                              if (!myType1Group) {
                                                const next = respondGroup3Wave(session, request.fromStudentId, request.toStudentId, true);
                                                setSession(next);
                                                setStatusMessage("Đã đồng ý vào nhóm.");
                                                return;
                                              }
                                              if (myType1Group.memberStudentIds.length !== 2) return;
                                              const leaderId = getType1GroupLeaderId(session, myType1Group.id);
                                              let next = createGroup3AcceptDecisionDraft(session, leaderId, request.fromStudentId);
                                              next = approveGroup3InviteDraft(next, studentId, leaderId, request.fromStudentId, !myApproved);
                                              const draft = (next.waveRequests || []).find(
                                                (item) =>
                                                  item.status === "draft_member3" &&
                                                  item.fromStudentId === leaderId &&
                                                  item.toStudentId === request.fromStudentId
                                              );
                                              const allApproved = myType1Group.memberStudentIds.every((id) => Boolean(draft?.approvalByStudentId?.[id]));
                                              if (allApproved) {
                                                next = respondGroup3Wave(next, leaderId, request.fromStudentId, true);
                                                next = cancelGroup3InviteDraft(next, leaderId, request.fromStudentId);
                                                setStatusMessage("Đã đủ đồng ý 2/2. Sinh viên đã được thêm vào nhóm.");
                                              } else {
                                                const newCount = myType1Group.memberStudentIds.filter((id) => Boolean(draft?.approvalByStudentId?.[id])).length;
                                                setStatusMessage(`Đã cập nhật đồng ý ${newCount}/2. Chờ đủ 2/2 để xác nhận.`);
                                              }
                                              setSession(next);
                                              return;
                                            }
                                            const next = respondWave(session, studentId, request.fromStudentId, true);
                                            setSession(next);
                                          })()
                                        }
                                        disabled={false}
                                      >
                                        {session.type1Stage === "group3"
                                          ? myType1Group
                                            ? `Đồng ý ${approvedCount}/2`
                                            : "Đồng ý"
                                          : "Đồng ý"}
                                      </button>
                                      <button
                                        type="button"
                                        className="hero-secondary"
                                        onClick={() =>
                                          (() => {
                                            if (session.type1Stage === "group3") {
                                              if (!myType1Group) {
                                                const next = respondGroup3Wave(session, request.fromStudentId, request.toStudentId, false);
                                                setSession(next);
                                                setStatusMessage("Đã từ chối lời mời vào nhóm.");
                                                return;
                                              }
                                              if (myType1Group.memberStudentIds.length !== 2) return;
                                              const leaderId = getType1GroupLeaderId(session, myType1Group.id);
                                              const next = respondGroup3Wave(session, leaderId, request.fromStudentId, false);
                                              setSession(next);
                                              setStatusMessage("Đã từ chối yêu cầu mời thành viên thứ 3.");
                                              return;
                                            }
                                            const next = respondWave(session, studentId, request.fromStudentId, false);
                                            setSession(next);
                                          })()
                                        }
                                        disabled={false}
                                      >
                                        Từ chối
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </>
                      ) : null}
                    </article>

                    {!(session.type1Stage === "group3" && type1Group3Ended) ? (
                    <article className="content-card" style={{ padding: 16 }}>
                      <h3>
                        {isType1Completed
                          ? "Chủ đề cuối cùng của nhóm"
                          : session.type1Stage === "bidding"
                          ? "Chủ đề còn lại để đấu giá"
                          : session.type1Stage === "group3" && canLeaderInviteInGroup3
                            ? "Danh sách sinh viên còn lại trong lớp"
                          : session.type1Stage === "group3" && !myType1Group
                            ? "Danh sách nhóm 2 thành viên"
                            : "Danh sách sinh viên còn lại trong lớp"}
                      </h3>
                      <p className="hint-copy" style={{ marginTop: 6 }}>
                        {isType1Completed
                          ? "Nhóm bạn đã có chủ đề sau đấu giá. Đây là kết quả chính thức."
                          : session.type1Stage === "bidding"
                          ? "Các chủ đề đã có nhóm sẽ tự động biến mất ở vòng sau."
                          : session.type1Stage === "group3" && canLeaderInviteInGroup3
                            ? "Bạn là nhóm trưởng, hãy chọn 1 sinh viên còn lại để mời vào nhóm."
                          : session.type1Stage === "group3" && !myType1Group && group3PairGroups.length > 0
                            ? "Chọn 1 nhóm 2 thành viên để vẫy tay xin vào làm thành viên thứ 3."
                            : session.type1Stage === "group3"
                              ? ""
                              : "Nhấp vào tên SV bạn muốn ghép cặp để vẫy tay."}
                      </p>
                      {session.type1Stage === "group3" ? (
                        myType1Group ? (
                          <p className="hint-copy" style={{ marginTop: 6, color: "#c0192f", fontWeight: 700 }}>
                            {myGroupLeaderId === studentId
                              ? leaderGroup3Draft
                                ? "Đã có quyết định mời đang chờ xác thực nội bộ nhóm."
                                : disableGroup3RightPanel
                                  ? ""
                                  : "Bạn có thể mời 1 sinh viên còn lại vào nhóm."
                              : "Đang ở lượt mời thành viên thứ 3. Chỉ nhóm trưởng mới có quyền quyết định mời."}
                          </p>
                        ) : null
                      ) : null}
                      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                        {isType1Completed ? (
                          myFinalGroup ? (
                            <article className="hero-secondary" style={{ textAlign: "left", display: "block", padding: "12px 14px" }}>
                              <span style={{ fontWeight: 700, display: "block" }}>{myFinalGroup.topic}</span>
                              <p style={{ marginTop: 8 }}>
                                {materialsMap[myFinalGroup.topic]?.description?.trim() || "Chưa có nội dung chi tiết."}
                              </p>
                              {materialsMap[myFinalGroup.topic]?.attachments?.[0]?.dataUrl ? (
                                <img
                                  src={materialsMap[myFinalGroup.topic]?.attachments?.[0]?.dataUrl}
                                  alt={materialsMap[myFinalGroup.topic]?.attachments?.[0]?.name || myFinalGroup.topic}
                                  style={{ width: "100%", borderRadius: 10, marginTop: 10 }}
                                />
                              ) : null}
                              {materialsMap[myFinalGroup.topic]?.externalUrl ? (
                                <div style={{ marginTop: 8 }}>
                                  {(() => {
                                    const openUrl = normalizeExternalUrl(materialsMap[myFinalGroup.topic]?.externalUrl || "");
                                    const embedUrl = toEmbeddableUrl(openUrl);
                                    if (!openUrl) return null;
                                    return (
                                      <>
                                        <a className="materials-text-action" href={openUrl} target="_blank" rel="noreferrer">
                                          Mở tab mới
                                        </a>
                                        <iframe
                                          title={`Preview ${myFinalGroup.topic}`}
                                          src={embedUrl}
                                          className="materials-preview-frame"
                                          style={{ marginTop: 8, borderRadius: 10, minHeight: 280 }}
                                        />
                                      </>
                                    );
                                  })()}
                                  <p className="hint-copy" style={{ marginTop: 4, fontSize: 13, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                                    Link: {materialsMap[myFinalGroup.topic]?.externalUrl}
                                  </p>
                                </div>
                              ) : null}
                              <div style={{ marginTop: 10 }}>
                                <p className="hint-copy" style={{ marginTop: 6, fontSize: 14, fontWeight: 400 }}>
                                  {myType1PenaltyNote || "Vì bạn đã thắng 1 vòng đấu giá nên số điểm còn lại = số điểm trung bình của nhóm - số tiền bỏ ra đấu giá chủ đề."}
                                </p>
                                {myType1PenaltySummary ? (
                                  <p className="hint-copy" style={{ marginTop: 4, fontSize: 13, fontWeight: 400 }}>
                                    Điểm trước thuế: {myType1PenaltySummary.basePoints} ·
                                    Điểm bị trừ: {myType1PenaltySummary.deductedPoints} ·
                                    Điểm còn lại: {myType1PenaltySummary.finalPoints}
                                  </p>
                                ) : null}
                              </div>
                            </article>
                          ) : (
                            <p className="hint-copy">Đang cập nhật chủ đề cuối cùng của nhóm bạn.</p>
                          )
                        ) : null}
                        {isType1Completed ? null : session.type1Stage === "bidding" ? (
                          availableBidTopics.length === 0 ? (
                            <p className="hint-copy">Không còn chủ đề để đấu giá.</p>
                          ) : (
                            availableBidTopics.map((topic) => (
                              <article
                                key={`remaining-topic-${topic}`}
                                className={previewTopic === topic ? "hero-primary" : "hero-secondary"}
                                style={{ textAlign: "left", display: "block", padding: "12px 14px", cursor: "pointer" }}
                                onClick={() => setPreviewTopic((current) => (current === topic ? "" : topic))}
                              >
                                <span style={{ fontWeight: 700, display: "block" }}>{topic}</span>
                                {previewTopic === topic ? (
                                  <small style={{ display: "block", marginTop: 6 }}>
                                    {materialsMap[topic]?.description?.trim() || "Chưa có mô tả."}
                                  </small>
                                ) : null}
                                {previewTopic === topic && materialsMap[topic]?.externalUrl ? (
                                  <div style={{ marginTop: 6 }}>
                                    {(() => {
                                      const openUrl = normalizeExternalUrl(materialsMap[topic]?.externalUrl || "");
                                      const embedUrl = toEmbeddableUrl(openUrl);
                                      if (!openUrl) return null;
                                      return (
                                        <>
                                          <a
                                            className="materials-text-action"
                                            style={{ color: "#f4ea2a", fontWeight: 700 }}
                                            href={openUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(event) => event.stopPropagation()}
                                          >
                                            Mở tab mới
                                          </a>
                                          <iframe
                                            title={`Preview ${topic}`}
                                            src={embedUrl}
                                            className="materials-preview-frame"
                                            style={{ marginTop: 8, borderRadius: 10, minHeight: 280 }}
                                          />
                                          <p className="hint-copy" style={{ marginTop: 6, fontSize: 10, fontWeight: 400, color: "#d7d3e6", lineHeight: 1.4 }}>
                                            Nhấp vào khung trắng để link drive được hiển thị. Nếu vẫn không, vui lòng bấm Mở tab mới
                                          </p>
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : null}
                              </article>
                            ))
                          )
                        ) : session.type1Stage === "pairing" && !type1PairingOpen ? (
                          <p className="hint-copy" style={{ color: "#c0192f", fontWeight: 700 }}>
                            Phiên vẫy tay đã kết thúc. Nếu chưa có nhóm, vui lòng chờ GV bấm random.
                          </p>
                        ) : null}
                        {session.type1Stage === "group3" && disableGroup3RightPanel ? (
                          <p className="hint-copy">Vui lòng chờ các nhóm khác hoàn thành việc mời thêm thành viên...</p>
                        ) : session.type1Stage === "group3" && canLeaderInviteInGroup3 ? (
                          type1UnpairedOthers.length === 0 ? (
                            <p className="hint-copy">Không còn sinh viên khả dụng để mời.</p>
                          ) : (
                            type1UnpairedOthers.map((student) => {
                              const isPendingInvite = myGroupPendingInviteTargetId === student.studentId;
                              return (
                                <article
                                  key={`leader-invite-${student.studentId}`}
                                  className="hero-secondary"
                                  style={{
                                    textAlign: "left",
                                    display: "block",
                                    position: "relative",
                                    padding: "12px 14px",
                                    cursor: leaderGroup3Draft || isPendingInvite ? "default" : "pointer",
                                    opacity: leaderGroup3Draft ? 0.6 : 1,
                                    background: isPendingInvite ? "#3f0fa8" : undefined,
                                    color: isPendingInvite ? "#ffffff" : undefined
                                  }}
                                  onClick={() => {
                                    if (leaderGroup3Draft || isPendingInvite) return;
                                    const ok = window.confirm(`Tạo quyết định mời ${student.fullName} vào nhóm?`);
                                    if (!ok) return;
                                    setSession(inviteThirdMember(session, studentId, student.studentId));
                                    setStatusMessage("Đã tạo quyết định mời. Chờ đồng ý từ thành viên còn lại.");
                                  }}
                                >
                                  {isPendingInvite ? (
                                    <span style={{ position: "absolute", left: 10, top: 8, fontSize: 18 }} aria-label="Đã vẫy tay">
                                      🤚
                                    </span>
                                  ) : null}
                                  <span style={{ display: "block", paddingLeft: isPendingInvite ? 24 : 0, fontWeight: 400 }}>
                                    {toDisplayName(student.fullName)}
                                  </span>
                                  {isPendingInvite ? (
                                    <small style={{ display: "block", marginTop: 8, paddingLeft: 24, opacity: 0.95 }}>
                                      Đã vẫy tay sinh viên này
                                    </small>
                                  ) : null}
                                </article>
                              );
                            })
                          )
                        ) : session.type1Stage === "group3" && myType1Group ? (
                          type1UnpairedOthers.length === 0 ? (
                            <p className="hint-copy">Không còn sinh viên khả dụng để mời.</p>
                          ) : (
                            type1UnpairedOthers.map((student) => {
                              const isPendingInvite = myGroupPendingInviteTargetId === student.studentId;
                              return (
                                <article
                                  key={`member-view-invite-${student.studentId}`}
                                  className="hero-secondary"
                                  style={{
                                    textAlign: "left",
                                    display: "block",
                                    position: "relative",
                                    padding: "12px 14px",
                                    cursor: "default",
                                    background: isPendingInvite ? "#3f0fa8" : undefined,
                                    color: isPendingInvite ? "#ffffff" : undefined
                                  }}
                                >
                                  {isPendingInvite ? (
                                    <span style={{ position: "absolute", left: 10, top: 8, fontSize: 18 }} aria-label="Đã vẫy tay">
                                      🤚
                                    </span>
                                  ) : null}
                                  <span style={{ display: "block", paddingLeft: isPendingInvite ? 24 : 0, fontWeight: 400 }}>
                                    {toDisplayName(student.fullName)}
                                  </span>
                                  {isPendingInvite ? (
                                    <small style={{ display: "block", marginTop: 8, paddingLeft: 24, opacity: 0.95 }}>
                                      Nhóm trưởng đang vẫy tay với sinh viên này
                                    </small>
                                  ) : null}
                                </article>
                              );
                            })
                          )
                        ) : session.type1Stage === "group3" && !myType1Group ? (
                          type1Group3Ended ? (
                            <p className="hint-copy" style={{ color: "#c0192f", fontWeight: 700 }}>
                              Lượt mời thành viên thứ 3 đã kết thúc. Bạn chưa có nhóm, vui lòng chờ GV bấm random xếp nhóm.
                            </p>
                          ) : group3PairGroups.length === 0 ? (
                            <p className="hint-copy">Không còn nhóm 2 khả dụng.</p>
                          ) : (
                            group3PairGroups.map((group) => {
                              const leaderId = getType1GroupLeaderId(session, group.id);
                              const waved = myOutgoingWaves.has(leaderId);
                              const hasPendingWave = Boolean(myPendingGroup3LeaderId);
                              const canToggleThisCard = !hasPendingWave || waved;
                              return (
                                <article
                                  key={`group3-pair-${group.id}`}
                                  className="hero-secondary"
                                  style={{
                                    textAlign: "left",
                                    display: "block",
                                    padding: "12px 14px",
                                    cursor: canToggleThisCard ? "pointer" : "not-allowed",
                                    position: "relative",
                                    opacity: canToggleThisCard ? 1 : 0.6,
                                    background: waved ? "#3f0fa8" : undefined,
                                    color: waved ? "#ffffff" : undefined
                                  }}
                                  onClick={() => {
                                    if (session.type1Group3EndsAt && Date.now() >= session.type1Group3EndsAt) return;
                                    if (!canToggleThisCard) return;
                                    if (waved) {
                                      const ok = window.confirm(`Hủy vẫy tay với nhóm ${group.id}?`);
                                      if (!ok) return;
                                      setSession(cancelWave(session, studentId, leaderId));
                                      setStatusMessage("Đã hủy vẫy tay. Bạn có thể chọn nhóm khác.");
                                      return;
                                    }
                                    const ok = window.confirm(`Gửi vẫy tay đến nhóm ${group.id}?`);
                                    if (!ok) return;
                                    setSession(sendGroup3Wave(session, studentId, leaderId));
                                    setStatusMessage("Đã gửi vẫy tay. Các nhóm khác tạm khóa đến khi bạn hủy hoặc được phản hồi.");
                                  }}
                                >
                                  {waved ? (
                                    <span style={{ position: "absolute", left: 10, top: 8, fontSize: 18 }} aria-label="Đã vẫy tay">
                                      🤚
                                    </span>
                                  ) : null}
                                  <span style={{ fontWeight: 500, display: "block", paddingLeft: waved ? 24 : 0 }}>{group.memberNames.join(", ")}</span>
                                  {waved ? (
                                    <small style={{ display: "block", marginTop: 8 }}>Đã vẫy tay nhóm này - nhấn để hủy</small>
                                  ) : hasPendingWave ? (
                                    <small style={{ display: "block", marginTop: 8, opacity: 0.85 }}>
                                      Hãy hủy vẫy tay hiện tại trước khi chọn nhóm khác
                                    </small>
                                  ) : null}
                                </article>
                              );
                            })
                          )
                        ) : session.type1Stage === "bidding" ? null : type1UnpairedOthers.length === 0 ? null : (
                          type1UnpairedOthers.map((student) => {
                            const waved = myOutgoingWaves.has(student.studentId);
                            const hasPendingWave = Boolean(myPendingWaveTargetId);
                            const canToggleThisCard = !myType1Group && type1PairingOpen && (!hasPendingWave || waved);
                            return (
                              <article
                                key={student.studentId}
                                className="hero-secondary"
                                style={{
                                  textAlign: "left",
                                  display: "block",
                                  position: "relative",
                                  padding: "12px 14px",
                                  cursor: canToggleThisCard ? "pointer" : "not-allowed",
                                  opacity: canToggleThisCard ? 1 : 0.6,
                                  background: waved ? "#3f0fa8" : undefined,
                                  color: waved ? "#ffffff" : undefined
                                }}
                                onClick={() => {
                                  if (!canToggleThisCard) return;
                                  if (waved) {
                                    const ok = window.confirm(`Bỏ vẫy tay với ${student.fullName}?`);
                                    if (!ok) return;
                                    setSession(cancelWave(session, studentId, student.studentId));
                                    return;
                                  }
                                  const ok = window.confirm(`Gửi vẫy tay tới ${student.fullName}?`);
                                  if (!ok) return;
                                  setSession(sendWave(session, studentId, student.studentId));
                                }}
                              >
                                {waved ? (
                                  <span style={{ position: "absolute", left: 10, top: 8, fontSize: 18 }} aria-label="Đã vẫy tay">
                                    🤚
                                  </span>
                                ) : null}
                                <span style={{ display: "block", paddingLeft: waved ? 24 : 0, fontWeight: 500 }}>{student.fullName}</span>
                                {waved ? (
                                  <small style={{ display: "block", marginTop: 8, opacity: 0.95 }}>
                                    Đã vẫy tay - nhấn để bỏ vẫy tay
                                  </small>
                                ) : hasPendingWave ? (
                                  <small style={{ display: "block", marginTop: 8, opacity: 0.85 }}>
                                    Hãy bỏ vẫy tay hiện tại trước khi chọn người khác
                                  </small>
                                ) : null}
                              </article>
                            );
                          })
                        )}
                      </div>
                    </article>
                    ) : null}
                  </div>
                </article>
              ) : null}
            </>
          ) : (
            <article className="content-card" style={{ marginTop: 14 }}>
              <p style={{ fontSize: 28 }}>Xin chào, <strong>{selectedStudent?.fullName}</strong></p>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14, marginTop: 10 }}>
                <article className="content-card" style={{ padding: 12 }}>
                  {isFinalized ? (
                    <>
                      <h3>Kết quả sau vòng chọn chủ đề</h3>
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        {(session!.finalGroups || [])
                          .filter((group) => group.memberStudentIds.includes(studentId))
                          .map((group, index) => (
                            <article
                              key={`final-${group.id}-${group.topic}-${index}`}
                              className="hero-secondary"
                              style={{ textAlign: "left", display: "block", marginTop: 10, padding: "14px 16px" }}
                            >
                              <span style={{ display: "block", fontWeight: 700 }}>
                                {getGroupLabelByTopic(group.topic, index)} · {group.topic}
                              </span>
                              <ul style={{ margin: "10px 0 0 22px", padding: 0, lineHeight: 1.7 }}>
                                {group.memberNames.map((name) => (
                                  <li key={`${group.topic}-${name}`}>{name}</li>
                                ))}
                              </ul>
                            </article>
                          ))}
                      </div>
                    </>
                  ) : !joinedTopic ? (
                    <>
                      <h3>Danh sách chủ đề</h3>
                      <p className="hint-copy">Bấm 1 chủ đề để xem chi tiết bên phải.</p>
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        {selectableTopics.map((topic) => (
                          <button
                            key={topic}
                            type="button"
                            className="hero-secondary"
                            style={{ textAlign: "left", display: "block" }}
                            onClick={() => setPreviewTopic(topic)}
                          >
                            <span
                              style={{
                                display: "block",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                fontWeight: 700
                              }}
                            >
                              {topic}
                            </span>
                            <small style={{ display: "block", marginTop: 4, color: "#15112b", fontWeight: 400, lineHeight: 1.35 }}>
                                  {materialsMap[topic]?.description?.trim() || "Chưa có mô tả."}
                                </small>
                              </button>
                            ))}
                        {selectableTopics.length === 0 ? <p className="hint-copy">Không còn chủ đề khả dụng.</p> : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        {!joinedTopicLocked ? (
                          <button
                            type="button"
                            style={{ border: 0, background: "transparent", color: "#c0192f", fontWeight: 700, cursor: "pointer" }}
                            onClick={() => setSession(leaveTopic2Room(session!, studentId))}
                          >
                            Rời phòng
                          </button>
                        ) : <span style={{ color: "#c0192f", fontWeight: 700 }}>Phòng đã chốt</span>}
                        {canConfirmRoom && !session!.topic2FinalizedAt ? (
                          <button
                            type="button"
                            className="hero-primary"
                            style={{ background: "#c0192f" }}
                            onClick={() => setSession(lockTopic2Room(session!, joinedTopic))}
                          >
                            Chốt chọn
                          </button>
                        ) : null}
                      </div>
                      <h3 style={{ marginTop: 8 }}>Phòng riêng tư</h3>
                      <p className="hint-copy">Thành viên trong phòng:</p>
                      <small className="hint-copy" style={{ display: "block", marginTop: 6 }}>
                        Cùng nhau thống nhất chọn chủ đề này với số thành viên như trên.
                      </small>
                      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                        {roomMembers.map((m) => (
                          <label key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <span>{m.name}</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(roomAgreement[m.id])}
                                onChange={(e) => setSession(setTopic2RoomAgreement(session!, joinedTopic, m.id, e.target.checked))}
                                disabled={Boolean(session!.topic2FinalizedAt) || m.id !== studentId}
                              />
                              <small style={{ fontSize: 18 }}>Đồng ý</small>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div style={{ marginTop: 10, border: "1px solid #d9cfff", borderRadius: 10, padding: 10, minHeight: 120, maxHeight: 220, overflowY: "auto" }}>
                        {roomMessages.map((msg) => (
                          <p key={msg.id} style={{ margin: "0 0 8px", fontSize: 16 }}>
                            <strong>{msg.studentName}:</strong> {msg.text}
                          </p>
                        ))}
                        {roomMessages.length === 0 ? <p className="hint-copy">Chưa có tin nhắn.</p> : null}
                      </div>
                      {!session!.topic2FinalizedAt ? (
                        <div className="group-action-row" style={{ marginTop: 8 }}>
                          <input className="text-input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Nhắn trong phòng..." />
                          <button
                            type="button"
                            className="hero-primary"
                            onClick={() => {
                              if (!chatInput.trim()) return;
                              setSession(sendTopic2RoomMessage(session!, joinedTopic, studentId, chatInput));
                              setChatInput("");
                            }}
                          >
                            Gửi
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </article>

                <article className="content-card" style={{ padding: 12, position: "relative" }}>
                  <div style={{ position: "absolute", right: 12, top: 12, color: "#c0192f", fontSize: 22, fontWeight: 800 }}>
                    {session!.topic2FinalizedAt ? "Đã kết thúc" : formatCountdown(session!.topic2EndsAt)}
                  </div>
                  <h3 style={{ paddingRight: 140 }}>{currentTopic}</h3>
                  <p style={{ marginTop: 8 }}>{currentMaterial?.description?.trim() || "Chưa có nội dung chi tiết."}</p>
                  <p className="hint-copy" style={{ marginTop: 6 }}>
                    Thành viên trong phòng: <strong>{session!.topic2RoomMembers?.[currentTopic]?.length || 0}</strong>/3
                  </p>
                  {currentMaterial?.attachments?.[0]?.dataUrl ? (
                    <img src={currentMaterial.attachments[0].dataUrl} alt={currentMaterial.attachments[0].name} style={{ width: "100%", borderRadius: 10, marginTop: 10 }} />
                  ) : null}
                  {currentMaterial?.externalUrl ? (
                    <div style={{ marginTop: 8 }}>
                      {(() => {
                        const openUrl = normalizeExternalUrl(currentMaterial.externalUrl || "");
                        const embedUrl = toEmbeddableUrl(openUrl);
                        if (!openUrl) return null;
                        return (
                          <>
                            <a className="materials-text-action" style={{ color: "#f4ea2a", fontWeight: 700 }} href={openUrl} target="_blank" rel="noreferrer">
                              Mở tab mới
                            </a>
                            <iframe
                              title={`Preview ${currentTopic}`}
                              src={embedUrl}
                              className="materials-preview-frame"
                              style={{ marginTop: 8, borderRadius: 10, minHeight: 320 }}
                            />
                            <p className="hint-copy" style={{ marginTop: 6, fontSize: 10, fontWeight: 400, color: "#d7d3e6", lineHeight: 1.4 }}>
                              Nhấp vào khung trắng để link drive được hiển thị. Nếu vẫn không, vui lòng bấm Mở tab mới
                            </p>
                          </>
                        );
                      })()}
                      <p className="hint-copy" style={{ marginTop: 4, fontSize: 13, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                        Link: {currentMaterial.externalUrl}
                      </p>
                    </div>
                  ) : null}
                  {!joinedTopic && !isFinalized && currentTopic && !(session!.topic2LockedTopics || []).includes(currentTopic) ? (
                    <div className="group-action-row" style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="hero-primary"
                        disabled={(session!.topic2RoomMembers?.[currentTopic]?.length || 0) >= 3}
                        onClick={() => {
                          const next = joinTopic2Room(session!, studentId, currentTopic);
                          setSession(next);
                        }}
                      >
                        {(session!.topic2RoomMembers?.[currentTopic]?.length || 0) >= 3 ? "Phòng tạm khóa (đủ 3)" : "Vào phòng chủ đề này"}
                      </button>
                    </div>
                  ) : null}
                  {isFinalized ? (
                    <div style={{ marginTop: 12 }}>
                      <strong>Kết quả của bạn: </strong>
                      {session!.finalGroups.find((g) => g.memberStudentIds.includes(studentId))?.topic || "Đang cập nhật"}
                    </div>
                  ) : null}
                </article>
              </div>
            </article>
          )}

          {showBidModal ? (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(12, 8, 28, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 16
              }}
            >
              <article className="content-card" style={{ width: "100%", maxWidth: 520, padding: 16 }}>
                <h3>Đưa ra quyết định đấu giá</h3>
                <p className="hint-copy" style={{ marginTop: 8 }}>
                  Chủ đề: <strong>{bidTopicInput || previewTopic}</strong>
                </p>
                <label className="field" style={{ marginTop: 12 }}>
                  <span>Điểm đặt cược ({"<="} {myRemainingPoints})</span>
                  <input
                    className="text-input"
                    type="number"
                    min={1}
                    max={Math.max(1, myRemainingPoints)}
                    value={bidModalPointsInput}
                    onChange={(e) => setBidModalPointsInput(e.target.value)}
                  />
                </label>
                {bidModalError ? (
                  <p className="hint-copy" style={{ marginTop: 8, color: "#c0192f", fontWeight: 400, fontSize: 15 }}>
                    {bidModalError}
                  </p>
                ) : null}
                <div className="group-action-row" style={{ marginTop: 12 }}>
                  <button type="button" className="hero-secondary" onClick={() => { setShowBidModal(false); setBidModalError(""); }}>
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="hero-primary"
                    onClick={() => {
                      const topic = (bidTopicInput || previewTopic || "").trim();
                      const points = Math.round(Number(bidModalPointsInput) || 0);
                      if (!topic || points <= 0 || points > myRemainingPoints) {
                        setBidModalError("Giá đặt không hợp lệ. Vui lòng đặt mức giá nhỏ hơn số điểm nhóm còn lại.");
                        return;
                      }
                      setBidModalError("");
                      const next = saveType1BidDraft(session!, myType1Group!.id, studentId, topic, points);
                      setSession(next);
                      setBidPointsInput(String(points));
                      setShowBidModal(false);
                      setStatusMessage("Đã lưu quyết định, chờ các thành viên đồng ý.");
                    }}
                  >
                    Xác nhận quyết định
                  </button>
                </div>
              </article>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
