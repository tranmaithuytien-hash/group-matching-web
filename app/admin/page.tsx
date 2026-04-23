"use client";

import Link from "next/link";
import { useState } from "react";

export default function AdminPage() {
  const [roundStatus, setRoundStatus] = useState("Not started");

  const handleStartRound1 = () => {
    setRoundStatus("Round 1 has started");
  };

  return (
    <main className="page-shell">
      <section className="card">
        <span className="eyebrow">Admin screen</span>
        <h1>Admin Panel</h1>
        <p className="lead">
          This is a fake admin page for Stage 2. Firebase and realtime features
          will be added later.
        </p>

        <div className="status-box">
          <p className="status-label">Round status</p>
          <p className="status-value">{roundStatus}</p>
        </div>

        <button className="primary-button" onClick={handleStartRound1}>
          Start Round 1
        </button>

        <Link className="secondary-button link-button" href="/">
          Back to login
        </Link>
      </section>
    </main>
  );
}