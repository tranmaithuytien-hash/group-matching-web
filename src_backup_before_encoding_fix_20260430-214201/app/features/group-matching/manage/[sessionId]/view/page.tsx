"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TeacherAuthGuard } from "../../../../../../components/teacher-auth-guard";
import { getDemoSession } from "../../../../../../lib/auth-storage";
import {
  getCurrentRoundStatusLabel,
  getGroupMatchingSessionForOwner,
  type GroupMatchingSession
} from "../../../../../../lib/group-matching";

function formatTimeLabel(timestamp: number) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(timestamp);
  } catch {
    return "";
  }
}

export default function GroupMatchingSessionViewPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  const [session, setSession] = useState<GroupMatchingSession | null>(null);

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
    const intervalId = window.setInterval(refresh, 1200);
    window.addEventListener("storage", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", refresh);
    };
  }, [sessionId]);

  const sortedLogs = useMemo(() => {
    if (!session) {
      return [];
    }
    return [...(session.actionLogs || [])].sort((left, right) => right.at - left.at);
  }, [session]);

  return (
    <TeacherAuthGuard>
      <main className="section-page">
        <div className="site-shell group-shell">
          {!session ? (
            <article className="content-card">
              <h2>Không tìm thấy phiên</h2>
              <p>Phiên này không tồn tại hoặc không thuộc tài khoản Giảng viên hiện tại.</p>
              <Link href="/features/group-matching/manage" className="hero-secondary inline-cta">
                Về trang quản lý
              </Link>
            </article>
          ) : (
            <>
              <div className="section-head section-head-single">
                <div>
                  <span className="section-eyebrow">Xem phiên chia nhóm</span>
                  <h1>{session.className}</h1>
                </div>
                <p>
                  Class code: <strong>{session.classCode}</strong> � Trạng th�i hiện tại:{" "}
                  <strong>{getCurrentRoundStatusLabel(session.currentRound, session.roundsEnabled)}</strong>
                </p>
              </div>

              <div className="group-action-row">
                <Link href={`/features/group-matching/manage/${session.id}`} className="hero-primary">
                  Điều khiển
                </Link>
                <Link href="/features/group-matching/manage" className="hero-secondary">
                  Về danh s�ch phi�n
                </Link>
              </div>

              <div className="group-view-split">
                <article className="content-card">
                  <h2>Danh s�ch sinh vi�n</h2>
                  <div className="group-student-list">
                    {session.participants
                      .slice()
                      .sort((a, b) => a.ranking - b.ranking)
                      .map((participant, index) => (
                        <div key={participant.studentId} className="group-student-item">
                          <span>
                            {index + 1}. {participant.fullName}
                          </span>
                          <small>
                            {participant.studentId} · Thứ hạng {participant.ranking}
                          </small>
                        </div>
                      ))}
                  </div>
                </article>

                <article className="content-card">
                  <h2>Lịch sử t�c động</h2>
                  <p className="hint-copy" style={{ marginTop: 0 }}>
                    Ghi nhận c�c thao t�c như tạo mới, sửa cấu h�nh, mở v�ng, start matching, random fill, reset...
                  </p>

                  {sortedLogs.length > 0 ? (
                    <div className="group-log-list">
                      {sortedLogs.map((entry) => (
                        <div key={entry.id} className="group-log-item">
                          <strong>{entry.action}</strong>
                          {entry.detail ? <span>{entry.detail}</span> : null}
                          <small>{formatTimeLabel(entry.at)}</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hint-copy">Chưa c� log t�c động.</p>
                  )}
                </article>
              </div>
            </>
          )}
        </div>
      </main>
    </TeacherAuthGuard>
  );
}

