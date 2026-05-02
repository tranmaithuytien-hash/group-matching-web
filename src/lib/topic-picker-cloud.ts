import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  orderBy,
  limit,
  serverTimestamp,
  type DocumentData
} from "firebase/firestore";
import { db, isFirebaseReady } from "./firebase";
import type { TopicSession } from "./topic-picker";

const TOPIC_COLLECTION = "topic_sessions";

function canUseCloud() {
  return Boolean(isFirebaseReady && db);
}

function toSafePayload(session: TopicSession) {
  return {
    ...session,
    updatedAt: Number(session.updatedAt) || Date.now(),
    createdAt: Number(session.createdAt) || Date.now(),
    __updatedAtServer: serverTimestamp()
  };
}

function fromDoc(data: DocumentData | undefined | null): TopicSession | null {
  if (!data) return null;
  return data as TopicSession;
}

export async function cloudUpsertTopicSession(session: TopicSession) {
  if (!canUseCloud()) return;
  try {
    await setDoc(doc(db!, TOPIC_COLLECTION, session.id), toSafePayload(session), { merge: true });
  } catch {
    // Silent fallback to local-only mode.
  }
}

export async function cloudGetTopicSessionById(sessionId: string) {
  if (!canUseCloud() || !sessionId) return null;
  try {
    const snap = await getDoc(doc(db!, TOPIC_COLLECTION, sessionId));
    if (!snap.exists()) return null;
    return fromDoc(snap.data());
  } catch {
    return null;
  }
}

export async function cloudGetTopicSessionByCode(classCode: string) {
  if (!canUseCloud() || !classCode) return null;
  try {
    const normalized = classCode.trim().toUpperCase();
    const q = query(collection(db!, TOPIC_COLLECTION), where("classCode", "==", normalized), limit(20));
    const snap = await getDocs(q);
    const sessions = snap.docs
      .map((item) => fromDoc(item.data()))
      .filter((item): item is TopicSession => Boolean(item));
    if (sessions.length === 0) return null;
    sessions.sort((a, b) => (b.stateVersion || 0) - (a.stateVersion || 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
    return sessions[0];
  } catch {
    return null;
  }
}

export async function cloudLoadTopicSessionsByOwner(ownerTeacherEmail: string) {
  if (!canUseCloud() || !ownerTeacherEmail) return [] as TopicSession[];
  try {
    const q = query(
      collection(db!, TOPIC_COLLECTION),
      where("ownerTeacherEmail", "==", ownerTeacherEmail.trim().toLowerCase()),
      orderBy("updatedAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((item) => fromDoc(item.data())).filter((item): item is TopicSession => Boolean(item));
  } catch {
    return [] as TopicSession[];
  }
}
