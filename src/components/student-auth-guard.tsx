"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getDemoSession } from "../lib/auth-storage";

export function StudentAuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const query = window.location.search || "";
    const returnPath = `${pathname}${query}`;
    const session = getDemoSession();
    if (!session || session.role !== "student") {
      router.replace(`/login?redirect=${encodeURIComponent(returnPath)}`);
      return;
    }

    setIsAllowed(true);
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
