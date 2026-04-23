"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";

export default function WaitingPage() {
  const [name, setName] = useState("Unknown student");
  const [roundStatus, setRoundStatus] = useState("Waiting for admin to start Round 1");
  const [currentRound, setCurrentRound] = useState("waiting");

  useEffect(() => {
    const savedName = localStorage.getItem("selectedStudentName");
    if (savedName) {
      setName(savedName);
    }

    const unsubscribe = onSnapshot(doc(db, "app_state", "current"), (snapshot) => {
      if (!snapshot.exists()) {
        return;
      }

      const data = snapshot.data() as {
        currentRound?: string;
        waitingMessage?: string;
      };

      setCurrentRound(data.currentRound || "waiting");
      setRoundStatus(data.waitingMessage || "Waiting for admin to start Round 1");
    });

    return () => unsubscribe();
  }, []);

  return (
    <main className="page-shell">
      <section className="card">
        <span className="eyebrow">Student waiting screen</span>
        <h1>Hello, {name}</h1>
        <p className="lead">You have logged in successfully.</p>

        <div className="status-box">
          <p className="status-label">Current round</p>
          <p className="status-value">{currentRound}</p>
        </div>

        <div className="status-box">
          <p className="status-label">Current status</p>
          <p className="status-value">{roundStatus}</p>
        </div>

        <Link className="secondary-button link-button" href="/">
          Back to login
        </Link>
      </section>
    </main>
  );
}
