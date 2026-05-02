"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import {
  DEMO_SESSION_KEY,
  findTeacherAccountByEmail,
  registerTeacherAccount,
  verifyTeacherCredentials
} from "../../lib/auth-storage";
import { auth, isFirebaseReady } from "../../lib/firebase";

function GoogleLogo() {
  return (
    <span className="google-mark" aria-hidden="true">
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
  );
}

function PolicyNote() {
  return (
    <p className="policy-note policy-note-strong">
      Bằng việc đăng nhập, bạn chấp nhận <Link href="/terms">Điều khoản sử dụng</Link> và{" "}
      <Link href="/privacy">Ch�nh s�ch bảo mật</Link> của ch�ng t�i.
    </p>
  );
}

function RequiredMark() {
  return <span className="required-mark">*</span>;
}

function AuthNotice({
  notice
}: {
  notice: { type: "error" | "success"; message: string } | null;
}) {
  if (!notice) {
    return null;
  }

  return (
    <p className={notice.type === "error" ? "auth-notice auth-notice-error" : "auth-notice auth-notice-success"}>
      <span>{notice.type === "error" ? "L�i:" : "Th�ng b�o:"}</span> {notice.message}
    </p>
  );
}

function saveSession({
  email,
  name,
  role,
  provider,
  organization,
  password,
  avatarUrl
}: {
  email: string;
  name?: string;
  role: "teacher" | "student";
  provider: "google" | "password";
  organization?: string;
  password?: string;
  avatarUrl?: string;
}) {
  window.localStorage.setItem(
    DEMO_SESSION_KEY,
    JSON.stringify({
      email,
      name,
      role,
      provider,
      organization,
      password,
      avatarUrl
    })
  );

  window.dispatchEvent(new Event("marveclass-auth-changed"));
}

