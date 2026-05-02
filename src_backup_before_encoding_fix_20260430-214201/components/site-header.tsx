"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type SessionRole = "teacher" | "student";

type DemoSession = {
  email: string;
  name?: string;
  role: SessionRole;
  avatarUrl?: string;
  provider?: "google" | "password";
};

const DEMO_SESSION_KEY = "marveclass_demo_session";

const featureMenuSections = [
  {
    title: "Quản lý lớp học",
    href: "/features/classroom-management",
    links: [
      { href: "/features/group-matching", label: "Chia nhóm" },
      { href: "/features/topic-picker", label: "Chủ đề thuyết trình" },
      { href: "/features/classroom-management", label: "Bảng điểm" },
      { href: "/features/materials", label: "Tài liệu" }
    ]
  },
  {
    title: "Game trên lớp",
    href: "/features/classroom-games",
    links: [
      { href: "/features/classroom-games", label: "Lắng nghe ý kiến" },
      { href: "/features/classroom-games", label: "Timer lớp học" },
      { href: "/features/classroom-games", label: "Quiz tương t�c" },
      { href: "/features/classroom-games", label: "Mini game trên lớp" }
    ]
  },
  {
    title: "Dành cho SV",
    href: "/features/student",
    links: [
      { href: "/features/student/review", label: "Ôn tập" },
      { href: "/features/student/submission", label: "Nộp bài" },
      { href: "/features/student/scores", label: "Xem bảng điểm" },
      { href: "/features/student/materials", label: "Tài liệu" }
    ]
  }
];

function readSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DEMO_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DemoSession;
  } catch {
    return null;
  }
}

