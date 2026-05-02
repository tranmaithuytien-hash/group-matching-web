import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  limit,
  serverTimestamp,
  type DocumentData
} from "firebase/firestore";
import { db, isFirebaseReady } from "./firebase";
import type { GroupMatchingSession } from "./group-matching";

const GROUP_COLLECTION = "group_matching_sessions";

function canUseCloud() {
  return Boolean(isFirebaseReady && db);
}

function toSafePayload(session: GroupMatchingSession) {
  return {
    ...session,
    updatedAt: Number(session.updatedAt) || Date.now(),
    createdAt: Number(session.createdAt) || Date.now(),
    __updatedAtServer: serverTimestamp()
  };
}

function fromDoc(data: DocumentData | undefined | null): GroupMatchingSession | null {
  if (!data) return null;
  return data as GroupMatchingSession;
}

export async function cloudUpsertGroupMatchingSession(session: GroupMatchingSession) {
  if (!canUseCloud()) return;
  try {
    await setDoc(doc(db!, GROUP_COLLECTION, session.id), toSafePayload(session), { merge: true });
  } catch {
    // keep local fallback silent
  }
}

export async function cloudGetGroupMatchingSessionById(sessionId: string) {
  if (!canUseCloud() || !sessionId) return null;
  try {
    const snap = await getDoc(doc(db!, GROUP_COLLECTION, sessionId));
    if (!snap.exists()) return null;
    return fromDoc(snap.data());
  } catch {
    return null;
  }
}

export async function cloudFindGroupMatchingSessionByCode(classCode: string) {
  if (!canUseCloud() || !classCode) return null;
  try {
    const normalized = classCode.trim().toUpperCase();
    const q = query(collection(db!, GROUP_COLLECTION), where("classCode", "==", normalized), limit(1));
    const snap = await getDocs(q);
    const first = snap.docs[0];
    return first ? fromDoc(first.data()) : null;
  } catch {
    return null;
  }
}

export async function cloudLoadGroupMatchingSessionsByOwner(ownerTeacherEmail: string) {
  if (!canUseCloud() || !ownerTeacherEmail) return [] as GroupMatchingSession[];
  try {
    const q = query(
      collection(db!, GROUP_COLLECTION),
      where("ownerTeacherEmail", "==", ownerTeacherEmail.trim().toLowerCase())
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((item) => fromDoc(item.data()))
      .filter((item): item is GroupMatchingSession => Boolean(item))
      .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  } catch {
    return [] as GroupMatchingSession[];
  }
}
