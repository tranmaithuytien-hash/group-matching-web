"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getDemoSession } from "../../../../lib/auth-storage";
import { loadTopicSessionsByOwner, removeTopicSession, type TopicSession } from "../../../../lib/topic-picker";

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

export default function TopicPickerManagePage() {
  const [sessions, setSessions] = useState<TopicSession[]>([]);
  const [teacherEmail, setTeacherEmail] = useState("");

  const refresh = (email: string) => setSessions(loadTopicSessionsByOwner(email));

  useEffect(() => {
    const current = getDemoSession();
    const email = current?.email || "";
    setTeacherEmail(email);
    if (email) refresh(email);
  }, []);

  useEffect(() => {
    if (!teacherEmail) return;
    const handle = () => refresh(teacherEmail);
    const id = window.setInterval(handle, 1200);
    window.addEventListener("storage", handle);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", handle);
    };
  }, [teacherEmail]);

  const handleDelete = (sessionId: string) => {
    if (!window.confirm("B�n c� ch�c mu�n x�a phi�n ch�n ch� � n�y?")) return;
    removeTopicSession(sessionId);
    refresh(teacherEmail);
  };

  return (
    <main className="section-page">
      <div className="site-shell group-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Quản lý Topic Picker</span>
            <h1 className="group-manage-page-title">Danh s�ch phi�n lựa chọn chủ đề bạn đ� tạo.</h1>
          </div>
          <p>Bạn có thể điều khiển phiên, xem nhanh class code, sửa cấu hình hoặc xóa phiên.</p>
        </div>

        <div className="group-action-row">
          <Link href="/features/topic-picker/create" className="hero-primary">
            Tạo phiên mới
          </Link>
          <Link href="/features/topic-picker" className="hero-secondary">
            Về trang Topic Picker
          </Link>
        </div>

        {sessions.length === 0 ? (
          <article className="content-card">
            <h2>Bạn chưa có phiên nào.</h2>
            <p>H�y tạo phi�n mới để nhận class code v� bắt đầu điều khiển c�c v�ng chơi.</p>
          </article>
        ) : (
          <div className="content-grid group-manage-grid">
            {sessions.map((session) => (
              <article key={session.id} className="content-card group-session-card">
                <div className="feature-top">
                  <span className="section-eyebrow">Code: {session.classCode}</span>
                  <span className="feature-badge">{session.students.length} SV</span>
                </div>

                <h2>{session.className}</h2>
                <p>
                  Môn học: <strong>{session.subjectName}</strong>
                </p>
                <p>
                  Kiểu: <strong>{session.type}</strong>
                </p>
                <p>
                  Cấu trúc:{" "}
                  <strong>
                    {session.groupsOf2} nhóm 2 + {session.groupsOf3} nhóm 3
                  </strong>
                </p>
                <p className="hint-copy">Cập nhật: {formatTimeLabel(session.updatedAt)}</p>

                <div className="group-card-actions">
                  <Link href={`/features/topic-picker/manage/${session.classCode}`} className="hero-primary group-inline-action">
                    Điều khiển
                  </Link>
                  <Link href={`/features/topic-picker/manage/${session.classCode}/view`} className="hero-secondary">
                    Xem
                  </Link>
                  <Link href={`/features/topic-picker/create?edit=${session.id}`} className="hero-secondary">
                    Sửa
                  </Link>
                  <button type="button" className="hero-secondary group-danger" onClick={() => handleDelete(session.id)}>
                    Xóa
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

