import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chmod, mkdir } from "node:fs/promises";
import { preferNonInteractive } from "../util/agent.ts";
import { CliError } from "../util/errors.ts";

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

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../..");
}

function binaryPath(): string {
  return join(packageRoot(), "bin/captcha-webview");
}

function sourcePath(): string {
  return join(packageRoot(), "scripts/captcha-webview.swift");
}

async function ensureCaptchaBinary(): Promise<string> {
  const bin = binaryPath();
  if (await Bun.file(bin).exists()) {
    return bin;
  }

  await mkdir(join(packageRoot(), "bin"), { recursive: true });
  const source = sourcePath();
  const proc = Bun.spawn(
    ["swiftc", "-O", "-o", bin, source],
    { stdout: "pipe", stderr: "pipe", stdin: "ignore" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new CliError(
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
      throw new CliError(
        "Timed out waiting for CAPTCHA.\n" +
          "Solve the CAPTCHA in the floating native window (not verify.proton.me in Safari).",
      );
    }

    if (exitCode !== 0) {
      const detail = stderr.trim() || stdout.trim() || `exit ${exitCode}`;
      if (/window_closed/.test(detail)) {
        throw new CliError(
          "CAPTCHA window closed before verification finished.\n" +
            "Run signin again and complete the challenge in the native window.",
        );
      }
      throw new CliError(`CAPTCHA helper failed.\n${detail}`);
    }

    const line = stdout
      .split("\n")
      .map((part) => part.trim())
      .filter(Boolean)
      .at(-1);
    if (!line) {
      throw new CliError(
        "CAPTCHA helper returned no token.\n" +
          (stderr.trim() ? stderr.trim() : "No stderr from helper."),
      );
    }

    const parsed = JSON.parse(line) as { token?: string; tokenType?: string };
    if (!parsed.token) {
      throw new CliError("CAPTCHA helper returned an invalid payload.");
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
    throw new CliError(
      "Human verification required, but CAPTCHA is not available for this challenge.\n" +
        `Methods: ${details.HumanVerificationMethods.join(", ") || "(none)"}`,
    );
  }

  if (preferNonInteractive()) {
    throw new CliError(
      "CAPTCHA required. Run `proton auth signin` (or `proton signin`) interactively once " +
        "(solve the floating native window), then retry from the agent.",
      "captcha_required",
    );
  }

  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;

  if (process.platform !== "darwin") {
    throw new CliError(
      "CAPTCHA is currently supported on macOS only (native WKWebView helper).\n" +
        "Run `proton auth signin` (or `proton signin`) from a Mac desktop session.",
      "captcha_unsupported",
    );
  }

  return solveCaptchaWithWebView(details.HumanVerificationToken, {
    timeoutMs,
    onReady: options.onReady,
  });
}
