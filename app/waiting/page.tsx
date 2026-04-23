"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function WaitingPage() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name") || "Unknown student";

  return (
    <main className="page-shell">
      <section className="card">
        <span className="eyebrow">Student waiting screen</span>
        <h1>Hello, {name}</h1>
        <p className="lead">You have logged in successfully.</p>

        <div className="status-box">
          <p className="status-label">Current status</p>
          <p className="status-value">Waiting for admin to start Round 1</p>
        </div>

        <Link className="secondary-button link-button" href="/">
          Back to login
        </Link>
      </section>
    </main>
  );
}
