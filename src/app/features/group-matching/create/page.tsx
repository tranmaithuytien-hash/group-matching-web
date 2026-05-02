"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TeacherAuthGuard } from "../../../../components/teacher-auth-guard";
import {
  createSessionId,
  createUniqueClassCode,
  defaultRoundConfig,
  formatRoundSummary,
  loadGroupMatchingSessions,
  loadGroupMatchingSessionsByOwner,
  migrateLegacySessionsToOwner,
  parseParticipantList,
  participantsToImportText,
  type GroupMatchingSession,
  type GroupParticipant,
  type GroupRoundConfig,
  type GroupRoundKey,
  upsertGroupMatchingSession
} from "../../../../lib/group-matching";
import {
  loadTeacherClassListsByOwner,
  syncClassListFromGroupSession,
  type TeacherClassList
} from "../../../../lib/class-lists";
import { getDemoSession } from "../../../../lib/auth-storage";

type SourceMode = "existing" | "import";

function RoundSelector({
  rounds,
  onChange,
  leaderVoteCount
}: {
  rounds: GroupRoundConfig;
  onChange: (next: GroupRoundConfig) => void;
  leaderVoteCount: number;
}) {
  const roundLabels: Record<GroupRoundKey, { title: string; description: string }> = {
    round1: {
      title: "Vòng 1 · Bầu chọn Nhóm trưởng",
      description: `Mỗi SV bầu đúng ${leaderVoteCount} Nhóm trưởng (= số nhóm cần chia).`
    },
    round2: {
      title: "Vòng 2 · Gửi nguyện vọng 2 chiều",
      description: "Thành viên chọn Nhóm trưởng, Nhóm trưởng xếp ưu tiên Thành viên."
    },
    round3: {
      title: "Vòng 3 · Tạo phòng và gửi thư",
      description: "Nhóm trưởng tạo phòng, Thành viên gửi thư xin gia nhập."
    },
    round4: {
      title: "Vòng 4 · Random fill và chốt nhóm",
      description: "Tự động fill các bạn chưa vào nhóm để hoàn tất game."
    }
  };

  const toggleRound = (roundKey: GroupRoundKey, checked: boolean) => {
    if (roundKey === "round1" || roundKey === "round4") {
      return;
    }

    onChange({
      ...rounds,
      [roundKey]: checked
    });
  };

  return (
    <div className="group-round-grid">
      {(["round1", "round2", "round3", "round4"] as GroupRoundKey[]).map((roundKey) => {
        const locked = roundKey === "round1" || roundKey === "round4";

        return (
          <label key={roundKey} className={locked ? "group-round-card locked" : "group-round-card"}>
            <input
              type="checkbox"
              checked={rounds[roundKey]}
              disabled={locked}
              onChange={(event) => toggleRound(roundKey, event.target.checked)}
            />
            <span>{roundLabels[roundKey].title}</span>
            <small>{roundLabels[roundKey].description}</small>
            {locked ? <small>Bắt buộc</small> : <small>Tùy chọn</small>}
          </label>
        );
      })}
    </div>
  );
}

