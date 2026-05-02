"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getDemoSession } from "../../lib/auth-storage";
import {
  formatRoundSummary,
  loadGroupMatchingSessionsByOwner,
  migrateLegacySessionsToOwner,
  removeGroupMatchingSession,
  type GroupMatchingSession
} from "../../lib/group-matching";

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

export default function LibraryPage() {
  const router = useRouter();
  const [sessionItems, setSessionItems] = useState<GroupMatchingSession[]>([]);
  const [teacherEmail, setTeacherEmail] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [featureFilter, setFeatureFilter] = useState("all");

  useEffect(() => {
    const activeSession = getDemoSession();
    const email = activeSession?.email || "";

    setTeacherEmail(email);

    if (!activeSession || activeSession.role !== "teacher" || !email) {
      setSessionItems([]);
      return;
    }

    migrateLegacySessionsToOwner(email, activeSession?.name || "");
    setSessionItems(loadGroupMatchingSessionsByOwner(email));
  }, []);

  useEffect(() => {
    if (!teacherEmail) {
      return;
    }

    const refresh = () => {
      setSessionItems(loadGroupMatchingSessionsByOwner(teacherEmail));
    };

    const intervalId = window.setInterval(refresh, 1500);
    window.addEventListener("storage", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", refresh);
    };
  }, [teacherEmail]);

  const classOptions = useMemo(() => {
    return Array.from(new Set(sessionItems.map((session) => session.className).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b, "vi")
    );
  }, [sessionItems]);

  const filteredSessions = useMemo(() => {
    return sessionItems.filter((session) => {
      const matchClass = classFilter === "all" ? true : session.className === classFilter;
      const matchFeature = featureFilter === "all" ? true : featureFilter === "group-matching";
      return matchClass && matchFeature;
    });
  }, [sessionItems, classFilter, featureFilter]);

  const handleDelete = (sessionId: string) => {
    const confirmed = window.confirm("B�n c� ch�c mu�n x�a phi�n game n�y?");
    if (!confirmed) {
      return;
    }

    removeGroupMatchingSession(sessionId);
    if (!teacherEmail) {
      return;
    }
    setSessionItems(loadGroupMatchingSessionsByOwner(teacherEmail));
  };

  return (
    <main className="section-page">
      <div className="site-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Thư viện</span>
            <h1 className="library-page-title">Không gian lưu trữ những game đã tạo.</h1>
          </div>
        </div>

        {sessionItems.length === 0 ? (
          <article className="content-card">
            <h2>Bạn chưa có phiên nào trong thư viện.</h2>
            <p>
              Bạn có thể tạo nhanh tại <Link href="/features/group-matching/create">Tạo mới Chia nhóm</Link>.
            </p>
          </article>
        ) : (
          <>
            <section className="content-card library-filter-card">
              <div className="library-filter-grid">
                <label className="field">
                  <span>Lọc theo lớp</span>
                  <select
                    className="text-input"
                    value={classFilter}
                    onChange={(event) => setClassFilter(event.target.value)}
                  >
                    <option value="all">Tất cả lớp</option>
                    {classOptions.map((className) => (
                      <option key={className} value={className}>
                        {className}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Lọc theo tính năng</span>
                  <select
                    className="text-input"
                    value={featureFilter}
                    onChange={(event) => setFeatureFilter(event.target.value)}
                  >
                    <option value="all">Tất cả tính năng</option>
                    <option value="group-matching">Chia nhóm</option>
                  </select>
                </label>
              </div>
            </section>

            {filteredSessions.length === 0 ? (
              <article className="content-card">
                <h2>Không có phiên phù hợp bộ lọc.</h2>
                <p>Hãy đổi bộ lọc để tìm đúng phiên bạn cần.</p>
              </article>
            ) : null}

            <div className="library-session-grid">
              {filteredSessions.map((session) => (
                <article key={session.id} className="content-card group-session-card library-session-card">
                  <div className="feature-top">
                    <span className="section-eyebrow">Chia nhóm</span>
                    <span className="feature-badge">{session.participants.length} SV</span>
                  </div>

                  <h2>
                    {session.className} · Code {session.classCode}
                  </h2>
                  <p>
                    Số nhóm: <strong>{session.groupCount}</strong>
                  </p>
                  <p className="library-round-line">
                    V�ng �p dụng: <strong>{formatRoundSummary(session.roundsEnabled)}</strong>
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
          </>
        )}
      </div>
    </main>
  );
}
