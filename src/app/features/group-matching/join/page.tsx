"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { findGroupMatchingSessionByCode, findGroupMatchingSessionByCodeAny } from "../../../../lib/group-matching";

export default function GroupMatchingJoinPage() {
  const router = useRouter();
  const [classCode, setClassCode] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const handleJoin = async () => {
    const normalizedCode = classCode.trim().toUpperCase();
    if (!normalizedCode) {
      setStatusMessage("Vui lòng nhập class code do Giảng viên cung cấp.");
      return;
    }

    const matchedSession =
      findGroupMatchingSessionByCode(normalizedCode) || (await findGroupMatchingSessionByCodeAny(normalizedCode));
    if (!matchedSession) {
      setStatusMessage("Code chưa đúng hoặc phiên chưa được tạo.");
      return;
    }

    setStatusMessage("");
    router.push(`/waiting?code=${encodeURIComponent(matchedSession.classCode)}`);
  };

  return (
    <main className="section-page">
      <div className="site-shell group-shell">
        <div className="section-head section-head-single">
          <div>
            <span className="section-eyebrow">Tham gia Chia nhóm</span>
            <h1>Nhập code để tham gia phiên game của lớp.</h1>
          </div>
          <p>
            Sau khi nhập đúng code, bạn sẽ đến khu vực sinh viên để chọn tên, tạo mật khẩu lần đầu và bấm
            Bắt đầu vào phòng chờ.
          </p>
        </div>

        <section className="group-form-card">
          <label className="field">
            <span>Class code</span>
            <input
              className="text-input"
              value={classCode}
              onChange={(event) => {
                setClassCode(event.target.value.toUpperCase());
                setStatusMessage("");
              }}
              placeholder="Ví dụ: A1B2C3"
            />
          </label>

          <div className="group-action-row">
            <button type="button" className="hero-primary" onClick={handleJoin}>
              Tham gia
            </button>
          </div>

          {statusMessage ? <p className="group-status-note">{statusMessage}</p> : null}
        </section>
      </div>
    </main>
  );
}
