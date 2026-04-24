"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onSnapshot, setDoc } from "firebase/firestore";
import {
  activeClassIdKey,
  classAppStateRef,
  classDocRef,
  classParticipantDoc,
  classParticipantsCollection,
  resetCounterKey,
  round1DraftKey,
  round2LeaderDraftKey,
  round2MemberDraftKey,
  round3ApplicationDraftKey,
  round3RoomDraftKey,
  studentIdKey,
  studentNameKey
} from "../../../lib/classHelpers";

type Participant = {
  docId: string;
  studentId: string;
  fullName: string;
  ranking: number;
  password?: string;
  hasSetPassword?: boolean;
};

type SavedStudentSession = {
  studentId: string;
  fullName: string;
};

function clearStudentLocalState(classId: string, savedStudentId?: string | null) {
  localStorage.removeItem(studentIdKey(classId));
  localStorage.removeItem(studentNameKey(classId));

  if (savedStudentId) {
    localStorage.removeItem(round1DraftKey(classId, savedStudentId));
    localStorage.removeItem(round2MemberDraftKey(classId, savedStudentId));
    localStorage.removeItem(round2LeaderDraftKey(classId, savedStudentId));
    localStorage.removeItem(round3RoomDraftKey(classId, savedStudentId));
    localStorage.removeItem(round3ApplicationDraftKey(classId, savedStudentId));
  }
}

