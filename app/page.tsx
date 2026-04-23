"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

type Participant = {
  docId: string;
  studentId: string;
  fullName: string;
  ranking: number;
};

export default function LoginPage() {
  const router = useRouter();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "participants"),
      (snapshot) => {
        const items = snapshot.docs.map((docItem) => {
          const data = docItem.data() as {
            studentId?: string;
            fullName?: string;
            ranking?: number;
          };

          return {
            docId: docItem.id,
            studentId: data.studentId || docItem.id,
fullName: data.fullName || "Unknown student",
 ranking: data.ranking || 0
          };
        });

        items.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setParticipants(items);
        setIsLoading(false);
      },
      () => {
        setErrorMessage("Could not load participants from Firebase.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleContinue = () => {
    if (!selectedStudentId) {
      alert("Please choose a student name before continuing.");
      return;
    }

    const selectedStudent = participants.find(
      (participant) => participant.studentId === selectedStudentId
    );

    if (!selectedStudent) {
      alert("Student not found.");
      return;
    }

    localStorage.setItem("selectedStudentId", selectedStudent.studentId);
    localStorage.setItem("selectedStudentName", selectedStudent.fullName);

    router.push("/waiting");
  };

  const handleAdminLogin = () => {
    router.push("/admin");
  };

  return (
    <main className="page-shell">
      <section className="card">
        <span className="eyebrow">Stage 4 Firebase demo</span>
        <h1>Group Matching App</h1>
        <p className="lead">
          Student names are now loaded from Firebase Firestore in realtime.
        </p>

        <label className="field">
          <span>Select student name</span>
          <select
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            disabled={isLoading}
          >
            <option value="">
              {isLoading ? "Loading students..." : "-- Choose a name --"}
            </option>
            {participants.map((participant) => (
              <option
                key={participant.docId}
                value={participant.studentId}
              >
                {participant.fullName} ({participant.studentId})
              </option>
            ))}
          </select>
        </label>

        {errorMessage ? <p className="lead">{errorMessage}</p> : null}

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