export default function GroupMatchingCreatePage() {
  const router = useRouter();
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const isEditMode = Boolean(editingSessionId);
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherName, setTeacherName] = useState("");

  const [sessions, setSessions] = useState<GroupMatchingSession[]>([]);
  const [sourceClassLists, setSourceClassLists] = useState<TeacherClassList[]>([]);
  const [sourceMode, setSourceMode] = useState<SourceMode>("import");
  const [selectedClassListId, setSelectedClassListId] = useState("");

  const [className, setClassName] = useState("");
  const [groupCount, setGroupCount] = useState("4");
  const requestedGroupCount = Math.max(2, Number(groupCount) || 2);
  const [roundsEnabled, setRoundsEnabled] = useState<GroupRoundConfig>(defaultRoundConfig);
  const [participantInput, setParticipantInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEditingSessionId(params.get("edit"));
    const currentSession = getDemoSession();
    setTeacherEmail(currentSession?.email || "");
    setTeacherName(currentSession?.name || "");
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated || !teacherEmail) {
      return;
    }

    migrateLegacySessionsToOwner(teacherEmail, teacherName);
    const loadedSessions = loadGroupMatchingSessionsByOwner(teacherEmail);
    const loadedClassLists = loadTeacherClassListsByOwner(teacherEmail);
    setSessions(loadedSessions);
    setSourceClassLists(loadedClassLists);

    if (!isEditMode) {
      if (loadedClassLists.length > 0) {
        setSelectedClassListId(loadedClassLists[0].id);
      }
      return;
    }

    const targetSession = loadedSessions.find((session) => session.id === editingSessionId);
    if (!targetSession) {
      setStatusMessage("Không tìm thấy phiên cần sửa. Bạn có thể tạo phiên mới.");
      return;
    }

    setSourceMode("import");
    setClassName(targetSession.className);
    setGroupCount(String(targetSession.groupCount));
    setRoundsEnabled(targetSession.roundsEnabled);
    setParticipantInput(participantsToImportText(targetSession.participants));
  }, [editingSessionId, isEditMode, isHydrated, teacherEmail, teacherName]);

  const selectedClassList = useMemo(
    () => sourceClassLists.find((classList) => classList.id === selectedClassListId) || null,
    [sourceClassLists, selectedClassListId]
  );

  const selectedParticipantCount = selectedClassList?.students.length || 0;

  const toGroupParticipants = (classList: TeacherClassList): GroupParticipant[] =>
    classList.students.map((student, index) => ({
      studentId: String(student.studentId || "").trim(),
      fullName: String(student.fullName || "").trim(),
      ranking: Number(student.ranking) > 0 ? Number(student.ranking) : index + 1,
      email: String(student.email || "").trim()
    }));

  const handleUseClassList = () => {
    if (!selectedClassList) {
      return;
    }

    const participants = toGroupParticipants(selectedClassList);
    setClassName(selectedClassList.className);
    setParticipantInput(participantsToImportText(participants));
    setGroupCount(String(Math.max(2, Math.min(4, participants.length))));
    setRoundsEnabled(defaultRoundConfig);
    setStatusMessage("Đã nạp dữ liệu lớp từ Lớp của tôi.");
  };

  const handleSubmit = () => {
    const now = Date.now();
    if (!teacherEmail) {
      setStatusMessage("Không xác định được tài khoản Giảng viên hiện tại.");
      return;
    }

    const normalizedClassName = className.trim();
    if (!normalizedClassName) {
      setStatusMessage("Vui lòng nhập tên lớp trước khi tạo.");
      return;
    }

    const parsedGroupCount = Math.max(2, Number(groupCount) || 0);
    if (!Number.isFinite(parsedGroupCount)) {
      setStatusMessage("Số nhóm không hợp lệ.");
      return;
    }

    let participants = parseParticipantList(participantInput);

    if (sourceMode === "existing") {
      if (!selectedClassList) {
        setStatusMessage("Vui lòng chọn lớp có sẵn để tạo phiên mới.");
        return;
      }
      participants = toGroupParticipants(selectedClassList);
    }

    if (participants.length < 2) {
      setStatusMessage("Danh sách cần tối thiểu 2 sinh viên để chia nhóm.");
      return;
    }

    if (parsedGroupCount > participants.length) {
      setStatusMessage(
        `Số nhóm cần chia (${parsedGroupCount}) không thể lớn hơn số SV hiện có (${participants.length}).`
      );
      return;
    }

    const safeRounds: GroupRoundConfig = {
      ...roundsEnabled,
      round1: true,
      round4: true
    };

    const currentEditingSession = isEditMode
      ? sessions.find((session) => session.id === editingSessionId) || null
      : null;

    const actionLogEntry = {
      id: `log_${now}_${Math.random().toString(36).slice(2, 9)}`,
      at: now,
      action: currentEditingSession ? "Sửa cấu hình game" : "Tạo game mới",
      detail: `${normalizedClassName} · ${parsedGroupCount} nhóm · ${formatRoundSummary(safeRounds)}`
    };

    const previousLogs = currentEditingSession?.actionLogs || [];
    const sessionId = currentEditingSession?.id || createSessionId();
    const classCode =
      currentEditingSession?.classCode ||
      createUniqueClassCode(loadGroupMatchingSessions().map((session) => session.classCode));

    const sessionPayload: GroupMatchingSession = {
      id: sessionId,
      className: normalizedClassName,
      classCode,
      ownerTeacherEmail: teacherEmail,
      ownerTeacherName: teacherName || teacherEmail.split("@")[0],
      participants,
      groupCount: parsedGroupCount,
      roundsEnabled: safeRounds,
      round1Votes: currentEditingSession?.round1Votes || {},
      loggedInStudentIds: currentEditingSession?.loggedInStudentIds || [],
      studentCredentials: currentEditingSession?.studentCredentials || {},
      participantRoles: currentEditingSession?.participantRoles || {},
      topLeaders: currentEditingSession?.topLeaders || [],
      leadersVisible: currentEditingSession?.leadersVisible || false,
      round2MemberPreferences: currentEditingSession?.round2MemberPreferences || {},
      round2LeaderRankings: currentEditingSession?.round2LeaderRankings || {},
      round2Matched: currentEditingSession?.round2Matched || false,
      matchingResults: currentEditingSession?.matchingResults || [],
      round3Rooms: currentEditingSession?.round3Rooms || {},
      round3Applications: currentEditingSession?.round3Applications || {},
      round3Results: currentEditingSession?.round3Results || [],
      round3UnmatchedStudentIds: currentEditingSession?.round3UnmatchedStudentIds || [],
      finalGroups: currentEditingSession?.finalGroups || [],
      actionLogs: [...previousLogs, actionLogEntry].slice(-500),
      roundOpenedAt: currentEditingSession?.roundOpenedAt || {},
      createdAt: currentEditingSession?.createdAt || now,
      updatedAt: now,
      startedAt: currentEditingSession?.startedAt,
      currentRound: currentEditingSession?.currentRound || "waiting"
    };

    const savedSession = upsertGroupMatchingSession(sessionPayload);
    if (savedSession) {
      syncClassListFromGroupSession(savedSession);
    }

    router.push(`/features/group-matching/manage/${sessionPayload.id}`);
  };

  return (
    <TeacherAuthGuard>
      <main className="section-page">
        <div className="site-shell group-shell">
          <div className="section-head section-head-single">
            <div>
              <span className="section-eyebrow">{isEditMode ? "Sửa phiên chia nhóm" : "Tạo mới chia nhóm"}</span>
              <h1>{isEditMode ? "Cập nhật cấu hình game chia nhóm." : "Tạo game chia nhóm cho lớp của bạn."}</h1>
            </div>
            <p>
              Bạn có thể dùng danh sách lớp đã có hoặc import mới trực tiếp. Sau khi tạo xong, hệ thống cấp class code
              để bạn gửi cho sinh viên rồi vào trang quản lý vòng chơi.
            </p>
          </div>

          <section className="group-form-card">
            <div className="group-source-switch">
              <button
                type="button"
                className={sourceMode === "import" ? "feature-tab active" : "feature-tab"}
                onClick={() => setSourceMode("import")}
              >
                Tạo lớp mới
              </button>
              <button
                type="button"
                className={sourceMode === "existing" ? "feature-tab active" : "feature-tab"}
                onClick={() => setSourceMode("existing")}
              >
                Dùng lớp trong Lớp của tôi
              </button>
            </div>

            {sourceMode === "existing" ? (
              <div className="group-template-box">
                <label className="field">
                  <span>Chọn lớp nguồn</span>
                  <select
                    className="text-input"
                    value={selectedClassListId}
                    onChange={(event) => setSelectedClassListId(event.target.value)}
                  >
                    <option value="">-- Chọn lớp đã có --</option>
                    {sourceClassLists.map((classList) => (
                      <option key={classList.id} value={classList.id}>
                        {classList.className} ({classList.students.length} SV)
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="hero-secondary group-inline-action"
                  onClick={handleUseClassList}
                  disabled={!selectedClassList}
                >
                  Nạp danh sách lớp
                </button>
                {selectedClassList ? (
                  <p className="hint-copy">
                    Lớp đang chọn có {selectedParticipantCount} SV. Bạn có thể nạp nhanh từ Lớp của tôi rồi chỉnh lại số
                    nhóm và cấu hình vòng bên dưới.
                  </p>
                ) : null}
              </div>
            ) : null}

            <label className="field">
              <span>Tên lớp</span>
              <input
                className="text-input"
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                placeholder="Ví dụ: SU26-BL2-DM2001"
              />
            </label>

            <label className="field">
              <span>Số nhóm cần chia</span>
              <input
                className="text-input"
                type="number"
                min={2}
                value={groupCount}
                onChange={(event) => setGroupCount(event.target.value)}
              />
              <small className="hint-copy">Vòng 1 sẽ bầu đúng {requestedGroupCount} nhóm trưởng.</small>
            </label>

            <div className="field">
              <span>Số vòng chơi</span>
              <RoundSelector rounds={roundsEnabled} onChange={setRoundsEnabled} leaderVoteCount={requestedGroupCount} />
              <small className="hint-copy">
                Đang chọn: {formatRoundSummary(roundsEnabled)}. Vòng 1 và Vòng 4 là bắt buộc.
              </small>
            </div>

            <label className="field">
              <span>Danh sách SV</span>
              <textarea
                className="text-input group-textarea"
                value={participantInput}
                onChange={(event) => setParticipantInput(event.target.value)}
                placeholder="MSSV[TAB]Họ tên[TAB]Thứ hạng[TAB]Email (Email là tùy chọn)"
              />
              <small className="hint-copy">
                Nếu không có cột thứ hạng, hệ thống tự đánh số theo thứ tự dòng khi import.
              </small>
            </label>

            <div className="group-action-row">
              <button type="button" className="hero-primary" onClick={handleSubmit}>
                {isEditMode ? "Lưu và quay lại quản lý" : "Tạo phiên và bắt đầu quản lý"}
              </button>
              <Link href="/features/group-matching/manage" className="hero-secondary">
                Về danh sách quản lý
              </Link>
            </div>

            {statusMessage ? <p className="group-status-note">{statusMessage}</p> : null}
          </section>
        </div>
      </main>
    </TeacherAuthGuard>
  );
}
