"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadLearningMaterialsByTeacher, type LearningMaterial } from "../../../../../../lib/learning-materials";
import { getTopicSessionByRouteKey, type TopicSession } from "../../../../../../lib/topic-picker";

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

function materialPreviewText(material: LearningMaterial | null) {
  if (!material) return "Không có mô tả.";
  if (material.description?.trim()) return material.description.trim();
  if (material.attachments?.[0]) return `T?p: ${material.attachments[0].name}`;
  if (material.externalUrl) return `Link: ${material.externalUrl}`;
  return "Không có mô tả.";
}

export default function TopicPickerSessionViewPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId;
  const [session, setSession] = useState<TopicSession | null>(null);
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);

  useEffect(() => {
    const refresh = () => {
      if (!sessionId) {
        setSession(null);
        return;
      }
      const nextSession = getTopicSessionByRouteKey(sessionId);
      setSession(nextSession);
      if (nextSession?.ownerTeacherEmail) {
        setMaterials(loadLearningMaterialsByTeacher(nextSession.ownerTeacherEmail));
      }
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
    if (!session) return [];
    return [...(session.actionLogs || [])].sort((a, b) => b.at - a.at);
  }, [session]);

  const materialMap = useMemo(() => {
    const map = new Map<string, LearningMaterial>();
    if (!session) return map;

    materials
      .filter((m) => m.category === "presentation-topic")
      .filter((m) => m.courseCode === session.subjectName)
      .forEach((m) => {
        map.set(m.title, m);
      });

    return map;
  }, [materials, session]);

  if (!session) {
    return (
      <main className="section-page">
        <div className="site-shell group-shell">
          <article className="content-card">
            <h2>Không tìm thấy phiên</h2>
            <p>Phiên này không tồn tại hoặc đã bị xóa.</p>
            <Link href="/features/topic-picker/manage" className="hero-secondary inline-cta">
              Về trang quản lý
            </Link>
          </article>
        </div>
      </main>
    );
  }

  return (
    <main className="section-page">
      <div className="site-shell group-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Xem phiên Topic Picker</span>
            <h1>{session.className}</h1>
          </div>
          <p>
            Class code: <strong>{session.classCode}</strong> ? Tr?ng th?i: <strong>{session.status}</strong>
          </p>
        </div>

        <div className="group-action-row">
          <Link href={`/features/topic-picker/manage/${session.classCode}`} className="hero-primary">
            Điều khiển
          </Link>
          <Link href="/features/topic-picker/manage" className="hero-secondary">
            V? danh s?ch phi?n
          </Link>
        </div>

        <div className="group-view-split">
          <article className="content-card">
            <h2>Danh s?ch sinh vi?n</h2>
            <div className="group-student-list">
              {session.students.map((student, index) => (
                <div key={student.studentId} className="group-student-item">
                  <span>{index + 1}. {student.fullName}</span>
                  <small>{student.studentId}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="content-card">
            <h2>Chủ đề trong phiên ({session.topics.length})</h2>
            <div className="group-log-list">
              {session.topics.map((topic) => {
                const material = materialMap.get(topic) || null;
                const attachment = material?.attachments?.[0];
                return (
                  <div key={topic} className="group-log-item">
                    <strong>{topic}</strong>
                    <span>{materialPreviewText(material)}</span>
                    {attachment?.dataUrl && attachment.type.startsWith("image/") ? (
                      <img src={attachment.dataUrl} alt={attachment.name} style={{ marginTop: 6, maxHeight: 90, borderRadius: 8 }} />
                    ) : null}
                    {attachment && !attachment.type.startsWith("image/") ? <small>Mini preview: {attachment.name}</small> : null}
                  </div>
                );
              })}
            </div>
          </article>
        </div>

        <article className="content-card" style={{ marginTop: 16 }}>
          <h2>L?ch s? t?c ??ng</h2>
          {sortedLogs.length > 0 ? (
            <div className="group-log-list">
              {sortedLogs.map((entry, index) => (
                <div key={`${entry.at}-${index}`} className="group-log-item">
                  <strong>{entry.action}</strong>
                  {entry.detail ? <span>{entry.detail}</span> : null}
                  <small>{formatTimeLabel(entry.at)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint-copy">Ch?a c? log t?c ??ng.</p>
          )}
        </article>
      </div>
    </main>
  );
}
