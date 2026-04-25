"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { activeClassIdKey, classDocRef } from "../lib/classHelpers";

export default function HomePage() {
  const router = useRouter();
  const [studentCode, setStudentCode] = useState("");
  const [teacherMode, setTeacherMode] = useState<"login" | "register">("login");
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [teacherConfirmPassword, setTeacherConfirmPassword] = useState("");
  const [isTeacherSignedIn, setIsTeacherSignedIn] = useState(false);
  const [studentMessage, setStudentMessage] = useState("");
  const [teacherMessage, setTeacherMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsTeacherSignedIn(Boolean(user));
    });

    return () => unsubscribe();
  }, []);

  const handleStudentEnter = async () => {
    const normalizedCode = studentCode.trim();

    if (!normalizedCode) {
      setStudentMessage("Vui lòng nhập code lớp.");
      return;
    }

    const snapshot = await getDoc(classDocRef(normalizedCode));

    if (!snapshot.exists()) {
      setStudentMessage("Code lớp không tồn tại hoặc đã bị xóa.");
      return;
    }

    localStorage.setItem(activeClassIdKey(), normalizedCode);
    router.push(`/class/${normalizedCode}`);
  };

  const upsertTeacherProfile = async (user: User, preferredName?: string) => {
    const displayName = preferredName?.trim() || user.displayName || user.email || "Giảng viên";

    await setDoc(
      doc(db, "teachers", user.uid),
      {
        uid: user.uid,
        email: user.email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  };

  const handleTeacherAuth = async () => {
    if (!teacherEmail || !teacherPassword) {
      setTeacherMessage("Vui lòng nhập email và mật khẩu Giảng viên.");
      return;
    }

    if (teacherMode === "register") {
      if (!teacherName.trim()) {
        setTeacherMessage("Vui lòng nhập tên Giảng viên.");
        return;
      }

      if (!teacherConfirmPassword) {
        setTeacherMessage("Vui lòng nhập lại mật khẩu.");
        return;
      }

      if (teacherPassword !== teacherConfirmPassword) {
        setTeacherMessage("Mật khẩu xác nhận không khớp.");
        return;
      }
    }

    setTeacherMessage("");

    try {
      if (teacherMode === "register") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          teacherEmail.trim(),
          teacherPassword
        );

        await upsertTeacherProfile(credential.user, teacherName.trim());
      } else {
        const credential = await signInWithEmailAndPassword(
          auth,
          teacherEmail.trim(),
          teacherPassword
        );

        await upsertTeacherProfile(credential.user);
      }

      router.push("/admin");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Không thể xác thực Giảng viên.";
      setTeacherMessage(nextMessage);
    }
  };

  const handleTeacherGoogleAuth = async () => {
    setTeacherMessage("");

    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(auth, provider);
      await upsertTeacherProfile(credential.user);
      router.push("/admin");
    } catch (error) {
      const nextMessage =
        error instanceof Error
          ? error.message
          : "Không thể đăng nhập Giảng viên bằng Google.";
      setTeacherMessage(nextMessage);
    }
  };

  return (
    <main className="page-shell">
      <section className="card card-wide">
        <span className="eyebrow">Ứng dụng chia nhóm</span>
        <h1>Group Matching App</h1>
        <p className="lead">
          Sinh viên vào bằng code lớp, còn Giảng viên đăng nhập để tạo và quản lý lớp.
        </p>

        <div className="panel-grid">
          <div className="status-box">
            <p className="status-label">Lối vào Sinh viên</p>
            <label className="field">
              <span>Nhập code lớp</span>
              <input
                className="text-input"
                value={studentCode}
                onChange={(event) => {
                  setStudentCode(event.target.value);
                  setStudentMessage("");
                }}
                placeholder="Ví dụ: ABC123"
              />
            </label>
            <button className="primary-button" onClick={handleStudentEnter}>
              Vào lớp bằng code
            </button>
            {studentMessage ? <p className="lead">{studentMessage}</p> : null}
          </div>

          <div className="status-box">
            <p className="status-label">Lối vào Giảng viên</p>

            {isTeacherSignedIn ? (
              <>
                <p className="status-value">Giảng viên</p>
                <p className="muted-text">
                  Phiên đăng nhập Giảng viên đang hoạt động. Bạn có thể tiếp tục quản lý các
                  lớp đã tạo.
                </p>
                <button className="secondary-button" onClick={() => router.push("/admin")}>
                  Vào trang quản lý lớp
                </button>
              </>
            ) : (
              <>
                {teacherMode === "register" ? (
                  <label className="field">
                    <span>Tên Giảng viên</span>
                    <input
                      className="text-input"
                      value={teacherName}
                      onChange={(event) => setTeacherName(event.target.value)}
                    />
                  </label>
                ) : null}

                <label className="field">
                  <span>Email Giảng viên</span>
                  <input
                    className="text-input"
                    type="email"
                    value={teacherEmail}
                    onChange={(event) => setTeacherEmail(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Mật khẩu Giảng viên</span>
                  <input
                    className="text-input"
                    type="password"
                    value={teacherPassword}
                    onChange={(event) => setTeacherPassword(event.target.value)}
                  />
                </label>

                {teacherMode === "register" ? (
                  <label className="field">
                    <span>Nhập lại mật khẩu</span>
                    <input
                      className="text-input"
                      type="password"
                      value={teacherConfirmPassword}
                      onChange={(event) => setTeacherConfirmPassword(event.target.value)}
                    />
                  </label>
                ) : null}

                <div className="button-stack">
                  <button className="teacher-submit-button" onClick={handleTeacherAuth}>
                    {teacherMode === "register"
                      ? "Tạo tài khoản Giảng viên"
                      : "Đăng nhập"}
                  </button>

                  <p className="teacher-switch-text">
                    {teacherMode === "register" ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
                    <button
                      type="button"
                      className="teacher-inline-link"
                      onClick={() => {
                        setTeacherMode(teacherMode === "register" ? "login" : "register");
                        setTeacherMessage("");
                      }}
                    >
                      {teacherMode === "register" ? "Đăng nhập" : "Tạo tài khoản"}
                    </button>
                  </p>

                  <div className="teacher-auth-divider">
                    <span />
                    <strong>OR</strong>
                    <span />
                  </div>

                  <button className="google-auth-button" onClick={handleTeacherGoogleAuth}>
                    <span className="google-auth-icon" aria-hidden="true">
                      <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                        <path
                          fill="#FFC107"
                          d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.263 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.851 1.154 7.961 3.039l5.657-5.657C34.053 6.053 29.277 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
                        />
                        <path
                          fill="#FF3D00"
                          d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 12 24 12c3.059 0 5.851 1.154 7.961 3.039l5.657-5.657C34.053 6.053 29.277 4 24 4c-7.682 0-14.41 4.337-17.694 10.691z"
                        />
                        <path
                          fill="#4CAF50"
                          d="M24 44c5.176 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.152 35.091 26.676 36 24 36c-5.242 0-9.617-3.316-11.283-7.946l-6.522 5.025C9.439 39.556 16.201 44 24 44z"
                        />
                        <path
                          fill="#1976D2"
                          d="M43.611 20.083H42V20H24v8h11.303a12.05 12.05 0 0 1-4.084 5.571l.003-.002 6.19 5.238C36.974 39.21 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
                        />
                      </svg>
                    </span>
                    <span>Đăng nhập bằng Google</span>
                  </button>
                </div>

                {teacherMessage ? <p className="lead">{teacherMessage}</p> : null}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
