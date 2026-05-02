import { repairMojibakeDeep } from "./text-normalize";
import { cloudGetTeacherAccountByEmail, cloudUpsertTeacherAccount } from "./teacher-accounts-cloud";

export const DEMO_SESSION_KEY = "marveclass_demo_session";
export const TEACHER_ACCOUNTS_KEY = "marveclass_teacher_accounts";

export type SessionRole = "teacher" | "student";

export type DemoSession = {
  email: string;
  name?: string;
  role: SessionRole;
  avatarUrl?: string;
  provider?: "google" | "password";
  organization?: string;
  gender?: "male" | "female" | "other" | "";
  birthDate?: string;
  password?: string;
};

export type TeacherAccount = {
  email: string;
  password: string;
  name?: string;
  organization?: string;
  createdAt: number;
  updatedAt: number;
};

function hasWindow() {
  return typeof window !== "undefined";
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getDemoSession() {
  if (!hasWindow()) {
    return null as DemoSession | null;
  }

  const raw = window.localStorage.getItem(DEMO_SESSION_KEY);
  if (!raw) {
    return null as DemoSession | null;
  }

  try {
    const parsed = repairMojibakeDeep(JSON.parse(raw)) as DemoSession;
    if (!parsed?.email || !parsed?.role) {
      return null as DemoSession | null;
    }

    return {
      ...parsed,
      email: normalizeEmail(parsed.email)
    };
  } catch {
    return null as DemoSession | null;
  }
}

export function getCurrentTeacherEmail() {
  const session = getDemoSession();
  if (!session || session.role !== "teacher") {
    return "";
  }
  return normalizeEmail(session.email);
}

export function loadTeacherAccounts() {
  if (!hasWindow()) {
    return [] as TeacherAccount[];
  }

  const raw = window.localStorage.getItem(TEACHER_ACCOUNTS_KEY);
  if (!raw) {
    return [] as TeacherAccount[];
  }

  try {
    const parsed = repairMojibakeDeep(JSON.parse(raw)) as TeacherAccount[];
    if (!Array.isArray(parsed)) {
      return [] as TeacherAccount[];
    }

    return parsed
      .filter((account) => account && typeof account.email === "string")
      .map((account) => ({
        ...account,
        email: normalizeEmail(account.email),
        password: account.password || "",
        createdAt: account.createdAt || Date.now(),
        updatedAt: account.updatedAt || account.createdAt || Date.now()
      }));
  } catch {
    return [] as TeacherAccount[];
  }
}

export function saveTeacherAccounts(accounts: TeacherAccount[]) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(TEACHER_ACCOUNTS_KEY, JSON.stringify(accounts));
  accounts.forEach((account) => {
    void cloudUpsertTeacherAccount(account);
  });
}

export function findTeacherAccountByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return (
    loadTeacherAccounts().find((account) => normalizeEmail(account.email) === normalizedEmail) || null
  );
}

export function registerTeacherAccount(payload: {
  email: string;
  password: string;
  name?: string;
  organization?: string;
}) {
  const normalizedEmail = normalizeEmail(payload.email);
  const existing = findTeacherAccountByEmail(normalizedEmail);

  if (existing) {
    return {
      ok: false as const,
      error: "Email này đã tồn tại trong hệ thống."
    };
  }

  const now = Date.now();
  const nextAccount: TeacherAccount = {
    email: normalizedEmail,
    password: payload.password,
    name: payload.name?.trim() || "",
    organization: payload.organization?.trim() || "",
    createdAt: now,
    updatedAt: now
  };

  const nextAccounts = [nextAccount, ...loadTeacherAccounts()];
  saveTeacherAccounts(nextAccounts);

  return {
    ok: true as const,
    account: nextAccount
  };
}

export function verifyTeacherCredentials(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const account = findTeacherAccountByEmail(normalizedEmail);
  if (!account) {
    return null;
  }

  if (account.password !== password) {
    return null;
  }

  return account;
}

export function updateTeacherAccount(email: string, updates: Partial<TeacherAccount>) {
  const normalizedEmail = normalizeEmail(email);
  const accounts = loadTeacherAccounts();
  const target = accounts.find((account) => normalizeEmail(account.email) === normalizedEmail);
  if (!target) {
    return null;
  }

  const nextAccount: TeacherAccount = {
    ...target,
    ...updates,
    email: normalizedEmail,
    updatedAt: Date.now()
  };

  saveTeacherAccounts(accounts.map((account) => (account.email === target.email ? nextAccount : account)));
  void cloudUpsertTeacherAccount(nextAccount);
  return nextAccount;
}

export async function findTeacherAccountByEmailAny(email: string) {
  const local = findTeacherAccountByEmail(email);
  if (local) return local;
  const cloud = await cloudGetTeacherAccountByEmail(email);
  if (!cloud) return null;
  const merged = loadTeacherAccounts();
  const exists = merged.some((item) => normalizeEmail(item.email) === normalizeEmail(cloud.email));
  if (!exists) {
    saveTeacherAccounts([cloud, ...merged]);
  }
  return cloud;
}

export async function verifyTeacherCredentialsAny(email: string, password: string) {
  const account = await findTeacherAccountByEmailAny(email);
  if (!account) return null;
  if (account.password !== password) return null;
  return account;
}

export async function registerTeacherAccountAny(payload: {
  email: string;
  password: string;
  name?: string;
  organization?: string;
}) {
  const existing = await findTeacherAccountByEmailAny(payload.email);
  if (existing) {
    return {
      ok: false as const,
      error: "Email này đã tồn tại trong hệ thống."
    };
  }
  const created = registerTeacherAccount(payload);
  if (created.ok) {
    void cloudUpsertTeacherAccount(created.account);
  }
  return created;
}
