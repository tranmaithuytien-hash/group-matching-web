import { signInAnonymously } from "firebase/auth";
import { auth, isFirebaseReady } from "./firebase";

let initPromise: Promise<void> | null = null;

export function ensureFirebaseAnonymousAuth() {
  if (!isFirebaseReady || !auth) return Promise.resolve();
  if (auth.currentUser) return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = signInAnonymously(auth)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      initPromise = null;
    });
  return initPromise;
}

