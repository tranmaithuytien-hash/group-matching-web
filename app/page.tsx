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

                  <button className="google-auth-image-button" onClick={handleTeacherGoogleAuth}>
                    <img src="/google-signin-button.png" alt="Sign in with Google" />
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
