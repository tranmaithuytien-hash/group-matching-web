"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TeacherAuthGuard } from "../../../../../../components/teacher-auth-guard";
import { getTopicSessionByRouteKey, type TopicSession } from "../../../../../../lib/topic-picker";

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

export default function TopicPickerResultPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = Array.isArray(params?.sessionId) ? params.sessionId[0] : params?.sessionId || "";
  const [session, setSession] = useState<TopicSession | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const refresh = () => setSession(getTopicSessionByRouteKey(sessionId));
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  const sortedFinalGroups = useMemo(() => {
    if (!session) return [];
    return [...(session.finalGroups || [])].sort((a, b) => a.id.localeCompare(b.id));
  }, [session]);

  if (!session) {
    return (
      <TeacherAuthGuard>
        <main className="section-page">
          <div className="site-shell group-shell">
            <section className="content-card">
              <h2>Không tìm thấy phiên.</h2>
              <Link href="/features/topic-picker/manage" className="hero-secondary">
                Về danh sách phiên
              </Link>
            </section>
          </div>
        </main>
      </TeacherAuthGuard>
    );
  }

  return (
    <TeacherAuthGuard>
      <main className="section-page">
        <div className="site-shell group-shell">
          <div className="section-head section-head-single">
            <div>
              <span className="section-eyebrow">Trang kết quả</span>
              <h1>
                {session.subjectName} - {session.className}
              </h1>
            </div>
            <p>
              Code: {session.classCode} | Kiểu {session.type} | Trạng thái: {toStatusLabel(session.status)}
            </p>
          </div>

          <div className="group-action-row">
            <Link href={`/features/topic-picker/manage/${session.classCode}`} className="hero-secondary">
              Về điều khiển phiên
            </Link>
            <Link href={`/features/topic-picker/manage/${session.classCode}/view`} className="hero-secondary">
              Xem danh sách sinh viên
            </Link>
          </div>

          <section className="content-card">
            <h2>Kết quả phân nhóm và chủ đề</h2>
            {session.type === 2 ? (
              <div className="group-round1-result-list" style={{ marginTop: 12 }}>
                {session.topics.map((topic) => {
                  const memberIds = session.topic2RoomMembers?.[topic] || [];
                  const members = memberIds
                    .map((id) => session.students.find((s) => s.studentId === id)?.fullName || id)
                    .filter(Boolean);
                  const locked = (session.topic2LockedTopics || []).includes(topic);
                  return (
                    <article key={topic} className={locked ? "group-round1-result leader" : "group-round1-result"}>
                      <span>
                        {topic} · {locked ? "Đã ch�t" : "Đang m�x"}
                      </span>
                      <small>{members.length > 0 ? members.join(", ") : "Chưa có sinh viên"}</small>
                    </article>
                  );
                })}
              </div>
            ) : sortedFinalGroups.length > 0 ? (
              <div className="group-round1-result-list" style={{ marginTop: 12 }}>
                {sortedFinalGroups.map((group) => (
                  <article key={group.id} className="group-round1-result leader">
                    <span>
                      {group.id} · {group.topic}
                    </span>
                    <small>{group.memberNames.join(", ")}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="hint-copy" style={{ marginTop: 10 }}>
                Chưa có kết quả để hiển thị. Hãy chạy các bước điều khiển phiên trước.
              </p>
            )}
          </section>
        </div>
      </main>
    </TeacherAuthGuard>
  );
}


