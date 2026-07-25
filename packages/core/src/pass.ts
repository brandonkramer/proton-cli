/** Shared Proton Pass helpers for unified `proton signin --pass`. */

import { loadAccount } from "./store.ts";

export const PASS_ENV_CANDIDATES = [
  "PROTON_PASS",
  "PROTONVPN_PASS",
  "PROTONAUTH_PASS",
] as const;

export interface PassLoginFields {
  username: string;
  password: string;
}

/** Normalize `Vault/Item` or `pass://Vault/Item[/field]` to `pass://Vault/Item`. */
export function normalizePassItemRef(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Proton Pass item reference is empty.");
  }

  let ref = trimmed;
  if (!ref.startsWith("pass://")) {
    ref = `pass://${ref}`;
  }

  const body = ref.slice("pass://".length);
  const parts = body.split("/").filter((part) => part.length > 0);
  if (parts.length < 2) {
    throw new Error(
      'Proton Pass ref must be "pass://Vault/Item" (or "Vault/Item").',
    );
  }

  const fieldNames = new Set(["password", "username", "email", "totp"]);
  if (
    parts.length >= 3 &&
    fieldNames.has(parts[parts.length - 1]!.toLowerCase())
  ) {
    parts.pop();
  }

  if (parts.length < 2) {
    throw new Error(
      'Proton Pass ref must be "pass://Vault/Item" (or "Vault/Item").',
    );
  }

  const item = parts[parts.length - 1]!;
  const vault = parts.slice(0, -1).join("/");
  return `pass://${vault}/${item}`;
}

/** Pass share/item ids are long base64url strings. */
export function looksLikePassId(value: string): boolean {
  return value.length >= 40 && /^[A-Za-z0-9_-]+=*$/.test(value);
}

export interface CanonicalPassRef {
  /** Stable `pass://<shareId>/<itemId>` when resolved; else normalized name ref. */
  ref: string;
  /** True when multiple same-title items existed and one was chosen. */
  disambiguated: boolean;
  title?: string;
}

interface PassListItem {
  id: string;
  share_id: string;
  title: string;
  item_type?: string;
}

function parsePassListItems(stdout: string): PassListItem[] {
  const parsed = JSON.parse(stdout) as
    | { items?: PassListItem[] }
    | PassListItem[];
  return Array.isArray(parsed) ? parsed : (parsed.items ?? []);
}

async function ensurePassCli(): Promise<string> {
  const path = Bun.which("pass-cli");
  if (!path) {
    throw new Error(
      "pass-cli not found on PATH.\n" +
        "Install Proton Pass CLI, run `pass-cli login`, then retry.\n" +
        "Docs: https://protonpass.github.io/pass-cli/",
    );
  }
  return path;
}

async function runPassCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const bin = await ensurePassCli();
  const proc = Bun.spawn([bin, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode };
}

async function viewField(
  itemRef: string,
  field: string,
  options: { optional?: boolean } = {},
): Promise<string | null> {
  const uri = `${itemRef}/${field}`;
  const { stdout, stderr, exitCode } = await runPassCli([
    "item",
    "view",
    uri,
  ]);

  if (exitCode !== 0) {
    const detail = stderr || stdout;
    if (
      /not authenticated|please log in|session.*(expired|locked)|locked/i.test(
        detail,
      )
    ) {
      throw new Error(
        "Proton Pass CLI is not authenticated.\n" +
          "Run `pass-cli login`, then retry.",
      );
    }
    if (options.optional) return null;
    throw new Error(
      `pass-cli failed to read ${field} from ${itemRef}.\n${detail || `exit ${exitCode}`}`,
    );
  }

  const value = stdout.trim();
  return value.length > 0 ? value : null;
}

/**
 * Resolve a name-based Pass ref to a stable share/item ID ref.
 * When several items share a title, prefer the one that has TOTP.
 */