export default function LoginPage() {
  const [teacherMode, setTeacherMode] = useState<"login" | "register">("login");
  const [activeRole, setActiveRole] = useState<"teacher" | "student">("teacher");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [teacherConfirmPassword, setTeacherConfirmPassword] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [teacherOrganization, setTeacherOrganization] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [authNotice, setAuthNotice] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  const clearNotice = () => {
    setAuthNotice(null);
  };

  const setErrorNotice = (message: string) => {
    setAuthNotice({
      type: "error",
      message
    });
  };

  const setSuccessNotice = (message: string) => {
    setAuthNotice({
      type: "success",
      message
    });
  };

  const getRedirectPath = () => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");

    if (!redirect || !redirect.startsWith("/")) {
      return null;
    }

    return redirect;
  };

  const getTeacherRedirect = () => {
    const redirect = getRedirectPath();

    if (!redirect || redirect.startsWith("/features/student")) {
      return "/dashboard";
    }

    return redirect;
  };

  const getStudentRedirect = () => {
    const redirect = getRedirectPath();

    if (!redirect) {
      return "/library";
    }

    if (redirect.startsWith("/features/student")) {
      return redirect;
    }

    return "/library";
  };

  useEffect(() => {
    const redirect = getRedirectPath();

    if (redirect?.startsWith("/features/student")) {
      setActiveRole("student");
    }
  }, []);

  const executeGoogleLogin = async () => {
    if (!isFirebaseReady || !auth) {
      setErrorNotice("Đăng nhập Google chưa được cấu hình đầy đủ. Vui lòng kiểm tra Firebase ENV.");
      return null;
    }

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const email = result.user.email?.trim().toLowerCase();
      if (!email) {
        setErrorNotice("Kh�ng lấy được email từ t�i khoản Google. Vui l�ng thử t�i khoản kh�c.");
        return null;
      }

      return {
        email,
        name: result.user.displayName?.trim() || email.split("@")[0],
        avatarUrl: result.user.photoURL || ""
      };
    } catch (error) {
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : "";
      if (errorCode === "auth/popup-closed-by-user") {
        setErrorNotice("Bạn đã đóng popup đăng nhập Google.");
        return null;
      }
      if (errorCode === "auth/popup-blocked") {
        setErrorNotice("Popup Google bị chặn. Vui lòng cho phép popup và thử lại.");
        return null;
      }
      setErrorNotice("Không thể đăng nhập bằng Google lúc này. Vui lòng thử lại.");
      return null;
    }
  };

  const handleTeacherLogin = () => {
    clearNotice();
    if (!teacherEmail.trim() || !teacherPassword.trim()) {
      setErrorNotice("Vui lòng nhập email và mật khẩu Giảng viên.");
      return;
    }

    const account = verifyTeacherCredentials(teacherEmail, teacherPassword);
    if (!account) {
      setErrorNotice("Email hoặc mật khẩu chưa đúng, hoặc tài khoản chưa được đăng ký.");
      return;
    }

    saveSession({
      email: account.email,
      name: account.name || teacherName.trim() || account.email.split("@")[0],
      role: "teacher",
      provider: "password",
      organization: account.organization || "",
      password: account.password
    });

    window.location.assign(getTeacherRedirect());
  };

  const handleTeacherRegister = () => {
    clearNotice();
    if (!teacherEmail.trim() || !teacherPassword.trim() || !teacherConfirmPassword.trim()) {
      setErrorNotice("Vui lòng nhập đầy đủ email và mật khẩu để tạo tài khoản.");
      return;
    }

    if (teacherPassword !== teacherConfirmPassword) {
      setErrorNotice("Mật khẩu x�c nhận chưa khớp.");
      return;
    }

    const registerResult = registerTeacherAccount({
      email: teacherEmail.trim(),
      password: teacherPassword.trim(),
      name: teacherName.trim(),
      organization: teacherOrganization.trim()
    });
    if (!registerResult.ok) {
      setErrorNotice(registerResult.error);
      return;
    }

    saveSession({
      email: registerResult.account.email,
      name: registerResult.account.name || teacherName.trim() || teacherEmail.trim().split("@")[0],
      role: "teacher",
      provider: "password",
      organization: registerResult.account.organization || "",
      password: registerResult.account.password
    });

    window.location.assign(getTeacherRedirect());
  };

  const handleTeacherGoogle = async () => {
    clearNotice();
    const googleProfile = await executeGoogleLogin();
    if (!googleProfile) {
      return;
    }
    const { email, name, avatarUrl } = googleProfile;
    setTeacherEmail(email);
    if (name) {
      setTeacherName(name);
    }

    let account = findTeacherAccountByEmail(email);
    if (!account) {
      const autoRegister = registerTeacherAccount({
        email,
        password: `google-${Date.now()}`,
        name: name || teacherName.trim(),
        organization: teacherOrganization.trim()
      });

      if (autoRegister.ok) {
        account = autoRegister.account;
      } else {
        account = findTeacherAccountByEmail(email);
      }
    }

    if (!account) {
      setErrorNotice("Không thể đăng nhập bằng Google lúc này. Vui lòng thử lại.");
      return;
    }

    saveSession({
      email: account.email,
      name: account.name || name || teacherName.trim() || account.email.split("@")[0],
      role: "teacher",
      provider: "google",
      organization: account.organization || "",
      password: account.password,
      avatarUrl
    });

    window.location.assign(getTeacherRedirect());
  };

  const handleStudentGoogle = async () => {
    clearNotice();
    const googleProfile = await executeGoogleLogin();
    if (!googleProfile) {
      return;
    }

    saveSession({
      email: googleProfile.email,
      name: googleProfile.name,
      role: "student",
      provider: "google",
      avatarUrl: googleProfile.avatarUrl
    });

    window.location.assign(getStudentRedirect());
  };

  const handleForgotPassword = () => {
    clearNotice();
    if (!recoveryEmail.trim()) {
      setErrorNotice("Vui lòng nhập email để nhận liên kết khôi phục.");
      return;
    }

    const account = findTeacherAccountByEmail(recoveryEmail);
    if (!account) {
      setErrorNotice("Email này chưa tồn tại trong hệ thống.");
      return;
    }

    setSuccessNotice(`Đã gửi email khôi phục tới ${recoveryEmail}.`);
    setShowRecovery(false);
  };

  return (
    <main className="auth-page">
      <div className="site-shell auth-layout auth-layout-split">
        <section className="auth-intro auth-intro-panel">
          <span className="section-eyebrow">MarveClass Access</span>
          <h1 className="login-title">
            <span>Đăng nhập</span>
            <small>để truy cập vào nhiều tính năng hơn</small>
          </h1>
        </section>

        <section className="auth-side-panel">
          <div className="role-tabs-attached">
            <button
              type="button"
              className={activeRole === "teacher" ? "role-tab attached active" : "role-tab attached"}
              onClick={() => setActiveRole("teacher")}
            >
              Giảng viên
            </button>
            <button
              type="button"
              className={activeRole === "student" ? "role-tab attached active" : "role-tab attached"}
              onClick={() => setActiveRole("student")}
            >
              Sinh viên
            </button>
          </div>

          <div className="auth-card auth-side-card">
            {activeRole === "teacher" ? (
              <>
                {teacherMode === "login" ? (
                  <>
                    <label className="field">
                      <span>
                        Email <RequiredMark />
                      </span>
                      <input
                        className="text-input"
                        type="email"
                        value={teacherEmail}
                        onChange={(event) => setTeacherEmail(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleTeacherLogin();
                          }
                        }}
                        placeholder="name@school.edu.vn"
                      />
                    </label>

                    <label className="field">
                      <span>
                        Mật khẩu <RequiredMark />
                      </span>
                      <input
                        className="text-input"
                        type="password"
                        value={teacherPassword}
                        onChange={(event) => setTeacherPassword(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleTeacherLogin();
                          }
                        }}
                        placeholder="Nhập mật khẩu"
                      />
                    </label>

                    <div className="auth-action-stack">
                      <button
                        type="button"
                        className="text-link-button"
                        onClick={() => {
                          setRecoveryEmail(teacherEmail);
                          setShowRecovery((current) => !current);
                        }}
                      >
                        Qu�n m�t kh�u?
                      </button>

                      {showRecovery ? (
                        <div className="recovery-panel">
                          <label className="field">
                            <span>Email khôi phục</span>
                            <input
                              className="text-input"
                              type="email"
                              value={recoveryEmail}
                              onChange={(event) => setRecoveryEmail(event.target.value)}
                              placeholder="Nhập email để nhận liên kết khôi phục"
                            />
                          </label>
                          <button className="teacher-button" type="button" onClick={handleForgotPassword}>
                            Gửi email khôi phục
                          </button>
                        </div>
                      ) : null}

                      <AuthNotice notice={authNotice} />

                      <button className="teacher-button" type="button" onClick={handleTeacherLogin}>
                        Đăng nhập
                      </button>

                      <p className="auth-switch-copy auth-switch-copy-spaced">
                        Ch�a c� t�i kho�n?{" "}
                        <button
                          type="button"
                          className="inline-action"
                          onClick={() => {
                            setTeacherMode("register");
                            setShowRecovery(false);
                          }}
                        >
                          Đăng ký
                        </button>
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="field">
                      <span>
                        Email <RequiredMark />
                      </span>
                      <input
                        className="text-input"
                        type="email"
                        value={teacherEmail}
                        onChange={(event) => setTeacherEmail(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleTeacherRegister();
                          }
                        }}
                        placeholder="name@school.edu.vn"
                      />
                    </label>

                    <label className="field">
                      <span>Họ và tên</span>
                      <input
                        className="text-input"
                        type="text"
                        value={teacherName}
                        onChange={(event) => setTeacherName(event.target.value)}
                        placeholder="Nhập họ và tên"
                      />
                    </label>

                    <label className="field">
                      <span>Đơn vị c�ng t�c</span>
                      <input
                        className="text-input"
                        type="text"
                        value={teacherOrganization}
                        onChange={(event) => setTeacherOrganization(event.target.value)}
                        placeholder="Nhập đơn vị c�ng t�c"
                      />
                    </label>

                    <label className="field">
                      <span>
                        Mật khẩu <RequiredMark />
                      </span>
                      <input
                        className="text-input"
                        type="password"
                        value={teacherPassword}
                        onChange={(event) => setTeacherPassword(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleTeacherRegister();
                          }
                        }}
                        placeholder="Nhập mật khẩu"
                      />
                    </label>

                    <label className="field">
                      <span>
                        Nhập lại mật khẩu <RequiredMark />
                      </span>
                      <input
                        className="text-input"
                        type="password"
                        value={teacherConfirmPassword}
                        onChange={(event) => setTeacherConfirmPassword(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleTeacherRegister();
                          }
                        }}
                        placeholder="Nhập lại mật khẩu"
                      />
                    </label>

                    <div className="auth-action-stack">
                      <AuthNotice notice={authNotice} />

                      <button className="teacher-button" type="button" onClick={handleTeacherRegister}>
                        Tạo tài khoản
                      </button>

                      <p className="auth-switch-copy auth-switch-copy-spaced">
                        � c� t�i kho�n?{" "}
                        <button
                          type="button"
                          className="inline-action"
                          onClick={() => setTeacherMode("login")}
                        >
                          Đăng nhập
                        </button>
                      </p>
                    </div>
                  </>
                )}

                <div className="auth-divider compact-divider">
                  <span />
                  <strong>hoặc</strong>
                  <span />
                </div>

                <button
                  className="google-button google-button-top"
                  type="button"
                  onClick={handleTeacherGoogle}
                >
                  <GoogleLogo />
                  Đăng nhập bằng Google
                </button>

                <PolicyNote />
              </>
            ) : (
              <>
                <AuthNotice notice={authNotice} />

                <button
                  className="google-button google-button-top student-google-button"
                  type="button"
                  onClick={handleStudentGoogle}
                >
                  <GoogleLogo />
                  Đăng nhập bằng Google
                </button>

                <PolicyNote />
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
