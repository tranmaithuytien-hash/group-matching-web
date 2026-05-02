"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DEMO_SESSION_KEY, type DemoSession, updateTeacherAccount } from "../../lib/auth-storage";
const MAX_AVATAR_SIZE = 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png"];

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) {
    return email;
  }

  if (local.length <= 3) {
    return `${local[0] ?? "*"}***@${domain}`;
  }

  return `${local.slice(0, 2)}********@${domain}`;
}

export default function AccountPage() {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [session, setSession] = useState<DemoSession | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [organization, setOrganization] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"idle" | "error" | "success">("idle");

  useEffect(() => {
    const raw = window.localStorage.getItem(DEMO_SESSION_KEY);

    if (!raw) {
      router.replace("/login?redirect=%2Faccount");
      return;
    }

    try {
      const parsed = JSON.parse(raw) as DemoSession;
      setSession(parsed);
      setDisplayName(parsed.name || parsed.email.split("@")[0]);
      setOrganization(parsed.organization || "");
      setGender(parsed.gender || "");
      setBirthDate(parsed.birthDate || "");
      setAvatarUrl(parsed.avatarUrl || "");
    } catch {
      router.replace("/login?redirect=%2Faccount");
      return;
    } finally {
      setIsCheckingSession(false);
    }
  }, [router]);

  const username = useMemo(() => {
    if (!session?.email) {
      return "";
    }
    return session.email.split("@")[0];
  }, [session]);

  const openAvatarPicker = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setStatusType("error");
      setStatusMessage("Chỉ hỗ trợ ảnh định dạng JPG hoặc PNG.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setStatusType("error");
      setStatusMessage("Ảnh vượt qu� 1MB. Vui l�ng chọn ảnh nhỏ hơn.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setAvatarUrl(result);
      setStatusType("idle");
      setStatusMessage("");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = () => {
    if (!session) {
      return;
    }

    const hasPasswordInput = currentPassword.trim() || newPassword.trim() || confirmPassword.trim();

    let updatedPassword = session.password || "";

    if (hasPasswordInput) {
      if (session.password && currentPassword.trim() !== session.password) {
        setStatusType("error");
        setStatusMessage("Mật khẩu hiện tại chưa đúng.");
        return;
      }

      if (newPassword.trim().length < 6) {
        setStatusType("error");
        setStatusMessage("Mật khẩu mới cần có ít nhất 6 ký tự.");
        return;
      }

      if (newPassword.trim() !== confirmPassword.trim()) {
        setStatusType("error");
        setStatusMessage("Mật khẩu x�c nhận chưa khớp.");
        return;
      }

      updatedPassword = newPassword.trim();
    }

    const nextSession: DemoSession = {
      ...session,
      name: displayName.trim() || username,
      organization: organization.trim(),
      gender,
      birthDate,
      avatarUrl,
      password: updatedPassword
    };

    window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(nextSession));
    window.dispatchEvent(new Event("marveclass-auth-changed"));

    if (nextSession.role === "teacher") {
      updateTeacherAccount(nextSession.email, {
        name: nextSession.name,
        organization: nextSession.organization,
        password: nextSession.password
      });
    }

    setSession(nextSession);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setStatusType("success");
    setStatusMessage("Đã lưu hồ sơ tài khoản.");
  };

  if (isCheckingSession) {
    return (
      <main className="section-page">
        <div className="site-shell">
          <div className="account-profile-card">
            <h1>Đang tải hồ sơ tài khoản...</h1>
          </div>
        </div>
      </main>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <main className="section-page">
      <div className="site-shell">
        <section className="account-profile-shell">
          <div className="account-profile-head">
            <h1>Hồ sơ của tôi</h1>
            <p>Quản lý thông tin hồ sơ để bảo mật tài khoản.</p>
          </div>

          <div className="account-profile-card">
            <div className="account-profile-grid">
              <div className="account-profile-main">
                <label className="account-profile-field">
                  <span>Tên hiển thị</span>
                  <input
                    className="text-input"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Nhập tên hiển thị"
                  />
                </label>

                <div className="account-profile-row">
                  <span className="account-profile-label">Email</span>
                  <span>{maskEmail(session.email)}</span>
                </div>

                <label className="account-profile-field">
                  <span>Đơn vị c�ng t�c</span>
                  <input
                    className="text-input"
                    value={organization}
                    onChange={(event) => setOrganization(event.target.value)}
                    placeholder="Ví dụ: Khoa CNTT - Trường ABC"
                  />
                </label>

                <div className="account-profile-field">
                  <span>Giới tính</span>
                  <div className="account-radio-group">
                    <label>
                      <input
                        type="radio"
                        name="gender"
                        value="male"
                        checked={gender === "male"}
                        onChange={() => setGender("male")}
                      />
                      Nam
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="gender"
                        value="female"
                        checked={gender === "female"}
                        onChange={() => setGender("female")}
                      />
                      Nữ
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="gender"
                        value="other"
                        checked={gender === "other"}
                        onChange={() => setGender("other")}
                      />
                      Kh�c
                    </label>
                  </div>
                </div>

                <label className="account-profile-field">
                  <span>Ngày sinh</span>
                  <input
                    className="text-input"
                    type="date"
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                  />
                </label>

                <div className="account-password-block">
                  <h2>Đổi mật khẩu</h2>
                  <label className="account-profile-field">
                    <span>Mật khẩu hiện tại</span>
                    <input
                      className="text-input"
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      placeholder="Nhập mật khẩu hiện tại"
                    />
                  </label>
                  <label className="account-profile-field">
                    <span>Mật khẩu mới</span>
                    <input
                      className="text-input"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                    />
                  </label>
                  <label className="account-profile-field">
                    <span>Nhập lại mật khẩu mới</span>
                    <input
                      className="text-input"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="X�c nhận mật khẩu mới"
                    />
                  </label>
                </div>

                {statusType !== "idle" ? (
                  <p className={statusType === "success" ? "account-status success" : "account-status error"}>
                    {statusMessage}
                  </p>
                ) : null}

                <button type="button" className="account-save-button" onClick={handleSaveProfile}>
                  Lưu
                </button>
              </div>

              <aside className="account-profile-aside">
                <div className="account-avatar-preview">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Ảnh đại diện" />
                  ) : (
                    <span>{(displayName || username || "U").slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  hidden
                  onChange={handleAvatarSelected}
                />
                <button type="button" className="account-pick-image" onClick={openAvatarPicker}>
                  Chọn ảnh
                </button>
                <p className="account-avatar-hint">
                  Dung lượng file tối đa 1MB.
                  <br />
                  Định dạng: JPG, PNG.
                </p>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
