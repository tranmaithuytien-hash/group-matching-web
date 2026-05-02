"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type DemoSession = {
  role?: "teacher" | "student";
};

const DEMO_SESSION_KEY = "marveclass_demo_session";

export function StudentAuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const query = window.location.search || "";
    const returnPath = `${pathname}${query}`;
    const raw = window.localStorage.getItem(DEMO_SESSION_KEY);

    if (!raw) {
      router.replace(`/login?redirect=${encodeURIComponent(returnPath)}`);
      return;
    }

    try {
      const session = JSON.parse(raw) as DemoSession;

      if (session.role === "student") {
        setIsAllowed(true);
        return;
      }
    } catch {
      // Ignore parse errors and redirect below.
    }

    router.replace(`/login?redirect=${encodeURIComponent(returnPath)}`);
  }, [pathname, router]);

  if (!isAllowed) {
    return (
      <main className="page-shell">
        <section className="card">
          <h1>Đang kiểm tra phiên đăng nhập...</h1>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
