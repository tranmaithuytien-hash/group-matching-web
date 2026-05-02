"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getTopicSessionByRouteKey } from "../lib/topic-picker";

function toLabel(segment: string) {
  const decoded = decodeURIComponent(segment);
  const withSpaces = decoded.replace(/[-_]+/g, " ").trim();
  if (!withSpaces) return "Trang";
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

export function SiteBreadcrumbs() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [topicClassCode, setTopicClassCode] = useState("");

  const sessionIdFromPath = useMemo(() => {
    const match = pathname.match(/^\/features\/topic-picker\/manage\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }, [pathname]);

  useEffect(() => {
    if (!sessionIdFromPath) {
      setTopicClassCode("");
      return;
    }
    const session = getTopicSessionByRouteKey(sessionIdFromPath);
    setTopicClassCode(session?.classCode || "");
  }, [sessionIdFromPath]);

  if (isHome) {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const isTopicManageLeaf =
      Boolean(topicClassCode) &&
      index === 3 &&
      segments[0] === "features" &&
      segments[1] === "topic-picker" &&
      segments[2] === "manage";
    return { href, label: isTopicManageLeaf ? topicClassCode : toLabel(segment) };
  });

  return (
    <nav className="site-breadcrumbs-wrap" aria-label="Breadcrumb">
      <div className="site-shell">
        <ol className="site-breadcrumbs">
          <li>
            <Link href="/">Trang chủ</Link>
          </li>
          {crumbs.map((crumb) => (
            <li key={crumb.href}>
              <span className="site-breadcrumb-sep">/</span>
              <Link href={crumb.href}>{crumb.label}</Link>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

