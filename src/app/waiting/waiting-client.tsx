"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getTopicSessionByCodeAny } from "../../lib/topic-picker";
import { findGroupMatchingSessionByCode, findGroupMatchingSessionByCodeAny } from "../../lib/group-matching";

type WaitingClientProps = {
  classCode?: string;
  initialName?: string;
  initialStudentId?: string;
};

const LOOKUP_TIMEOUT_MS = 3500;

export default function WaitingClient({ classCode = "", initialName = "", initialStudentId = "" }: WaitingClientProps) {
  const router = useRouter();
  const normalizedCode = useMemo(() => classCode.trim().toUpperCase(), [classCode]);
  const [isResolving, setIsResolving] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!normalizedCode) {
      setIsResolving(false);
      setNotFound(true);
      return;
    }

    setIsResolving(true);
    setNotFound(false);

    const redirectIfFound = async () => {
      const topicSession = await getTopicSessionByCodeAny(normalizedCode);
      if (topicSession) {
        const query = new URLSearchParams();
        query.set("code", normalizedCode);
        if (initialName.trim()) query.set("name", initialName.trim());
        if (initialStudentId.trim()) query.set("studentId", initialStudentId.trim());
        router.replace(`/features/topic-picker/join?${query.toString()}`);
        return true as const;
      }

      const groupMatchingSession =
        findGroupMatchingSessionByCode(normalizedCode) || (await findGroupMatchingSessionByCodeAny(normalizedCode));
      if (groupMatchingSession) {
        const query = new URLSearchParams();
        query.set("code", normalizedCode);
        if (initialName.trim()) query.set("name", initialName.trim());
        if (initialStudentId.trim()) query.set("studentId", initialStudentId.trim());
        router.replace(`/features/group-matching/join?${query.toString()}`);
        return true as const;
      }

      return false as const;
    };

    let cancelled = false;

    void (async () => {
      if (await redirectIfFound()) return;

      const pollId = window.setInterval(() => {
        void (async () => {
          if (await redirectIfFound()) {
            window.clearInterval(pollId);
          }
        })();
      }, 250);

      const timeoutId = window.setTimeout(() => {
        window.clearInterval(pollId);
        if (!cancelled) {
          setIsResolving(false);
          setNotFound(true);
        }
      }, LOOKUP_TIMEOUT_MS);

      if (cancelled) {
        window.clearInterval(pollId);
        window.clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [normalizedCode, initialName, initialStudentId, router]);

  return (
    <main className="section-page">
      <div className="site-shell group-shell">
        <section className="group-form-card" style={{ maxWidth: 760, margin: "0 auto" }}>
          <span className="section-eyebrow">KHU VỰC SINH VIÊN</span>
          {isResolving ? (
            <>
              <h2 style={{ marginTop: 10 }}>Đang tìm phiên</h2>
              <p className="hint-copy" style={{ marginTop: 8 }}>
                Đang kiểm tra class code <strong>{normalizedCode}</strong>...
              </p>
            </>
          ) : null}

          {!isResolving && notFound ? (
            <>
              <h2 style={{ marginTop: 10 }}>Không tìm thấy phiên</h2>
              <p className="hint-copy" style={{ marginTop: 8 }}>
                Không tìm thấy phiên với class code <strong>{normalizedCode || "(trống)"}</strong>.
              </p>
              <div className="group-action-row" style={{ marginTop: 10 }}>
                <a href="/" className="hero-secondary">
                  Về trang chủ
                </a>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
