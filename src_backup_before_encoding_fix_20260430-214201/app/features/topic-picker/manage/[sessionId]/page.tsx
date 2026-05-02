"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TeacherAuthGuard } from "../../../../../components/teacher-auth-guard";
import {
  closeType1Group3Phase,
  finalizeType1BiddingWithRandom,
  finalizeTopic2Selection,
  getTopicSessionByRouteKey,
  randomFillType1,
  rejectOverflowType1Group3Requests,
  resolveBiddingRound,
  resetTopicSessionById,
  shouldResolveType1Bidding,
  runRandomFullAssignment,
  startBiddingType1,
  startTopicSession,
  teacherMoveType1ToGroup3,
  upsertTopicSession,
  type TopicSession
} from "../../../../../lib/topic-picker";

function toStatusLabel(status: TopicSession["status"]) {
  switch (status) {
    case "preparing":
      return "Chuẩn bị";
    case "running":
      return "Đang diễn ra";
    case "completed":
      return "Đã kết thúc";
    default:
      return status;
  }
}

function toType1StageLabel(stage?: TopicSession["type1Stage"]) {
  switch (stage) {
    case "pairing":
      return "Ghép cặp";
    case "group3":
      return "Mời thành viên thứ 3";
    case "bidding":
      return "Đấu gi�";
    case "completed":
      return "Hoàn tất";
    default:
      return "Chưa bắt đầu";
  }
}

function getGroupLabelByTopic(topic: string, fallbackIndex = 0) {
  const match = topic.match(/\d+/);
  const number = match ? Number(match[0]) : fallbackIndex + 1;
  return `Nhóm ${number}`;
}

function getType1GroupDisplayLabel(groupId: string, fallbackIndex = 0) {
  const match = groupId.match(/\d+/);
  const number = match ? Number(match[0]) : fallbackIndex + 1;
  return `Nhóm ${number}`;
}

function computeInitialType1Points(session: TopicSession, groupId: string) {
  const group = (session.workingGroups || []).find((item) => item.id === groupId);
  if (!group) return 0;
  const scores = group.memberStudentIds.map((id) => session.students.find((s) => s.studentId === id)?.scoreValue || 0);
  if (scores.length === 0) return 0;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10);
}

