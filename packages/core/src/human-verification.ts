import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chmod, mkdir } from "node:fs/promises";

export const API_CODE_HUMAN_VERIFICATION = 9001;

export interface HumanVerificationDetails {
  HumanVerificationToken: string;
  HumanVerificationMethods: string[];
  WebUrl?: string;
  Title?: string;
  Description?: string;
  ExpiresAt?: number;
}

export interface HumanVerificationResult {
  token: string;
  tokenType: string;
}

/** CAPTCHA / human-verification failures (products may wrap as CliError). */
export class HumanVerificationError extends Error {
  readonly code: string;

  constructor(message: string, code = "captcha_error") {
    super(message);
    this.name = "HumanVerificationError";
    this.code = code;
  }
}

export function isHumanVerificationError(data: {
  Code?: number;
  Details?: Partial<HumanVerificationDetails>;
}): data is { Code: number; Details: HumanVerificationDetails } {
  return (
    data.Code === API_CODE_HUMAN_VERIFICATION &&
    typeof data.Details?.HumanVerificationToken === "string" &&
    Array.isArray(data.Details?.HumanVerificationMethods)
  );
}

export function humanVerificationHeaders(
  result: HumanVerificationResult,
): Record<string, string> {
  return {
    "x-pm-human-verification-token": result.token,
    "x-pm-human-verification-token-type": result.tokenType,
  };
}

function preferNonInteractive(): boolean {
  const flag = (name: string): boolean => {
    const value = process.env[name]?.trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes";
  };
  return (
    flag("CI") ||
    flag("PROTON_AGENT") ||
    flag("PROTONAUTH_AGENT") ||
    !process.stdin.isTTY
  );
}

/**
 * Load from *-api.proton.me so `/captcha/v1/assets` resolves to the CAPTCHA SPA.
 * `mail.proton.me/api/...` makes that path hit the Mail web app (blank window).
 * No ForceWebMessaging — that disables the WKWebView message-handler bridge.
 */
function captchaUrl(challengeToken: string): string {
  const url = new URL("https://account-api.proton.me/core/v4/captcha");
  url.searchParams.set("Token", challengeToken);
  return url.toString();
}

function coreSrcDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** Authenticator package root (owns the Swift helper + bin/). */
function authenticatorRoot(): string {
  return join(coreSrcDir(), "../../authenticator");
}

function repoRootBin(): string {
  return join(coreSrcDir(), "../../../bin/captcha-webview");
}

function authenticatorBinaryPath(): string {
  return join(authenticatorRoot(), "bin/captcha-webview");
}

function sourcePath(): string {
  return join(authenticatorRoot(), "scripts/captcha-webview.swift");
}

async function resolveCaptchaBinary(): Promise<string | null> {
  for (const candidate of [authenticatorBinaryPath(), repoRootBin()]) {
    if (await Bun.file(candidate).exists()) {
      return candidate;
    }
  }
  return null;
}

async function ensureCaptchaBinary(): Promise<string> {
  const existing = await resolveCaptchaBinary();
  if (existing) return existing;

  const bin = authenticatorBinaryPath();
  await mkdir(join(authenticatorRoot(), "bin"), { recursive: true });
  const source = sourcePath();
  const proc = Bun.spawn(["swiftc", "-O", "-o", bin, source], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new HumanVerificationError(
      "Failed to build CAPTCHA helper (needs Xcode / Command Line Tools).\n" +
        `${stderr || stdout || `exit ${exitCode}`}\n` +
        "Install with: xcode-select --install",
    );
  }
  try {
    await chmod(bin, 0o755);
  } catch {
    // ignore
  }
  return bin;
}

/**
 * macOS WKWebView CAPTCHA.
 *
 * Important: completing CAPTCHA on verify.proton.me in a normal browser does
 * NOT return a token to this CLI (postMessage-only). Solve it in the helper window.
 */
async function solveCaptchaWithWebView(
  challengeToken: string,
  options: { timeoutMs: number; onReady?: (url: string) => void },
): Promise<HumanVerificationResult> {
  const bin = await ensureCaptchaBinary();
  options.onReady?.(captchaUrl(challengeToken));

  const proc = Bun.spawn([bin, challengeToken], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
    } catch {
      // ignore
    }
  }, options.timeoutMs);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (timedOut) {
      throw new HumanVerificationError(
        "Timed out waiting for CAPTCHA.\n" +
          "Solve the CAPTCHA in the floating native window (not verify.proton.me in Safari).",
      );
    }

    if (exitCode !== 0) {
      const detail = stderr.trim() || stdout.trim() || `exit ${exitCode}`;
      if (/window_closed/.test(detail)) {
        throw new HumanVerificationError(
          "CAPTCHA window closed before verification finished.\n" +
            "Run signin again and complete the challenge in the native window.",
        );
      }
      throw new HumanVerificationError(`CAPTCHA helper failed.\n${detail}`);
    }

    const line = stdout
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1);
    if (!line) {
      throw new HumanVerificationError(
        "CAPTCHA helper returned no token.\n" +
          (stderr.trim() ? stderr.trim() : "No stderr from helper."),
      );
    }

    const parsed = JSON.parse(line) as { token?: string; tokenType?: string };
    if (!parsed.token) {
      throw new HumanVerificationError(
        "CAPTCHA helper returned an invalid payload.",
      );
    }
    return { token: parsed.token, tokenType: parsed.tokenType ?? "captcha" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Open Proton CAPTCHA and wait for the solved verification token.
 */
export async function solveCaptchaInBrowser(
  details: HumanVerificationDetails,
  options: {
    timeoutMs?: number;
    onReady?: (url: string) => void;
  } = {},
): Promise<HumanVerificationResult> {
  if (!details.HumanVerificationMethods.includes("captcha")) {
    throw new HumanVerificationError(
      "Human verification required, but CAPTCHA is not available for this challenge.\n" +
        `Methods: ${details.HumanVerificationMethods.join(", ") || "(none)"}`,
    );
  }

  if (preferNonInteractive()) {
    throw new HumanVerificationError(
      "CAPTCHA required. Run `proton signin` (or a product signin) interactively once " +
        "(solve the floating native window), then retry from the agent.",
      "captcha_required",
    );
  }

  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;

  if (process.platform !== "darwin") {
    throw new HumanVerificationError(
      "CAPTCHA is currently supported on macOS only (native WKWebView helper).\n" +
        "Run `proton signin` from a Mac desktop session.",
      "captcha_unsupported",
    );
  }

  return solveCaptchaWithWebView(details.HumanVerificationToken, {
    timeoutMs,
    onReady: options.onReady,
  });
}
