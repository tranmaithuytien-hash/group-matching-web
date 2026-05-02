import { collection, deleteDoc, doc, getDocs, query, setDoc, where, type DocumentData } from "firebase/firestore";
import { db, isFirebaseReady } from "./firebase";
import type { TeacherClassList } from "./class-lists";

const CLASS_LISTS_COLLECTION = "teacher_class_lists";

function canUseCloud() {
  return Boolean(isFirebaseReady && db);
}

function fromDoc(data: DocumentData | undefined | null): TeacherClassList | null {
  if (!data) return null;
  return data as TeacherClassList;
}

export async function cloudUpsertTeacherClassList(classList: TeacherClassList) {
  if (!canUseCloud()) return;
  try {
    await setDoc(
      doc(db!, CLASS_LISTS_COLLECTION, classList.id),
      {
        ...classList,
        ownerTeacherEmail: classList.ownerTeacherEmail.trim().toLowerCase(),
        updatedAt: Number(classList.updatedAt) || Date.now(),
        createdAt: Number(classList.createdAt) || Date.now()
      },
      { merge: true }
    );
  } catch {
    // fallback to local only
  }
}

export async function cloudLoadTeacherClassListsByOwner(ownerTeacherEmail: string) {
  if (!canUseCloud() || !ownerTeacherEmail) return [] as TeacherClassList[];
  try {
    const q = query(
      collection(db!, CLASS_LISTS_COLLECTION),
      where("ownerTeacherEmail", "==", ownerTeacherEmail.trim().toLowerCase())
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((item) => fromDoc(item.data()))
      .filter((item): item is TeacherClassList => Boolean(item))
      .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  } catch {
    return [] as TeacherClassList[];
  }
}


export async function cloudDeleteTeacherClassList(classListId: string) {
  if (!canUseCloud() || !classListId) return;
  try {
    await deleteDoc(doc(db!, CLASS_LISTS_COLLECTION, classListId));
  } catch {
    // fallback to local-only delete
  }
}

