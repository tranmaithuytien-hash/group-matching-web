"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TeacherAuthGuard } from "../../../../../components/teacher-auth-guard";
import { getDemoSession } from "../../../../../lib/auth-storage";
import {
  appendSessionActionLog,
  countLoggedInStudents,
  countRound1Submitted,
  countRound2LeaderSubmitted,
  countRound2MemberSubmitted,
  countRound3Applications,
  countRound3CreatedRooms,
  formatRoundSummary,
  finalizeRound3AndOpenRound4,
  getCurrentRoundStatusLabel,
  getGroupMatchingSessionForOwner,
  getLeaderIds,
  getLoggedInStudentIds,
  getRound1VoteResults,
  getRound2LeaderSubmitterIds,
  getRound2MemberSubmitterIds,
  getRound3ApplicationSenderIds,
  getRound3CreatedRoomLeaderIds,
  getRoundControlOrder,
  publishLeadersAndOpenRound2,
  startRound2Matching,
  startRound4RandomFill,
  upsertGroupMatchingSession,
  type GroupMatchingSession,
  type GroupRoundKey
} from "../../../../../lib/group-matching";

type ActivityModalState = {
  open: boolean;
  title: string;
  subtitle: string;
  items: string[];
};

type ActionState = "idle" | "round1" | "publish" | "match" | "round3" | "round4" | "reset";

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

function buildDisplayRoundMap(session: GroupMatchingSession) {
  const order = getRoundControlOrder(session.roundsEnabled);
  const map = new Map<GroupRoundKey, number>();
  order.forEach((roundKey, index) => {
    map.set(roundKey, index + 1);
  });
  return map;
}

function getDisplayRoundLabel(
  session: GroupMatchingSession,
  roundKey: GroupRoundKey,
  displayMap: Map<GroupRoundKey, number>
) {
  const number = displayMap.get(roundKey);
  if (!number) {
    return getCurrentRoundStatusLabel(roundKey, session.roundsEnabled);
  }
  return `Vòng ${number}`;
}

function getCurrentRoundDisplayLabel(session: GroupMatchingSession, displayMap: Map<GroupRoundKey, number>) {
  if (session.currentRound === "waiting") {
    return "Phòng chờ";
  }
  if (session.currentRound === "completed") {
    return "Đã kết thúc";
  }
  const number = displayMap.get(session.currentRound as GroupRoundKey);
  if (number) {
    return `Vòng ${number}`;
  }
  return getCurrentRoundStatusLabel(session.currentRound, session.roundsEnabled);
}

function extractRound1VoterIds(session: GroupMatchingSession) {
  const participantIdSet = new Set(session.participants.map((participant) => participant.studentId));
  return Object.keys(session.round1Votes || {}).filter((studentId) => participantIdSet.has(studentId));
}

function buildRoundStatusNote(session: GroupMatchingSession, roundKey: "round2" | "round3" | "round4") {
  if (!session.roundsEnabled[roundKey]) {
    return "Vòng này đã tắt theo cấu hình phiên.";
  }

  if (session.currentRound === "completed") {
    return "Phiên đã hoàn tất.";
  }

  if (roundKey === "round2") {
    if (session.currentRound === "waiting" || session.currentRound === "round1") {
      return "Chưa bắt đầu Vòng 2.";
    }
    return "Đã mở hoặc đã đi qua Vòng 2.";
  }

  if (roundKey === "round3") {
    if (session.currentRound === "waiting" || session.currentRound === "round1" || session.currentRound === "round2") {
      return "Chưa bắt đầu Vòng 3.";
    }
    return "Đã mở hoặc đã đi qua Vòng 3.";
  }

  if (
    session.currentRound === "waiting" ||
    session.currentRound === "round1" ||
    session.currentRound === "round2" ||
    session.currentRound === "round3"
  ) {
    return "Chưa bắt đầu Vòng 4.";
  }
  return "Đã mở hoặc đã đi qua Vòng 4.";
}

export default function GroupMatchingSessionManagePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  const [session, setSession] = useState<GroupMatchingSession | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [modalState, setModalState] = useState<ActivityModalState>({
    open: false,
    title: "",
    subtitle: "",
    items: []
  });

  useEffect(() => {
    const refresh = () => {
      const currentSession = getDemoSession();
      const currentTeacherEmail = currentSession?.role === "teacher" ? currentSession.email : "";
      if (!sessionId || !currentTeacherEmail) {
        setSession(null);
        return;
      }
      setSession(getGroupMatchingSessionForOwner(sessionId, currentTeacherEmail));
    };

    refresh();
    const intervalId = window.setInterval(refresh, 1000);
    window.addEventListener("storage", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", refresh);
    };
  }, [sessionId]);

  const participantById = useMemo(() => {
    if (!session) {
      return new Map<string, string>();
    }
    return new Map(session.participants.map((participant) => [participant.studentId, participant.fullName]));
  }, [session]);

  const displayRoundMap = useMemo(() => {
    if (!session) {
      return new Map<GroupRoundKey, number>();
    }
    return buildDisplayRoundMap(session);
  }, [session]);

  const stats = useMemo(() => {
    if (!session) {
      return null;
    }

    const participantCount = session.participants.length;
    const leaderIds = getLeaderIds(session);
    const leaderCount = leaderIds.length;
    const memberCount = Math.max(participantCount - leaderCount, 0);

    const loggedInIds = getLoggedInStudentIds(session);
    const round1VoterIds = extractRound1VoterIds(session);
    const round2MemberIds = getRound2MemberSubmitterIds(session);
    const round2LeaderIds = getRound2LeaderSubmitterIds(session);
    const round3RoomLeaderIds = getRound3CreatedRoomLeaderIds(session);
    const round3SenderIds = getRound3ApplicationSenderIds(session);

    return {
      participantCount,
      leaderCount,
      memberCount,
      loggedInIds,
      round1VoterIds,
      round2MemberIds,
      round2LeaderIds,
      round3RoomLeaderIds,
      round3SenderIds,
      loggedInCount: countLoggedInStudents(session),
      round1SubmittedCount: countRound1Submitted(session),
      round2MemberCount: countRound2MemberSubmitted(session),
      round2LeaderCount: countRound2LeaderSubmitted(session),
      round3RoomCount: countRound3CreatedRooms(session),
      round3ApplicationCount: countRound3Applications(session)
    };
  }, [session]);

  const getNames = (studentIds: string[]) => {
    return studentIds
      .map((studentId) => participantById.get(studentId) || "")
      .filter(Boolean)
      .sort((nameA, nameB) => nameA.localeCompare(nameB, "vi"));
  };

  const openActivityModal = (title: string, subtitle: string, studentIds: string[]) => {
    const items = getNames(studentIds);
    setModalState({
      open: true,
      title,
      subtitle,
      items
    });
  };

  const applyActionLog = (updatedSession: GroupMatchingSession | null, action: string, detail = "") => {
    if (!updatedSession) {
      return null;
    }
    const withLog = appendSessionActionLog(updatedSession.id, action, detail);
    if (withLog) {
      setSession(withLog);
      return withLog;
    }
    setSession(updatedSession);
    return updatedSession;
  };

  const handleOpenRound1 = async () => {
    if (!session) {
      return;
    }
    if (session.currentRound !== "waiting") {
      setStatusMessage("Phiên này đã rời Phòng chờ.");
      return;
    }

    setActionState("round1");
    setStatusMessage("");
    const now = Date.now();
    const nextSession: GroupMatchingSession = {
      ...session,
      currentRound: "round1",
      startedAt: session.startedAt || now,
      roundOpenedAt: {
        ...(session.roundOpenedAt || {}),
        round1: now
      },
      updatedAt: now
    };
    const updated = upsertGroupMatchingSession(nextSession);
    if (!updated) {
      setStatusMessage("Không thể mở Vòng 1 lúc này. Vui lòng thử lại.");
      setActionState("idle");
      return;
    }
    applyActionLog(updated, "Mở Vòng 1", `${session.className} · ${session.classCode}`);
    setStatusMessage("Đã mở Vòng 1.");
    setActionState("idle");
  };

  const handlePublishAndOpenNextRound = async () => {
    if (!session) {
      return;
    }
    setActionState("publish");
    setStatusMessage("");
    const updated = publishLeadersAndOpenRound2(session.id);
    if (!updated) {
      setStatusMessage("Không thể công bố Nhóm trưởng lúc này. Cần có dữ liệu bình chọn Vòng 1.");
      setActionState("idle");
      return;
    }
    applyActionLog(
      updated,
      "Công bố Nhóm trưởng",
      `Mở ${getCurrentRoundStatusLabel(updated.currentRound, updated.roundsEnabled)}`
    );
    setStatusMessage(`Đã công bố Nhóm trưởng và mở ${getCurrentRoundStatusLabel(updated.currentRound, updated.roundsEnabled)}.`);
    setActionState("idle");
  };

  const handleStartRound2Matching = async () => {
    if (!session) {
      return;
    }
    setActionState("match");
    setStatusMessage("");
    const updated = startRound2Matching(session.id);
    if (!updated) {
      setStatusMessage("Không thể chạy matching lúc này.");
      setActionState("idle");
      return;
    }
    applyActionLog(updated, "Bắt đầu matching Vòng 2", `Đã tạo ${(updated.matchingResults || []).length} nhóm tạm`);
    setStatusMessage("Đã chạy matching thành công.");
    setActionState("idle");
  };

  const handleFinalizeRound3 = async () => {
    if (!session) {
      return;
    }
    setActionState("round3");
    setStatusMessage("");
    const updated = finalizeRound3AndOpenRound4(session.id);
    if (!updated) {
      setStatusMessage("Không thể chốt Vòng hiện tại lúc này.");
      setActionState("idle");
      return;
    }
    applyActionLog(updated, "Kết thúc Vòng 3", "Đã chốt kết quả thư và chuyển sang random fill");
    setStatusMessage("Đã kết thúc vòng gửi thư và chuyển sang vòng random fill.");
    setActionState("idle");
  };

  const handleStartRound4RandomFill = async () => {
    if (!session) {
      return;
    }
    setActionState("round4");
    setStatusMessage("");
    const updated = startRound4RandomFill(session.id);
    if (!updated) {
      setStatusMessage("Không thể bắt đầu random fill lúc này.");
      setActionState("idle");
      return;
    }
    applyActionLog(updated, "Bắt đầu random fill", "Đã chốt kết quả cuối cùng của game");
    setStatusMessage("Đã hoàn tất random fill và kết thúc game.");
    setActionState("idle");
  };

  const handleResetGame = async () => {
    if (!session) {
      return;
    }
    const confirmed = window.confirm(
      "Reset s� x�a to�n b� d� li�u c�c v�ng v� m�t kh�u sinh vi�n c�a phi�n n�y. B�n ch�c ch�n mu�n ti�p t�c?"
    );
    if (!confirmed) {
      return;
    }

    setActionState("reset");
    setStatusMessage("");
    const now = Date.now();
    const resetSession: GroupMatchingSession = {
      ...session,
      round1Votes: {},
      loggedInStudentIds: [],
      studentCredentials: {},
      participantRoles: {},
      topLeaders: [],
      leadersVisible: false,
      round2MemberPreferences: {},
      round2LeaderRankings: {},
      round2Matched: false,
      matchingResults: [],
      round3Rooms: {},
      round3Applications: {},
      round3Results: [],
      round3UnmatchedStudentIds: [],
      finalGroups: [],
      roundOpenedAt: {},
      startedAt: undefined,
      currentRound: "waiting",
      updatedAt: now
    };

    const updated = upsertGroupMatchingSession(resetSession);
    if (!updated) {
      setStatusMessage("Không thể reset phiên lúc này.");
      setActionState("idle");
      return;
    }
    applyActionLog(updated, "Reset game", "X�a dữ liệu c�c v�ng, đưa phi�n về Ph�ng chờ");
    setStatusMessage("Đã reset toàn bộ dữ liệu phiên.");
    setActionState("idle");
  };

  if (!session || !stats) {
    return (
      <TeacherAuthGuard>
        <main className="section-page">
          <div className="site-shell group-shell">
            <article className="content-card">
              <h2>Không tìm thấy phiên</h2>
              <p>Phiên này không tồn tại hoặc không thuộc tài khoản Giảng viên hiện tại.</p>
              <Link href="/features/group-matching/manage" className="hero-secondary inline-cta">
                Về trang quản lý
              </Link>
            </article>
          </div>
        </main>
      </TeacherAuthGuard>
    );
  }

  const currentRoundLabel = getCurrentRoundDisplayLabel(session, displayRoundMap);
  const updateLabel = formatTimeLabel(session.updatedAt);
  const publishTargetRound: GroupRoundKey = session.roundsEnabled.round2
    ? "round2"
    : session.roundsEnabled.round3
      ? "round3"
      : "round4";
  const round4DisplayLabel = getDisplayRoundLabel(session, "round4", displayRoundMap);
  const round3DisplayLabel = getDisplayRoundLabel(session, "round3", displayRoundMap);
  const round2DisplayLabel = getDisplayRoundLabel(session, "round2", displayRoundMap);
  const round1Results = getRound1VoteResults(session);

  return (
    <TeacherAuthGuard>
      <main className="section-page">
        <div className="site-shell group-shell">
          <div className="section-head section-head-single">
            <div>
              <span className="section-eyebrow">Điều khiển phiên chia nhóm</span>
              <h1>{session.className}</h1>
            </div>
            <p>
              Class code: <strong>{session.classCode}</strong> � Trạng th�i hiện tại: <strong>{currentRoundLabel}</strong>
              {updateLabel ? (
                <>
                  {" "}
                  · Cập nhật: <strong>{updateLabel}</strong>
                </>
              ) : null}
            </p>
          </div>

          <div className="group-action-row">
            <Link href="/features/group-matching/manage" className="hero-secondary">
              Về danh s�ch phi�n
            </Link>
            <Link href={`/features/group-matching/manage/${session.id}/view`} className="hero-secondary">
              Xem
            </Link>
          </div>

          <div className="group-control-layout" style={{ marginTop: 14 }}>
            <div className="group-control-status-stack">
              <div className="group-control-metrics">
                <button
                  type="button"
                  className="status-box group-clickable-stat"
                  onClick={() =>
                    openActivityModal(
                      "Danh s�ch SV đ� đăng nhập",
                      `${stats.loggedInCount}/${stats.participantCount} sinh viên`,
                      stats.loggedInIds
                    )
                  }
                  disabled={stats.loggedInCount <= 0}
                >
                  <p className="status-label">Số SV đăng nhập</p>
                  <p className="status-value">
                    {stats.loggedInCount}/{stats.participantCount}
                  </p>
                </button>

                <button
                  type="button"
                  className="status-box group-clickable-stat"
                  onClick={() =>
                    openActivityModal(
                      "Danh s�ch SV đ� vote R1",
                      `${stats.round1SubmittedCount}/${stats.participantCount} sinh viên`,
                      stats.round1VoterIds
                    )
                  }
                  disabled={stats.round1SubmittedCount <= 0}
                >
                  <p className="status-label">Đã vote R1</p>
                  <p className="status-value">
                    {stats.round1SubmittedCount}/{stats.participantCount}
                  </p>
                </button>

                {session.roundsEnabled.round2 ? (
                  <button
                    type="button"
                    className="status-box group-clickable-stat"
                    onClick={() =>
                      openActivityModal(
                        "Danh s�ch Th�nh vi�n đ� gửi R2",
                        `${stats.round2MemberCount}/${stats.memberCount} thành viên`,
                        stats.round2MemberIds
                      )
                    }
                    disabled={stats.round2MemberCount <= 0}
                  >
                    <p className="status-label">Thành viên đã gửi R2</p>
                    <p className="status-value">
                      {stats.round2MemberCount}/{stats.memberCount}
                    </p>
                  </button>
                ) : null}

                {session.roundsEnabled.round2 ? (
                  <button
                    type="button"
                    className="status-box group-clickable-stat"
                    onClick={() =>
                      openActivityModal(
                        "Danh s�ch Nh�m trưởng đ� gửi R2",
                        `${stats.round2LeaderCount}/${stats.leaderCount} nhóm trưởng`,
                        stats.round2LeaderIds
                      )
                    }
                    disabled={stats.round2LeaderCount <= 0}
                  >
                    <p className="status-label">Nhóm trưởng đã gửi R2</p>
                    <p className="status-value">
                      {stats.round2LeaderCount}/{stats.leaderCount}
                    </p>
                  </button>
                ) : null}

                {session.roundsEnabled.round3 ? (
                  <button
                    type="button"
                    className="status-box group-clickable-stat"
                    onClick={() =>
                      openActivityModal(
                        "Danh s�ch Nh�m trưởng đ� tạo ph�ng R3",
                        `${stats.round3RoomCount}/${stats.leaderCount} nhóm`,
                        stats.round3RoomLeaderIds
                      )
                    }
                    disabled={stats.round3RoomCount <= 0}
                  >
                    <p className="status-label">Tạo phòng R3</p>
                    <p className="status-value">
                      {stats.round3RoomCount}/{stats.leaderCount}
                    </p>
                  </button>
                ) : null}

                {session.roundsEnabled.round3 ? (
                  <button
                    type="button"
                    className="status-box group-clickable-stat"
                    onClick={() =>
                      openActivityModal(
                        "Danh s�ch Sinh vi�n đ� gửi thư R3",
                        `${stats.round3ApplicationCount} thư`,
                        stats.round3SenderIds
                      )
                    }
                    disabled={stats.round3ApplicationCount <= 0}
                  >
                    <p className="status-label">Thư đã gửi R3</p>
                    <p className="status-value">{stats.round3ApplicationCount}</p>
                  </button>
                ) : null}
              </div>

              <article className="content-card group-control-results-card">
                <h2>Kết quả c�c v�ng</h2>

                <details open className="group-result-block">
                  <summary>
                    <strong>Vòng 1 - Bầu chọn Nhóm trưởng</strong>
                  </summary>
                  <p className="hint-copy" style={{ marginTop: 10 }}>
                    Đã nhận phiếu: {countRound1Submitted(session)}/{session.participants.length}
                  </p>
                  {round1Results.length > 0 ? (
                    <div className="group-round1-result-list">
                      {round1Results.map((item) => (
                        <div
                          key={item.studentId}
                          className={item.isLeader ? "group-round1-result leader" : "group-round1-result"}
                        >
                          <span>{item.fullName}</span>
                          <small>
                            {item.voteCount} phiếu · Hạng {item.ranking}
                            {item.isLeader ? " � Nh�m tr��ng" : ""}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hint-copy">Chưa có dữ liệu Vòng 1.</p>
                  )}
                </details>

                {session.roundsEnabled.round2 ? (
                  <details className="group-result-block">
                    <summary>
                      <strong>{round2DisplayLabel} - Matching</strong>
                    </summary>
                    <p className="hint-copy" style={{ marginTop: 10 }}>
                      {buildRoundStatusNote(session, "round2")} · Thành viên đã gửi: {countRound2MemberSubmitted(session)}/
                      {Math.max(session.participants.length - getLeaderIds(session).length, 0)} · Nhóm trưởng đã gửi:{" "}
                      {countRound2LeaderSubmitted(session)}/{getLeaderIds(session).length}
                    </p>
                    {(session.matchingResults || []).length > 0 ? (
                      <div className="group-round1-result-list">
                        {(session.matchingResults || []).map((group) => (
                          <div key={group.leaderStudentId} className="group-round1-result">
                            <span>
                              {group.leaderFullName} · {group.memberStudentIds.length}/{group.capacity} thành viên
                            </span>
                            <small>
                              {(group.memberFullNames || []).length > 0
                                ? group.memberFullNames.join(", ")
                                : "Bạn chưa có bất kì thành viên nào"}
                            </small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="hint-copy">Chưa có kết quả matching.</p>
                    )}
                  </details>
                ) : null}

                {session.roundsEnabled.round3 ? (
                  <details className="group-result-block">
                    <summary>
                      <strong>{round3DisplayLabel} - Thư xin gia nhập</strong>
                    </summary>
                    <p className="hint-copy" style={{ marginTop: 10 }}>
                      {buildRoundStatusNote(session, "round3")} · Tạo phòng: {countRound3CreatedRooms(session)}/
                      {getLeaderIds(session).length} · Thư đã gửi: {countRound3Applications(session)}
                    </p>
                    {(session.round3Results || []).length > 0 ? (
                      <div className="group-round1-result-list">
                        {(session.round3Results || []).map((group) => (
                          <div key={group.leaderStudentId} className="group-round1-result">
                            <span>
                              {group.roomName || "Chưa đặt tên"} · {group.memberStudentIds.length}/{group.capacity} thành viên
                            </span>
                            <small>{(group.memberFullNames || []).join(", ") || "Chưa có thành viên"}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="hint-copy">Chưa có kết quả vòng gửi thư.</p>
                    )}
                  </details>
                ) : null}

                <details className="group-result-block">
                  <summary>
                    <strong>{round4DisplayLabel} - Random fill</strong>
                  </summary>
                  <p className="hint-copy" style={{ marginTop: 10 }}>
                    {buildRoundStatusNote(session, "round4")} · Luồng bật vòng: {formatRoundSummary(session.roundsEnabled)}
                  </p>
                  {(session.finalGroups || []).length > 0 ? (
                    <div className="group-round1-result-list">
                      {(session.finalGroups || []).map((group) => (
                        <div key={group.leaderStudentId} className="group-round1-result leader">
                          <span>
                            {group.roomName || group.leaderFullName} · {group.memberStudentIds.length}/{group.capacity} thành viên
                          </span>
                          <small>{(group.memberFullNames || []).join(", ") || "Chưa có thành viên"}</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hint-copy">Chưa có kết quả random fill.</p>
                  )}
                </details>
              </article>
            </div>

            <article className="content-card group-control-actions-card">
              <h2>Điều khiển</h2>
              <div className="group-control-buttons">
                <button
                  type="button"
                  className="primary-button group-control-button group-control-open-round1"
                  onClick={() => void handleOpenRound1()}
                  disabled={actionState !== "idle" || session.currentRound !== "waiting"}
                >
                  {actionState === "round1" ? "ang m� V�ng 1..." : "M� V�ng 1"}
                </button>

                <button
                  type="button"
                  className="secondary-button teacher-button-soft group-control-button"
                  onClick={() => void handlePublishAndOpenNextRound()}
                  disabled={actionState !== "idle" || (session.currentRound !== "round1" && session.currentRound !== "waiting")}
                >
                  {actionState === "publish"
                    ? "ang c�ng b� k�t qu�..."
                    : `Công bố Nhóm trưởng và mở ${getDisplayRoundLabel(session, publishTargetRound, displayRoundMap)}`}
                </button>

                {session.roundsEnabled.round2 ? (
                  <button
                    type="button"
                    className="secondary-button teacher-button-soft group-control-button"
                    onClick={() => void handleStartRound2Matching()}
                    disabled={actionState !== "idle" || session.currentRound !== "round2" || Boolean(session.round2Matched)}
                  >
                    {actionState === "match"
                      ? "ang matching..."
                      : `Bắt đầu matching ${getDisplayRoundLabel(session, "round2", displayRoundMap)}`}
                  </button>
                ) : null}

                {session.roundsEnabled.round3 ? (
                  <button
                    type="button"
                    className="secondary-button teacher-button-soft group-control-button"
                    onClick={() => void handleFinalizeRound3()}
                    disabled={actionState !== "idle" || session.currentRound !== "round3"}
                  >
                    {actionState === "round3"
                      ? "ang ch�t v�ng..."
                      : `Kết thúc ${round3DisplayLabel} và mở ${round4DisplayLabel}`}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="secondary-button teacher-button-soft group-control-button"
                  onClick={() => void handleStartRound4RandomFill()}
                  disabled={actionState !== "idle" || session.currentRound !== "round4"}
                >
                  {actionState === "round4" ? "ang random fill..." : `B�t �u random fill (${round4DisplayLabel})`}
                </button>

                <button
                  type="button"
                  className="primary-button danger-button group-control-button"
                  onClick={() => void handleResetGame()}
                  disabled={actionState !== "idle"}
                >
                  {actionState === "reset" ? "ang reset game..." : "Reset game"}
                </button>
              </div>
            </article>
          </div>

          {statusMessage ? <p className="group-status-note">{statusMessage}</p> : null}
        </div>

        {modalState.open ? (
          <div className="group-modal-overlay" role="dialog" aria-modal="true" onClick={() => setModalState((current) => ({ ...current, open: false }))}>
            <div className="group-modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="group-modal-head">
                <div>
                  <h3>{modalState.title}</h3>
                  <p>{modalState.subtitle}</p>
                </div>
                <button type="button" className="hero-secondary group-inline-action" onClick={() => setModalState((current) => ({ ...current, open: false }))}>
                  Đóng
                </button>
              </div>
              <div className="group-modal-list">
                {modalState.items.length > 0 ? (
                  modalState.items.map((item, index) => (
                    <div key={`${item}-${index}`} className="group-modal-item">
                      {index + 1}. {item}
                    </div>
                  ))
                ) : (
                  <p className="hint-copy">Chưa có dữ liệu.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </TeacherAuthGuard>
  );
}