function isSameSession(left: DemoSession | null, right: DemoSession | null) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    left.email === right.email &&
    (left.name || "") === (right.name || "") &&
    left.role === right.role &&
    (left.avatarUrl || "") === (right.avatarUrl || "") &&
    (left.provider || "") === (right.provider || "")
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const featureMenuTimer = useRef<number | null>(null);
  const accountMenuTimer = useRef<number | null>(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isFeatureMenuOpen, setIsFeatureMenuOpen] = useState(false);
  const [isMobileAccountOpen, setIsMobileAccountOpen] = useState(false);
  const [session, setSession] = useState<DemoSession | null>(null);
  const [quickJoinCode, setQuickJoinCode] = useState("");

  useEffect(() => {
    setIsMenuOpen(false);
    setIsAccountOpen(false);
    setIsFeatureMenuOpen(false);
    setIsMobileAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    const syncSession = () => {
      const next = readSession();
      setSession((current) => (isSameSession(current, next) ? current : next));
    };
    syncSession();
    window.addEventListener("storage", syncSession);
    window.addEventListener("marveclass-auth-changed", syncSession as EventListener);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("marveclass-auth-changed", syncSession as EventListener);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (featureMenuTimer.current) window.clearTimeout(featureMenuTimer.current);
      if (accountMenuTimer.current) window.clearTimeout(accountMenuTimer.current);
    };
  }, []);

  const handleLogout = () => {
    window.localStorage.removeItem(DEMO_SESSION_KEY);
    window.dispatchEvent(new Event("marveclass-auth-changed"));
    setIsAccountOpen(false);
    setIsMobileAccountOpen(false);
    router.push("/");
  };

  const openFeatureMenu = () => {
    if (featureMenuTimer.current) {
      window.clearTimeout(featureMenuTimer.current);
      featureMenuTimer.current = null;
    }
    setIsFeatureMenuOpen(true);
  };

  const closeFeatureMenu = () => {
    if (featureMenuTimer.current) window.clearTimeout(featureMenuTimer.current);
    featureMenuTimer.current = window.setTimeout(() => {
      setIsFeatureMenuOpen(false);
      featureMenuTimer.current = null;
    }, 180);
  };

  const openAccountMenu = () => {
    if (accountMenuTimer.current) {
      window.clearTimeout(accountMenuTimer.current);
      accountMenuTimer.current = null;
    }
    setIsAccountOpen(true);
  };

  const closeAccountMenu = () => {
    if (accountMenuTimer.current) window.clearTimeout(accountMenuTimer.current);
    accountMenuTimer.current = window.setTimeout(() => {
      setIsAccountOpen(false);
      accountMenuTimer.current = null;
    }, 180);
  };

  const handleHeaderQuickJoin = () => {
    const code = quickJoinCode.trim();
    if (!code) return;
    router.push(`/waiting?code=${encodeURIComponent(code)}`);
  };

  return (
    <header className="site-header">
      <div className="site-shell header-inner">
        <button
          type="button"
          className="header-menu-toggle"
          aria-label={isMenuOpen ? "�ng menu" : "M� menu"}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>

        <Link href="/" className="brand-mark">
          <span className="brand-logo-image">
            <Image src="/marveclass-logo.png" alt="MarveClass logo" width={48} height={48} />
          </span>
          <span className="brand-copy">
            <strong>MarveClass</strong>
            <small>A marvelous classroom</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label="Điều hướng chính">
          <Link href="/">Trang chủ</Link>

          <div className="nav-menu-shell" onMouseEnter={openFeatureMenu} onMouseLeave={closeFeatureMenu}>
            <Link href="/features" className="nav-menu-trigger">
              Tính năng
            </Link>
            <div className={isFeatureMenuOpen ? "mega-menu open" : "mega-menu"}>
              {featureMenuSections.map((section) => (
                <div key={section.title} className="mega-menu-column">
                  <Link href={section.href} className="mega-menu-title">
                    {section.title}
                  </Link>
                  <div className="mega-menu-links">
                    {section.links.map((link) => (
                      <Link key={`${section.title}-${link.label}`} href={link.href}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Link href="/library">Thư viện</Link>
        </nav>

        <div className="header-actions">
          <div className="header-quick-join">
            <div className="header-quick-join-field">
              <input
                className="header-quick-join-input"
                value={quickJoinCode}
                onChange={(e) => setQuickJoinCode(e.target.value)}
                placeholder="Nhập code"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleHeaderQuickJoin();
                  }
                }}
              />
              <button type="button" className="header-quick-join-button" onClick={handleHeaderQuickJoin}>
                Tham gia
              </button>
            </div>
          </div>

          {session ? (
            <div className="account-shell" onMouseEnter={openAccountMenu} onMouseLeave={closeAccountMenu}>
              <button
                type="button"
                className="account-trigger"
                onClick={() => setIsAccountOpen((current) => !current)}
                aria-label="Mở menu tài khoản"
                aria-expanded={isAccountOpen}
              >
                {session.avatarUrl ? (
                  <Image src={session.avatarUrl} alt={session.email} width={40} height={40} className="account-avatar-image" />
                ) : (
                  <span className="account-avatar-fallback account-avatar-icon">
                    <PersonIcon />
                  </span>
                )}
              </button>

              <div className={isAccountOpen ? "account-dropdown open" : "account-dropdown"}>
                <div className="account-summary">
                  <strong>{session.name || session.email.split("@")[0]}</strong>
                  <span>{session.email}</span>
                </div>

                {session.role === "teacher" ? (
                  <Link href="/dashboard/classes" className="account-link">
                    Lớp của tôi
                  </Link>
                ) : null}

                <Link href="/account" className="account-link">
                  Quản lý tài khoản
                </Link>

                <button type="button" className="account-link account-logout" onClick={handleLogout}>
                  Đăng xuất
                </button>
              </div>
            </div>
          ) : (
            <Link href="/login" className="header-cta">
              Đăng nhập
            </Link>
          )}
        </div>
      </div>

      <div className={isMenuOpen ? "mobile-nav open" : "mobile-nav"}>
        <div className="site-shell mobile-nav-inner">
          <div className="mobile-nav-brand">
            <span className="brand-logo-image mobile-brand-logo">
              <Image src="/marveclass-logo.png" alt="MarveClass logo" width={42} height={42} />
            </span>
            <div className="mobile-brand-copy">
              <strong>MarveClass</strong>
              <small>A marvelous classroom</small>
            </div>
          </div>

          <nav className="mobile-nav-links" aria-label="Điều hướng trên di động">
            <Link href="/">Trang chủ</Link>
            <Link href="/features">Tính năng</Link>
            <Link href="/library">Thư viện</Link>
          </nav>

          <div className="mobile-nav-actions">
            <Link href="/" className="ghost-link mobile-ghost-link">
              Tham gia
            </Link>

            {session ? (
              <div className="mobile-accordion">
                <button
                  type="button"
                  className="account-trigger mobile-account-trigger"
                  onClick={() => setIsMobileAccountOpen((current) => !current)}
                  aria-label="Mở menu tài khoản"
                >
                  {session.avatarUrl ? (
                    <Image src={session.avatarUrl} alt={session.email} width={40} height={40} className="account-avatar-image" />
                  ) : (
                    <span className="account-avatar-fallback account-avatar-icon">
                      <PersonIcon />
                    </span>
                  )}
                </button>

                <div className={isMobileAccountOpen ? "mobile-accordion-panel open" : "mobile-accordion-panel"}>
                  {session.role === "teacher" ? (
                    <Link href="/dashboard/classes" className="mobile-account-link">
                      Lớp của tôi
                    </Link>
                  ) : null}
                  <Link href="/account" className="mobile-account-link">
                    Quản lý tài khoản
                  </Link>
                  <button type="button" className="mobile-account-link mobile-logout" onClick={handleLogout}>
                    Đăng xuất
                  </button>
                </div>
              </div>
            ) : (
              <Link href="/login" className="header-cta mobile-header-cta">
                Đăng nhập
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