export default function ClassLoginPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const classId = Array.isArray(params.code) ? params.code[0] : params.code;
  const [className, setClassName] = useState("");
  const [classExists, setClassExists] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [studentConfirmPassword, setStudentConfirmPassword] = useState("");
  const [savedStudentSession, setSavedStudentSession] = useState<SavedStudentSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!classId) {
      router.replace("/");
      return;
    }

    const savedStudentId = localStorage.getItem(studentIdKey(classId));
    const savedStudentName = localStorage.getItem(studentNameKey(classId));

    if (savedStudentId && savedStudentName) {
      setSavedStudentSession({
        studentId: savedStudentId,
        fullName: savedStudentName
      });
    }

    const unsubscribeClass = onSnapshot(classDocRef(classId), (snapshot) => {
      if (!snapshot.exists()) {
        setClassExists(false);
        setIsLoading(false);
        return;
      }

      const data = snapshot.data() as {
        className?: string;
      };

      setClassName(data.className || "Lớp chưa đặt tên");
      setClassExists(true);
    });

    const unsubscribeParticipants = onSnapshot(
      classParticipantsCollection(classId),
      (snapshot) => {
        const items = snapshot.docs.map((docItem) => {
          const data = docItem.data() as {
            studentId?: string;
            fullName?: string;
            ranking?: number;
            password?: string;
            hasSetPassword?: boolean;
          };

          return {
            docId: docItem.id,
            studentId: data.studentId || docItem.id,
            fullName: data.fullName || "Không rõ tên",
            ranking: data.ranking || 0,
            password: data.password || "",
            hasSetPassword: Boolean(data.hasSetPassword)
          };
        });

        items.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setParticipants(items);
        setIsLoading(false);
      },
      () => {
        setMessage("Không thể tải danh sách sinh viên.");
        setIsLoading(false);
      }
    );

    const unsubscribeAppState = onSnapshot(classAppStateRef(classId), (snapshot) => {
      if (!snapshot.exists()) {
        return;
      }

      const data = snapshot.data() as {
        resetCounter?: number;
      };

      const newResetCounter = String(data.resetCounter || "");
      const savedResetCounter = localStorage.getItem(resetCounterKey(classId));
      const currentStudentId = localStorage.getItem(studentIdKey(classId));

      if (newResetCounter) {
        if (savedResetCounter && savedResetCounter !== newResetCounter) {
          clearStudentLocalState(classId, currentStudentId);
          setSavedStudentSession(null);
        }

        localStorage.setItem(resetCounterKey(classId), newResetCounter);
      }
    });

    return () => {
      unsubscribeClass();
      unsubscribeParticipants();
      unsubscribeAppState();
    };
  }, [classId, router]);

  const selectedStudent = useMemo(() => {
    return participants.find((participant) => participant.studentId === selectedStudentId);
  }, [participants, selectedStudentId]);

  const handleContinueSavedStudent = () => {
    if (!classId) {
      return;
    }

    localStorage.setItem(activeClassIdKey(), classId);
    router.push(`/class/${classId}/student`);
  };

  const handleStudentAuth = async () => {
    if (!classId || !selectedStudent) {
      setMessage("Vui lòng chọn tên sinh viên.");
      return;
    }

    if (!selectedStudent.hasSetPassword) {
      if (!studentPassword || !studentConfirmPassword) {
        setMessage("Vui lòng nhập đầy đủ mật khẩu.");
        return;
      }

      if (studentPassword !== studentConfirmPassword) {
        setMessage("Mật khẩu xác nhận không khớp.");
        return;
      }

      await setDoc(
        classParticipantDoc(classId, selectedStudent.studentId),
        {
          password: studentPassword,
          hasSetPassword: true
        },
        { merge: true }
      );
    } else if (studentPassword !== selectedStudent.password) {
      setMessage("Mật khẩu sinh viên không đúng.");
      return;
    }

    localStorage.setItem(activeClassIdKey(), classId);
    localStorage.setItem(studentIdKey(classId), selectedStudent.studentId);
    localStorage.setItem(studentNameKey(classId), selectedStudent.fullName);
    router.push(`/class/${classId}/student`);
  };

  if (!classExists) {
    return (
      <main className="page-shell">
        <section className="card">
          <h1>Không tìm thấy lớp</h1>
          <p className="lead">Link lớp này không còn tồn tại hoặc chưa được tạo.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="card card-wide">
        <span className="eyebrow">Lối vào Sinh viên</span>
        <h1>{className || "Đang tải lớp..."}</h1>
        <p className="lead">
          Vui lòng chọn đúng tên SV để thực hiện đăng nhập.
          <br />
          Với lần đăng nhập đầu tiên, bạn sẽ cần tạo mật khẩu. Mật khẩu này không cần quá
          phức tạp, chỉ cần đủ để xác minh đó là bạn.
        </p>

        <div className="status-box">
          <p className="status-label">Link lớp hiện tại</p>
          <p className="status-value">{classId}</p>
        </div>

        {savedStudentSession ? (
          <div className="status-box">
            <p className="status-label">Phiên Sinh viên đã lưu</p>
            <p className="status-value">{savedStudentSession.fullName}</p>
            <button className="primary-button" onClick={handleContinueSavedStudent}>
              Tiếp tục vào trò chơi
            </button>
          </div>
        ) : (
          <div className="status-box">
            <label className="field">
              <span>Chọn tên Sinh viên</span>
              <select
                value={selectedStudentId}
                onChange={(event) => {
                  setSelectedStudentId(event.target.value);
                  setStudentPassword("");
                  setStudentConfirmPassword("");
                  setMessage("");
                }}
                disabled={isLoading}
              >
                <option value="">
                  {isLoading ? "Đang tải danh sách..." : "-- Chọn tên Sinh viên --"}
                </option>
                {participants.map((participant) => (
                  <option key={participant.docId} value={participant.studentId}>
                    {participant.fullName}
                  </option>
                ))}
              </select>
            </label>

            {selectedStudent ? (
              <>
                <label className="field">
                  <span>
                    {selectedStudent.hasSetPassword ? "Nhập mật khẩu" : "Tạo mật khẩu lần đầu"}
                  </span>
                  <input
                    className="text-input"
                    type="password"
                    value={studentPassword}
                    onChange={(event) => setStudentPassword(event.target.value)}
                  />
                </label>

                {!selectedStudent.hasSetPassword ? (
                  <label className="field">
                    <span>Nhập lại mật khẩu</span>
                    <input
                      className="text-input"
                      type="password"
                      value={studentConfirmPassword}
                      onChange={(event) => setStudentConfirmPassword(event.target.value)}
                    />
                  </label>
                ) : null}
              </>
            ) : null}

            <button className="primary-button" onClick={handleStudentAuth}>
              {selectedStudent?.hasSetPassword
                ? "Đăng nhập Sinh viên"
                : "Tạo mật khẩu và đăng nhập"}
            </button>
          </div>
        )}

        {message ? <p className="lead">{message}</p> : null}
      </section>
    </main>
  );
}
