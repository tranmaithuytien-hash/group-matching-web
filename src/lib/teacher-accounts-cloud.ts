import { doc, getDoc, setDoc, collection, query, where, getDocs, limit, type DocumentData } from "firebase/firestore";
import { db, isFirebaseReady } from "./firebase";
import type { TeacherAccount } from "./auth-storage";

const TEACHER_ACCOUNTS_COLLECTION = "teacher_accounts";

function canUseCloud() {
  return Boolean(isFirebaseReady && db);
}

function toDocId(email: string) {
  return email.trim().toLowerCase();
}

function fromDoc(data: DocumentData | undefined | null): TeacherAccount | null {
  if (!data) return null;
  return data as TeacherAccount;
}

export async function cloudGetTeacherAccountByEmail(email: string) {
  if (!canUseCloud() || !email) return null;
  try {
    const id = toDocId(email);
    const snap = await getDoc(doc(db!, TEACHER_ACCOUNTS_COLLECTION, id));
    if (snap.exists()) return fromDoc(snap.data());

    const q = query(collection(db!, TEACHER_ACCOUNTS_COLLECTION), where("email", "==", id), limit(1));
    const result = await getDocs(q);
    const first = result.docs[0];
    return first ? fromDoc(first.data()) : null;
  } catch {
    return null;
  }
}

export async function cloudUpsertTeacherAccount(account: TeacherAccount) {
  if (!canUseCloud()) return;
  try {
    const id = toDocId(account.email);
    await setDoc(
      doc(db!, TEACHER_ACCOUNTS_COLLECTION, id),
      {
        ...account,
        email: id,
        updatedAt: Number(account.updatedAt) || Date.now(),
        createdAt: Number(account.createdAt) || Date.now()
      },
      { merge: true }
    );
  } catch {
    // local fallback only
  }
}