export async function canonicalizePassItemRef(
  ref: string,
): Promise<CanonicalPassRef> {
  const normalized = normalizePassItemRef(ref);
  const body = normalized.slice("pass://".length);
  const parts = body.split("/").filter((part) => part.length > 0);
  const itemPart = parts[parts.length - 1]!;
  const vaultPart = parts.slice(0, -1).join("/");

  if (looksLikePassId(itemPart)) {
    return { ref: normalized, disambiguated: false };
  }

  const listed = await runPassCli([
    "item",
    "list",
    "--vault-name",
    vaultPart,
    "--output",
    "json",
  ]);
  if (listed.exitCode !== 0) {
    // Fall back to name ref (pass-cli view may still resolve).
    return { ref: normalized, disambiguated: false, title: itemPart };
  }

  let items: PassListItem[];
  try {
    items = parsePassListItems(listed.stdout);
  } catch {
    return { ref: normalized, disambiguated: false, title: itemPart };
  }

  const titleLower = itemPart.toLowerCase();
  const matches = items.filter(
    (item) => (item.title ?? "").toLowerCase() === titleLower,
  );

  if (matches.length === 0) {
    return { ref: normalized, disambiguated: false, title: itemPart };
  }

  if (matches.length === 1) {
    const only = matches[0]!;
    return {
      ref: `pass://${only.share_id}/${only.id}`,
      disambiguated: false,
      title: only.title,
    };
  }

  const withTotp: PassListItem[] = [];
  for (const match of matches) {
    const idRef = `pass://${match.share_id}/${match.id}`;
    const totp = await viewField(idRef, "totp", { optional: true });
    if (totp) withTotp.push(match);
  }

  if (withTotp.length === 1) {
    const chosen = withTotp[0]!;
    return {
      ref: `pass://${chosen.share_id}/${chosen.id}`,
      disambiguated: true,
      title: chosen.title,
    };
  }

  const format = (item: PassListItem): string =>
    `  pass://${item.share_id}/${item.id}` +
    (item.item_type ? ` (${item.item_type})` : "");

  if (withTotp.length > 1) {
    throw new Error(
      `Multiple Pass items titled "${itemPart}" in vault "${vaultPart}" have TOTP.\n` +
        `Use a specific ID ref:\n${withTotp.map(format).join("\n")}`,
    );
  }

  throw new Error(
    `Multiple Pass items titled "${itemPart}" in vault "${vaultPart}", and none have TOTP.\n` +
      `pass-cli picks one by name (often the wrong duplicate).\n` +
      `Delete the extra login, rename one, or use an ID ref:\n${matches.map(format).join("\n")}`,
  );
}

export async function resolvePassLogin(ref: string): Promise<PassLoginFields> {
  const { ref: itemRef } = await canonicalizePassItemRef(ref);
  const [username, email, password] = await Promise.all([
    viewField(itemRef, "username", { optional: true }),
    viewField(itemRef, "email", { optional: true }),
    viewField(itemRef, "password"),
  ]);

  const login = username || email;
  if (!login) {
    throw new Error(
      `Proton Pass item ${itemRef} has no username or email field.`,
    );
  }
  if (!password) {
    throw new Error(`Proton Pass item ${itemRef} has no password field.`);
  }

  return { username: login, password };
}

export async function resolvePassTotp(ref: string): Promise<string | null> {
  const { ref: itemRef } = await canonicalizePassItemRef(ref);
  return viewField(itemRef, "totp", { optional: true });
}

/** Sync: CLI option, then env (`PROTON_PASS`, …). Does not read account.json. */
export function resolvePassRefFromEnv(optionValue?: string): string | undefined {
  const fromOption = optionValue?.trim();
  if (fromOption) return fromOption;
  for (const key of PASS_ENV_CANDIDATES) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * Option → env → saved `proton account` Pass ref (`account.json`).
 * Prefer this for sign-in and password unlock.
 */
export async function resolvePassRef(
  optionValue?: string,
): Promise<string | undefined> {
  const fromEnv = resolvePassRefFromEnv(optionValue);
  if (fromEnv) return fromEnv;
  const account = await loadAccount();
  const fromAccount = account?.passRef?.trim();
  return fromAccount || undefined;
}
