import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import {
  accountPath,
  configRoot,
  productDataDir,
  sessionPath,
  sessionsDir,
} from "./paths.ts";
import type { ProductId } from "./products.ts";
import { PRODUCTS } from "./products.ts";
import type { AccountRecord, SavedSession, Session } from "./types.ts";

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  try {
    await chmod(path, 0o700);
  } catch {
    // Windows may ignore mode bits.
  }
}

async function writeSecureJson(path: string, value: unknown): Promise<void> {
  await ensureDir(configRoot());
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
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

export async function saveAccount(username: string, products: ProductId[]): Promise<void> {
  const payload: AccountRecord = {
    username,
    products,
    savedAt: new Date().toISOString(),
  };
  await writeSecureJson(accountPath(), payload);
}

export async function loadAccount(): Promise<AccountRecord | null> {
  return readJsonFile<AccountRecord>(accountPath());
}

export async function clearAccount(): Promise<void> {
  await unlinkIfExists(accountPath());
}

export async function saveProductSession(
  product: ProductId,
  session: Session,
  username: string,
): Promise<void> {
  await ensureDir(sessionsDir());
  await ensureDir(productDataDir(product));

  const expiresAt = new Date(
    Date.now() + Math.max(session.ExpiresIn ?? 3600, 0) * 1000,
  ).toISOString();

  const payload: SavedSession = {
    product,
    session,
    username,
    savedAt: new Date().toISOString(),
    expiresAt,
  };

  await writeSecureJson(sessionPath(product), payload);
}

export async function loadProductSession(
  product: ProductId,
  expectedUsername?: string,
): Promise<SavedSession | null> {
  const saved = await readJsonFile<SavedSession>(sessionPath(product));
  if (!saved) return null;
  if (expectedUsername && saved.username !== expectedUsername) return null;
  return saved;
}

export async function clearProductSession(product: ProductId): Promise<void> {
  await unlinkIfExists(sessionPath(product));
}

export async function clearAllSessions(): Promise<void> {
  await Promise.all(PRODUCTS.map((p) => clearProductSession(p)));
  await clearAccount();
}

export async function listSavedSessions(): Promise<SavedSession[]> {
  const out: SavedSession[] = [];
  for (const product of PRODUCTS) {
    const saved = await loadProductSession(product);
    if (saved) out.push(saved);
  }
  return out;
}
