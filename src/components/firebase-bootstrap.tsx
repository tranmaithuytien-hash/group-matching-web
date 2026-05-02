"use client";

import { useEffect } from "react";
import { ensureFirebaseAnonymousAuth } from "../lib/firebase-auth-bootstrap";

export function FirebaseBootstrap() {
  useEffect(() => {
    void ensureFirebaseAnonymousAuth();
  }, []);
  return null;
}

