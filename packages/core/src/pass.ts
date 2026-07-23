/** Shared Proton Pass helpers for unified `proton signin --pass`. */

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

export async function resolvePassLogin(ref: string): Promise<PassLoginFields> {
  const itemRef = normalizePassItemRef(ref);
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
  const itemRef = normalizePassItemRef(ref);
  return viewField(itemRef, "totp", { optional: true });
}

export function resolvePassRefFromEnv(optionValue?: string): string | undefined {
  const fromOption = optionValue?.trim();
  if (fromOption) return fromOption;
  for (const key of PASS_ENV_CANDIDATES) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}
