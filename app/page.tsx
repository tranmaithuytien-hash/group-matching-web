"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const participants = [
  "An",
  "Binh",
  "Chau",
  "Dung",
  "Hanh",
  "Khanh",
  "Linh",
  "Minh"
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedName, setSelectedName] = useState("");

  const handleContinue = () => {
    if (!selectedName) {
      alert("Please choose a student name before continuing.");
      return;
    }

    router.push(`/waiting?name=${encodeURIComponent(selectedName)}`);
  };

  const handleAdminLogin = () => {
    router.push("/admin");
  };

  return (
    <main className="page-shell">
      <section className="card">
        <span className="eyebrow">Stage 2 local demo</span>
        <h1>Group Matching App</h1>
        <p className="lead">
          This is a simple local version with a fake login screen, a waiting
          screen, and an admin screen.
        </p>

        <label className="field">
          <span>Select student name</span>
          <select
            value={selectedName}
            onChange={(event) => setSelectedName(event.target.value)}
          >
            <option value="">-- Choose a name --</option>
            {participants.map((participant) => (
              <option key={participant} value={participant}>
                {participant}
              </option>
            ))}
          </select>
        </label>

        <button className="primary-button" onClick={handleContinue}>
          Continue
        </button>

        <div className="divider" />

        <button className="secondary-button" onClick={handleAdminLogin}>
          Admin Login
        </button>
      </section>
    </main>
  );
}