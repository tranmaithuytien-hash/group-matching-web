"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function WaitingPage() {
  const [name, setName] = useState("Unknown student");

  useEffect(() => {
    const savedName = localStorage.getItem("selectedStudentName");
    if (savedName) {
      setName(savedName);
    }
  }, []);

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
