"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TeacherAuthGuard } from "../../../../components/teacher-auth-guard";
import {
  formatRoundSummary,
  loadGroupMatchingSessionsByOwner,
  migrateLegacySessionsToOwner,
  removeGroupMatchingSession,
  type GroupMatchingSession
} from "../../../../lib/group-matching";
import { getDemoSession } from "../../../../lib/auth-storage";

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

export default function GroupMatchingManagePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<GroupMatchingSession[]>([]);
  const [teacherEmail, setTeacherEmail] = useState("");

  useEffect(() => {
    const currentSession = getDemoSession();
    const email = currentSession?.email || "";
    const name = currentSession?.name || "";

    setTeacherEmail(email);

    if (!email) {
      setSessions([]);
      return;
    }

    migrateLegacySessionsToOwner(email, name);
    setSessions(loadGroupMatchingSessionsByOwner(email));
  }, []);

  useEffect(() => {
    if (!teacherEmail) {
      return;
    }

    const refresh = () => {
      setSessions(loadGroupMatchingSessionsByOwner(teacherEmail));
    };

    const intervalId = window.setInterval(refresh, 1500);
    window.addEventListener("storage", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", refresh);
    };
  }, [teacherEmail]);

  const handleDelete = (sessionId: string) => {
    const confirmed = window.confirm("Bạn có chắc muốn xóa phiên chia nhóm này?");
    if (!confirmed) {
      return;
    }

    removeGroupMatchingSession(sessionId);
    if (!teacherEmail) {
      return;
    }
    setSessions(loadGroupMatchingSessionsByOwner(teacherEmail));
  };

  return (
    <TeacherAuthGuard>
      <main className="section-page">
        <div className="site-shell group-shell">
          <div className="section-head section-head-single">
            <div>
              <span className="section-eyebrow">Quản lý chia nhóm</span>
              <h1 className="group-manage-page-title">Danh sách game chia nhóm bạn đã tạo.</h1>
            </div>
            <p>
              Bạn có thể điều khiển phiên, xem nhanh class code, sửa cấu hình hoặc xóa phiên. Nút Điều khiển sẽ đưa
              thẳng đến trang điều phối các vòng chơi của phiên đó.
            </p>
          </div>

          <div className="group-action-row">
            <Link href="/features/group-matching/create" className="hero-primary">
              Tạo phiên mới
            </Link>
            <Link href="/features/group-matching" className="hero-secondary">
              Về trang Chia nhóm
            </Link>
          </div>

          {sessions.length === 0 ? (
            <article className="content-card">
              <h2>Bạn chưa có phiên nào.</h2>
              <p>Hãy tạo phiên mới để nhận class code và bắt đầu điều khiển các vòng chơi.</p>
            </article>
          ) : (
            <div className="content-grid group-manage-grid">
              {sessions.map((session) => (
                <article key={session.id} className="content-card group-session-card">
                  <div className="feature-top">
                    <span className="section-eyebrow">Code: {session.classCode}</span>
                    <span className="feature-badge">{session.participants.length} SV</span>
                  </div>

                  <h2>{session.className}</h2>
                  <p>
                    Số nhóm: <strong>{session.groupCount}</strong>
                  </p>
                  <p>Vòng áp dụng:</p>
                  <p>
                    <strong>{formatRoundSummary(session.roundsEnabled)}</strong>
                  </p>
                  <p className="hint-copy">Cập nhật: {formatTimeLabel(session.updatedAt)}</p>

                  <div className="group-card-actions">
                    <button
                      type="button"
                      className="hero-primary group-inline-action"
                      onClick={() => router.push(`/features/group-matching/manage/${session.id}`)}
                    >
                      Điều khiển
                    </button>
                    <Link href={`/features/group-matching/manage/${session.id}/view`} className="hero-secondary">
                      Xem
                    </Link>
                    <Link href={`/features/group-matching/create?edit=${session.id}`} className="hero-secondary">
                      Sửa
                    </Link>
                    <button
                      type="button"
                      className="hero-secondary group-danger"
                      onClick={() => handleDelete(session.id)}
                    >
                      Xóa
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </TeacherAuthGuard>
  );
}
