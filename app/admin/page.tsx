"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

export default function AdminPage() {
  const [roundStatus, setRoundStatus] = useState("Not started");

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "app_state", "current"), (snapshot) => {
      if (!snapshot.exists()) {
        return;
      }

      const data = snapshot.data() as {
        waitingMessage?: string;
      };

      setRoundStatus(data.waitingMessage || "Not started");
    });

    return () => unsubscribe();
  }, []);

  const handleStartRound1 = async () => {
    await setDoc(
      doc(db, "app_state", "current"),
      {
        currentRound: "round1",
        round1Status: "open",
        waitingMessage: "Round 1 has started",
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  };

  return (
    <main className="page-shell">
      <section className="card">
        <span className="eyebrow">Admin screen</span>
        <h1>Admin Panel</h1>
        <p className="lead">
          This page now updates Firebase, and students will see the new status in realtime.
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
