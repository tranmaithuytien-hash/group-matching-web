"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getDemoSession } from "../../lib/auth-storage";
import {
  formatRoundSummary,
  loadGroupMatchingSessionsByOwner,
  loadGroupMatchingSessionsByOwnerAny,
  migrateLegacySessionsToOwner,
  removeGroupMatchingSession,
  type GroupMatchingSession
} from "../../lib/group-matching";
import {
  loadTopicSessionsByOwner,
  loadTopicSessionsByOwnerAny,
  removeTopicSession,
  type TopicSession
} from "../../lib/topic-picker";

type LibraryFeatureKey = "group-matching" | "topic-picker";

type LibraryItem = {
  id: string;
  className: string;
  classCode: string;
  updatedAt: number;
  createdAt: number;
  studentCount: number;
  featureKey: LibraryFeatureKey;
  featureLabel: string;
  summaryLine: string;
  statusLine: string;
  manageHref: string;
  viewHref: string;
  editHref: string;
};

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

function toTopicTypeLabel(type: number) {
  if (type === 1) return "Kiểu 1 · Đấu giá chủ đề";
  if (type === 2) return "Kiểu 2 · Tự chọn phòng";
  return "Kiểu 3 · Random hoàn toàn";
}

export default function LibraryPage() {
  const router = useRouter();
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [groupSessions, setGroupSessions] = useState<GroupMatchingSession[]>([]);
  const [topicSessions, setTopicSessions] = useState<TopicSession[]>([]);
  const [classFilter, setClassFilter] = useState("all");
  const [featureFilter, setFeatureFilter] = useState<"all" | LibraryFeatureKey>("all");

  const refresh = async (email: string, name: string) => {
    if (!email) {
      setGroupSessions([]);
      setTopicSessions([]);
      return;
    }
    migrateLegacySessionsToOwner(email, name);
    const groupLocal = loadGroupMatchingSessionsByOwner(email);
    if (groupLocal.length > 0) {
      setGroupSessions(groupLocal);
    } else {
      const groupCloud = await loadGroupMatchingSessionsByOwnerAny(email);
      setGroupSessions(groupCloud);
    }
    const topicLocal = loadTopicSessionsByOwner(email);
    if (topicLocal.length > 0) {
      setTopicSessions(topicLocal);
      return;
    }
    const topicCloud = await loadTopicSessionsByOwnerAny(email);
    setTopicSessions(topicCloud);
  };

  useEffect(() => {
    const activeSession = getDemoSession();
    const isTeacher = activeSession?.role === "teacher";
    const email = isTeacher ? activeSession?.email || "" : "";
    const name = isTeacher ? activeSession?.name || "" : "";

    setTeacherEmail(email);
    setTeacherName(name);
    void refresh(email, name);
  }, []);

  useEffect(() => {
    if (!teacherEmail) return;

    const reload = () => {
      void refresh(teacherEmail, teacherName);
    };
    const intervalId = window.setInterval(reload, 1500);
    window.addEventListener("storage", reload);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", reload);
    };
  }, [teacherEmail, teacherName]);

  const sessionItems = useMemo<LibraryItem[]>(() => {
    const groupItems: LibraryItem[] = groupSessions.map((session) => ({
      id: session.id,
      className: session.className,
      classCode: session.classCode,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
      studentCount: session.participants.length,
      featureKey: "group-matching",
      featureLabel: "Chia nhóm",
      summaryLine: `Số nhóm: ${session.groupCount}`,
      statusLine: `Vòng áp dụng: ${formatRoundSummary(session.roundsEnabled)}`,
      manageHref: `/features/group-matching/manage/${session.id}`,
      viewHref: `/features/group-matching/manage/${session.id}/view`,
      editHref: `/features/group-matching/create?edit=${session.id}`
    }));

    const topicItems: LibraryItem[] = topicSessions.map((session) => ({
      id: session.id,
      className: session.className,
      classCode: session.classCode,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
      studentCount: session.students.length,
      featureKey: "topic-picker",
      featureLabel: "Topic Picker",
      summaryLine: toTopicTypeLabel(session.type),
      statusLine: `Cấu trúc: ${session.groupsOf2} nhóm 2 + ${session.groupsOf3} nhóm 3`,
      manageHref: `/features/topic-picker/manage/${session.classCode}`,
      viewHref: `/features/topic-picker/manage/${session.classCode}/view`,
      editHref: `/features/topic-picker/create?edit=${session.id}`
    }));

    return [...groupItems, ...topicItems].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [groupSessions, topicSessions]);

  const classOptions = useMemo(() => {
    return Array.from(new Set(sessionItems.map((session) => session.className).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "vi")
    );
  }, [sessionItems]);

  const filteredSessions = useMemo(() => {
    return sessionItems.filter((session) => {
      const matchClass = classFilter === "all" ? true : session.className === classFilter;
      const matchFeature = featureFilter === "all" ? true : session.featureKey === featureFilter;
      return matchClass && matchFeature;
    });
  }, [sessionItems, classFilter, featureFilter]);

  const handleDelete = (item: LibraryItem) => {
    const confirmed = window.confirm(`Bạn có chắc muốn xóa phiên ${item.featureLabel} với class code "${item.classCode}"?`);
    if (!confirmed) return;

    if (item.featureKey === "group-matching") {
      removeGroupMatchingSession(item.id);
      setGroupSessions(loadGroupMatchingSessionsByOwner(teacherEmail));
      return;
    }

    removeTopicSession(item.id);
    setTopicSessions(loadTopicSessionsByOwner(teacherEmail));
  };

  return (
    <main className="section-page">
      <div className="site-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Thư viện</span>
            <h1 className="library-page-title">Kho tổng hợp tất cả phiên game và tính năng đã tạo.</h1>
          </div>
          <p>Bạn có thể xem, lọc và quản lý toàn bộ phiên đã tạo ở tất cả game/tính năng tại đây.</p>
        </div>

        {sessionItems.length === 0 ? (
          <article className="content-card">
            <h2>Bạn chưa có phiên nào trong thư viện.</h2>
            <p>
              Đây là khu tổng hợp tất cả phiên đã tạo của mọi game/tính năng. Hãy bắt đầu tại{" "}
              <Link href="/features/group-matching/create">Tạo mới Chia nhóm</Link> hoặc{" "}
              <Link href="/features/topic-picker/create">Tạo mới Topic Picker</Link>.
            </p>
          </article>
        ) : (
          <>
            <div className="library-layout">
              <aside className="content-card library-filter-sidebar">
                <div className="library-filter-head">
                  <h2>Bộ lọc</h2>
                  <small>{filteredSessions.length} kết quả</small>
                </div>
                <label className="field">
                  <span>Lọc theo lớp</span>
                  <select className="text-input" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
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
                    onChange={(event) => setFeatureFilter(event.target.value as "all" | LibraryFeatureKey)}
                  >
                    <option value="all">Tất cả tính năng</option>
                    <option value="group-matching">Chia nhóm</option>
                    <option value="topic-picker">Topic Picker</option>
                  </select>
                </label>
              </aside>

              <section>
                {filteredSessions.length === 0 ? (
                  <article className="content-card">
                    <h2>Không có phiên phù hợp bộ lọc.</h2>
                    <p>Hãy đổi bộ lọc để tìm đúng phiên bạn cần.</p>
                  </article>
                ) : null}

                <div className="library-session-grid library-session-grid-two">
                  {filteredSessions.map((item) => (
                    <article key={`${item.featureKey}-${item.id}`} className="content-card group-session-card library-session-card">
                      <div className="feature-top">
                        <span className="section-eyebrow">{item.featureLabel}</span>
                        <span className="feature-badge">{item.studentCount} SV</span>
                      </div>

                      <h2>
                        {item.className} · Code {item.classCode}
                      </h2>
                      <p>
                        {item.summaryLine}
                      </p>
                      <p className="library-round-line">
                        {item.statusLine}
                      </p>
                      <p className="hint-copy">Cập nhật: {formatTimeLabel(item.updatedAt)}</p>

                      <div className="group-card-actions">
                        <button type="button" className="hero-primary group-inline-action" onClick={() => router.push(item.manageHref)}>
                          Điều khiển
                        </button>
                        <Link href={item.viewHref} className="hero-secondary">
                          Xem
                        </Link>
                        <Link href={item.editHref} className="hero-secondary">
                          Sửa
                        </Link>
                        <button type="button" className="hero-secondary group-danger" onClick={() => handleDelete(item)}>
                          Xóa
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
