import {
  clearProductSession,
  loadProductSession,
  saveProductSession,
} from "@bkramer/proton-core";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import type {
  LocalEntriesStore,
  SavedSession,
  Session,
} from "../proton/types.ts";
import { configDir, localEntriesPath, sessionPath } from "./paths.ts";

async function ensureConfigDir(): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  try {
    await chmod(configDir(), 0o700);
  } catch {
    // Windows may ignore mode bits.
  }
}

async function writeSecureJson(path: string, value: unknown): Promise<void> {
  await ensureConfigDir();
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    await chmod(path, 0o600);
  } catch {
    // Windows may ignore mode bits.
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function unlinkIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function saveSession(
  session: Session,
  username: string,
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + Math.max(session.ExpiresIn ?? 3600, 0) * 1000,
  ).toISOString();

  const payload: SavedSession = {
    session,
    username,
    savedAt: new Date().toISOString(),
    expiresAt,
  };

  await writeSecureJson(sessionPath(), payload);
  await saveProductSession("authenticator", session, username);
}

export async function loadSession(
  expectedUsername?: string,
): Promise<SavedSession | null> {
  const saved = await readJsonFile<SavedSession>(sessionPath());
  if (saved) {
    if (expectedUsername && saved.username !== expectedUsername) {
      return null;
    }
    // Access token expired — keep file so refresh can still use RefreshToken.
    return saved;
  }

  const shared = await loadProductSession("authenticator", expectedUsername);
  if (!shared) return null;
  const hydrated: SavedSession = {
    session: shared.session,
    username: shared.username,
    savedAt: shared.savedAt,
    expiresAt: shared.expiresAt,
  };
  await writeSecureJson(sessionPath(), hydrated);
  return hydrated;
}

export async function clearSession(): Promise<void> {
  await unlinkIfExists(sessionPath());
  await clearProductSession("authenticator");
}

export async function saveLocalEntries(store: LocalEntriesStore): Promise<void> {
  await writeSecureJson(localEntriesPath(), store);
}

export async function loadLocalEntries(): Promise<LocalEntriesStore> {
  const stored = await readJsonFile<LocalEntriesStore>(localEntriesPath());
  if (!stored?.entries) {
    return { entries: [], lastSyncAt: null, authenticatorKeyId: null };
  }
  return stored;
}

export async function clearLocalEntries(): Promise<void> {
  await unlinkIfExists(localEntriesPath());
}

export async function clearAllState(): Promise<void> {
  await clearSession();
  await clearLocalEntries();
}