export default function TopicPickerManageDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = Array.isArray(params?.sessionId) ? params.sessionId[0] : params?.sessionId || "";
  const [session, setSession] = useState<TopicSession | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());

  const refresh = () => {
    if (!sessionId) return;
    const next = getTopicSessionByRouteKey(sessionId);
    setSession((prev) => {
      if (!prev && !next) return prev;
      if (!prev || !next) return next;
      const sameVersion = (prev.stateVersion || 0) === (next.stateVersion || 0);
      const sameUpdatedAt = (prev.updatedAt || 0) === (next.updatedAt || 0);
      return sameVersion && sameUpdatedAt ? prev : next;
    });
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    if (!session || !session.classCode) return;
    const codePath = `/features/topic-picker/manage/${session.classCode}`;
    if (sessionId.toUpperCase() !== session.classCode.toUpperCase()) {
      router.replace(codePath);
    }
  }, [session, sessionId, router]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session || session.type !== 2 || session.status !== "running") return;
    if (!session.topic2EndsAt || session.topic2FinalizedAt) return;
    if (Date.now() < session.topic2EndsAt) return;
    finalizeTopic2Selection(session, "Hết thời gian đếm ngược");
    refresh();
    setStatusMessage("Đã tự động kết thúc chọn phòng do hết giờ.");
  }, [session]);

  useEffect(() => {
    if (!session || session.type !== 1 || session.status !== "running") return;
    if (session.type1Stage === "bidding" && shouldResolveType1Bidding(session)) {
      const next = resolveBiddingRound(session);
      setSession(next);
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
        setStatusMessage("Hết thời gian ghép cặp. Đã tự động chuyển sang lượt mời thành viên thứ 3.");
      }
      return;
    }
    const closedGroup3 = closeType1Group3Phase(session);
    if (closedGroup3.id !== session.id || closedGroup3.updatedAt !== session.updatedAt) {
      setSession(closedGroup3);
      setStatusMessage("Hết giờ lượt nhóm 3 TV. Hệ thống đã tự random SV còn lại.");
      return;
    }
    const normalized = rejectOverflowType1Group3Requests(session);
    if (normalized.id !== session.id || normalized.updatedAt !== session.updatedAt) {
      setSession(normalized);
      return;
    }
  }, [session]);

  const ungrouped = useMemo(() => {
    if (!session) return [];
    const grouped =
      session.type === 2
        ? new Set(
            session.status === "completed"
              ? (session.finalGroups || []).flatMap((group) => group.memberStudentIds)
              : Object.values(session.topic2RoomMembers || {}).flatMap((ids) => ids)
          )
        : new Set((session.workingGroups || []).flatMap((group) => group.memberStudentIds));
    return session.students.filter((student) => !grouped.has(student.studentId));
  }, [session]);

  const groupedCount = useMemo(() => {
    if (!session) return 0;
    const grouped =
      session.type === 2
        ? new Set(
            session.status === "completed"
              ? (session.finalGroups || []).flatMap((group) => group.memberStudentIds)
              : Object.values(session.topic2RoomMembers || {}).flatMap((ids) => ids)
          )
        : new Set((session.workingGroups || []).flatMap((group) => group.memberStudentIds));
    return grouped.size;
  }, [session]);

  const loggedInCount = useMemo(() => {
    if (!session) return 0;
    const validStudentIds = new Set(session.students.map((s) => s.studentId));
    return Object.keys(session.credentialsByStudentId || {}).filter((id) => validStudentIds.has(id)).length;
  }, [session]);

  const runAction = (action: () => TopicSession | null, successText: string, failedText: string) => {
    const next = action();
    if (!next) {
      setStatusMessage(failedText);
      return;
    }
    setStatusMessage(successText);
    refresh();
  };

  const handleResetSession = () => {
    if (!session) return;
    const ok = window.confirm(
      "Reset s� �a phi�n n�y v� tr�ng th�i ban �u, x�a to�n b� d� li�u l��t ch�i ci v� x�a ng nh�p sinh vi�n c�a phi�n. Ti�p t�c?"
    );
    if (!ok) return;
    const next = resetTopicSessionById(session.id);
    if (!next) {
      setStatusMessage("Không thể reset phiên lúc này.");
      return;
    }
    setStatusMessage("Đã reset phiên về game mới hoàn toàn.");
    refresh();
  };

  const formatCountdown = (endsAt?: number) => {
    if (!endsAt) return "--:--";
    const remainMs = Math.max(0, endsAt - nowMs);
    const totalSec = Math.floor(remainMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  if (!session) {
    return (
      <TeacherAuthGuard>
        <main className="section-page">
          <div className="site-shell">
            <p>Không tìm thấy phiên.</p>
          </div>
        </main>
      </TeacherAuthGuard>
    );
  }

  const headerStatus = toStatusLabel(session.status);
  const type1CanRandomRemain =
    session.type === 1 &&
    session.type1Stage === "group3" &&
    session.status === "running" &&
    ungrouped.length > 0;
  const type1CanStartBidding =
    session.type === 1 &&
    session.type1Stage === "group3" &&
    session.status === "running" &&
    ungrouped.length === 0 &&
    (!session.type1Group3EndsAt || Date.now() >= session.type1Group3EndsAt);
  const type1CanMoveToGroup3 =
    session.type === 1 &&
    session.status === "running" &&
    session.type1Stage === "pairing";
  const currentStageLabel =
    session.type === 1
      ? toType1StageLabel(session.type1Stage)
      : session.type === 2
        ? session.topic2FinalizedAt
          ? "� ch�t"
          : session.status === "running"
            ? "Ch�n ph�ng"
            : "Chuẩn bị"
        : "-";

  return (
    <TeacherAuthGuard>
      <main className="section-page">
        <div className="site-shell group-shell">
          <div className="section-head section-head-single">
            <div>
              <span className="section-eyebrow">Điều hành phiên</span>
              <h1 style={{ fontSize: 36, whiteSpace: "nowrap", width: "100%" }}>
                {`Phiên chia chủ đề thuyết trình ${session.subjectName} - ${session.className}`}
              </h1>
            </div>
            <p>
              Code: {session.classCode} | Kiểu {session.type} | Trạng th�i: {headerStatus}
            </p>
          </div>

          <div className="group-action-row">
            <Link href="/features/topic-picker/manage" className="hero-secondary">
              Về danh s�ch phi�n
            </Link>
            <Link href={`/features/topic-picker/manage/${session.classCode}/view`} className="hero-secondary">
              Xem danh s�ch sinh vi�n
            </Link>
          </div>

          <div className="group-control-layout" style={{ marginTop: 14 }}>
            <div className="group-control-status-stack">
              <div className="group-control-metrics">
                <article className="status-box">
                  <p className="status-label">Tổng số sinh viên</p>
                  <p className="status-value">{session.students.length}</p>
                </article>
                <article className="status-box">
                  <p className="status-label">SV đã đăng nhập</p>
                  <p className="status-value">{loggedInCount}</p>
                </article>
                <article className="status-box">
                  <p className="status-label">{session.type === 3 ? "� v�o nh�m" : "� v�o nh�m"}</p>
                  <p className="status-value">{session.type === 3 ? loggedInCount : groupedCount}</p>
                </article>
                <article className="status-box">
                  <p className="status-label">{session.type === 3 ? "SV ch�a ng nh�p" : "Ch�a v�o nh�m"}</p>
                  <p className="status-value">{session.type === 3 ? Math.max(0, session.students.length - loggedInCount) : ungrouped.length}</p>
                </article>
                <article className="status-box">
                  <p className="status-label">Vòng hiện tại</p>
                  <p className="status-value">{currentStageLabel}</p>
                </article>
              </div>

              <article className="content-card group-control-results-card">
                <h2>Kết quả qua c�c v�ng</h2>

                {session.type === 1 ? (
                  <>
                    <details open className="group-result-block">
                      <summary>
                        <strong>Vòng ghép cặp hiện tại</strong>
                      </summary>
                      <p className="hint-copy" style={{ marginTop: 10 }}>
                        Trạng th�i: {toType1StageLabel(session.type1Stage)} � Chưa v�o nh�m: {ungrouped.length}
                      </p>
                      {(session.workingGroups || []).length > 0 ? (
                        <div className="group-round1-result-list">
                          {(session.workingGroups || []).map((group, index) => (
                            <div key={group.id} className="group-round1-result">
                              <span>{getType1GroupDisplayLabel(group.id, index)}</span>
                              <small>{group.memberNames.join(", ") || "Chưa có thành viên"}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="hint-copy">Chưa có nhóm tạm.</p>
                      )}
                    </details>

                    <details className="group-result-block">
                      <summary>
                        <strong>Kết quả cuối cùng</strong>
                      </summary>
                      {(session.finalGroups || []).length > 0 ? (
                        <div className="group-round1-result-list" style={{ marginTop: 10 }}>
                          {(session.finalGroups || []).map((group, index) => (
                            <div key={group.id} className="group-round1-result leader">
                              <span>
                                {getGroupLabelByTopic(group.topic, index)} · {group.topic}
                              </span>
                              <small>{group.memberNames.join(", ")}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="hint-copy" style={{ marginTop: 10 }}>
                          Chưa có kết quả cuối.
                        </p>
                      )}
                      {session.type1Stage === "completed" && session.finalGroups.length > 0 ? (
                        <div style={{ marginTop: 12, overflowX: "auto" }}>
                          <strong>Tổng kết đấu gi�</strong>
                          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 14 }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px 8px" }}>Nhóm</th>
                                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px 8px" }}>Chủ đề</th>
                                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "6px 8px" }}>Điểm ban đầu</th>
                                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "6px 8px" }}>Điểm đã chi</th>
                                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: "6px 8px" }}>Điểm còn lại</th>
                                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px 8px" }}>Ghi chú</th>
                              </tr>
                            </thead>
                            <tbody>
                              {session.finalGroups.map((group, index) => {
                                const initial = computeInitialType1Points(session, group.id);
                                const remain = session.groupRemainingPoints?.[group.id] || 0;
                                const spent = Math.max(0, initial - remain);
                                const note =
                                  session.type1TopRemainingGroupId === group.id
                                    ? "+0.5 i�m th��ng"
                                    : (session.type1PenalizedGroupIds || []).includes(group.id)
                                      ? `- ${session.type1PenaltyPoints || 30} i�m do random sau v�ng 5`
                                      : "";
                                return (
                                  <tr key={`type1-summary-${group.id}-${index}`}>
                                    <td style={{ borderBottom: "1px solid #eee", padding: "6px 8px" }}>{getGroupLabelByTopic(group.topic, index)}</td>
                                    <td style={{ borderBottom: "1px solid #eee", padding: "6px 8px" }}>{group.topic}</td>
                                    <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "6px 8px" }}>{initial}</td>
                                    <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "6px 8px" }}>{spent}</td>
                                    <td style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "6px 8px" }}>{remain}</td>
                                    <td style={{ borderBottom: "1px solid #eee", padding: "6px 8px" }}>{note}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </details>
                  </>
                ) : null}

                {session.type === 2 ? (
                  <details open className="group-result-block">
                    <summary>
                      <strong>Phòng theo chủ đề</strong>
                    </summary>
                    <div className="group-round1-result-list" style={{ marginTop: 10 }}>
                      {session.topics.map((topic) => {
                        const members = session.topic2RoomMembers?.[topic] || [];
                        const locked = (session.topic2LockedTopics || []).includes(topic);
                        const names = members
                          .map((id) => session.students.find((s) => s.studentId === id)?.fullName || id)
                          .join(", ");
                        const source =
                          session.topic2LockSourceByTopic?.[topic] ||
                          (locked ? "T� ch�t trong ph�ng" : "ang m�");
                        return (
                          <div key={topic} className={locked ? "group-round1-result leader" : "group-round1-result"}>
                            <span>
                              {topic} � {locked ? "� kh�a" : "ang m�"}
                            </span>
                            <small>{members.length} sinh vi�n{names ? ` � ${names}` : ""}</small>
                            <small style={{ display: "block", marginTop: 4 }}>Nguồn chốt: {source}</small>
                          </div>
                        );
                      })}
                    </div>
                    {session.finalGroups.length > 0 ? (
                      <div style={{ marginTop: 12 }}>
                        <strong>Kết quả final</strong>
                        <div className="group-round1-result-list" style={{ marginTop: 8 }}>
                          {session.finalGroups.map((group, index) => (
                            <div key={`final-${group.id}-${group.topic}-${index}`} className="group-round1-result leader">
                              <span>{getGroupLabelByTopic(group.topic, index)} · {group.topic}</span>
                              <small>{group.memberNames.join(", ")}</small>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </details>
                ) : null}

                {session.type === 3 ? (
                  <details open className="group-result-block">
                    <summary>
                      <strong>Kết quả random</strong>
                    </summary>
                    {(session.finalGroups || []).length > 0 ? (
                      <div className="group-round1-result-list" style={{ marginTop: 10 }}>
                        {(session.finalGroups || []).map((group, index) => (
                          <div key={group.id} className="group-round1-result leader">
                            <span>{getGroupLabelByTopic(group.topic, index) } · {group.topic}</span>
                            <small>{group.memberNames.join(", ")}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="hint-copy" style={{ marginTop: 10 }}>
                        Chưa random xong.
                      </p>
                    )}
                  </details>
                ) : null}
              </article>
            </div>

            <article className="content-card group-control-actions-card">
              <h2>Điều khiển phiên</h2>
              <div className="group-control-buttons">
                {session.type === 1 ? (
                  <article className="status-box" style={{ marginBottom: 4 }}>
                    <p className="status-label">
                      {session.type1Stage === "group3"
                        ? "�m ng��c m�i th�nh vi�n th� 3"
                        : session.type1Stage === "bidding"
                          ? "�m ng��c v�ng �u gi�"
                          : "Đếm ngược ghép cặp"}
                    </p>
                    <p className="status-value">
                      {session.status === "running" && session.type1Stage === "pairing"
                        ? formatCountdown(session.type1PairingEndsAt)
                        : session.status === "running" && session.type1Stage === "group3"
                          ? (session.type1Group3EndsAt && Date.now() < session.type1Group3EndsAt ? formatCountdown(session.type1Group3EndsAt) : "� k�t th�c")
                          : session.status === "running" && session.type1Stage === "bidding"
                            ? formatCountdown(session.type1RoundEndsAt)
                          : `${session.type1PairingDurationMinutes || 10} phút`}
                    </p>
                  </article>
                ) : null}

                {session.type === 2 ? (
                  <article className="status-box" style={{ marginBottom: 4 }}>
                    <p className="status-label">Đếm ngược chọn phòng</p>
                    <p className="status-value">
                      {session.topic2FinalizedAt
                        ? "� k�t th�c"
                        : session.status === "running"
                          ? formatCountdown(session.topic2EndsAt)
                          : `${session.topic2DurationMinutes || 10} phút`}
                    </p>
                  </article>
                ) : null}

                {session.type === 2 ? (
                  <button
                    type="button"
                    className="primary-button group-control-button group-control-open-round1"
                    disabled={session.status !== "preparing"}
                    onClick={() =>
                      runAction(() => startTopicSession(session), "Đã bắt đầu phiên.", "Không thể bắt đầu phiên lúc này.")
                    }
                  >
                    Bắt đầu phiên
                  </button>
                ) : null}

                {session.status === "preparing" && session.type !== 2 ? (
                  <button
                    type="button"
                    className="primary-button group-control-button group-control-open-round1"
                    onClick={() =>
                      runAction(() => startTopicSession(session), "Đã bắt đầu phiên.", "Không thể bắt đầu phiên lúc này.")
                    }
                  >
                    Bắt đầu phiên
                  </button>
                ) : null}

                {session.type === 3 ? (
                  <button
                    type="button"
                    className="secondary-button teacher-button-soft group-control-button"
                    onClick={() =>
                      runAction(
                        () => runRandomFullAssignment(session),
                        "Đã random toàn bộ nhóm.",
                        "Không thể random lúc này."
                      )
                    }
                  >
                    Random ngay
                  </button>
                ) : null}

                {session.type === 1 ? (
                  <>
                    <button
                      type="button"
                      className="secondary-button teacher-button-soft group-control-button"
                      disabled={!type1CanMoveToGroup3}
                      onClick={() =>
                        runAction(
                          () => teacherMoveType1ToGroup3(session),
                          "Đã chuyển sang lượt nhóm 3 thành viên.",
                          "Không thể chuyển lượt lúc này."
                        )
                      }
                    >
                      Chuyển sang lượt nhóm 3 TV
                    </button>
                    <button
                      type="button"
                      className="secondary-button teacher-button-soft group-control-button"
                      disabled={!type1CanRandomRemain}
                      onClick={() =>
                        runAction(
                          () => {
                            const randomed = randomFillType1(session);
                            return upsertTopicSession({
                              ...randomed,
                              type1Group3EndsAt: 0,
                              updatedAt: Date.now()
                            });
                          },
                          "Đã random sinh viên còn lại và công bố kết quả ghép nhóm.",
                          "Không thể random sinh viên lúc này."
                        )
                      }
                    >
                      Random SV còn lại
                    </button>
                    <button
                      type="button"
                      className="secondary-button teacher-button-soft group-control-button"
                      disabled={!type1CanStartBidding}
                      onClick={() =>
                        runAction(
                          () => startBiddingType1(session),
                          "Đ� bắt đầu v�ng đấu gi�.",
                          "Kh�ng thể mở v�ng đấu gi� l�c n�y."
                        )
                      }
                    >
                      Bắt đầu đấu gi�
                    </button>
                    <button
                      type="button"
                      className="secondary-button teacher-button-soft group-control-button"
                      disabled={session.type1Stage !== "bidding"}
                      onClick={() =>
                        runAction(
                          () => finalizeType1BiddingWithRandom(session),
                          "Đ� kết th�c đấu gi�, random chủ đề c�n lại v� đ�ng phi�n.",
                          "Kh�ng thể kết th�c đấu gi� l�c n�y."
                        )
                      }
                    >
                      Kết th�c đấu gi�, random chủ đề c�n lại
                    </button>
                  </>
                ) : null}

                {session.type === 2 && session.status === "running" && !session.topic2FinalizedAt
                  ? null
                  : null}

                {session.type === 2 && session.status === "running" && !session.topic2FinalizedAt ? (
                  <button
                    type="button"
                    className="primary-button group-control-button"
                    onClick={() =>
                      runAction(
                        () => finalizeTopic2Selection(session, "GV bấm Kết thúc chọn phòng"),
                        "Đã kết thúc chọn phòng và chốt kết quả final.",
                        "Không thể kết thúc chọn phòng lúc này."
                      )
                    }
                  >
                    Kết thúc chọn phòng
                  </button>
                ) : null}

                {session.type === 2 ? (
                  <button
                    type="button"
                    className="secondary-button teacher-button-soft group-control-button"
                    disabled={session.status === "completed"}
                    onClick={() =>
                      runAction(
                        () => finalizeTopic2Selection(session, "GV bấm Random cuối"),
                        "Đã random cuối và chốt kết quả final.",
                        "Không thể random cuối lúc này."
                      )
                    }
                  >
                    Random cuối
                  </button>
                ) : null}

                <button
                  type="button"
                  className="hero-secondary group-control-button group-danger"
                  onClick={handleResetSession}
                >
                  Reset game
                </button>
              </div>
            </article>
          </div>

          {session.type === 1 && ungrouped.length > 0 ? (
            <p className="hint-copy" style={{ marginTop: 14 }}>
              SV chưa vào nhóm: {ungrouped.map((item) => item.fullName).join(", ")}
            </p>
          ) : null}

          {statusMessage ? <p className="group-status-note">{statusMessage}</p> : null}
        </div>
      </main>
    </TeacherAuthGuard>
  );
}
