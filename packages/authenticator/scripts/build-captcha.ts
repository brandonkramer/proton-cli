/**
 * Best-effort CAPTCHA helper build during package postinstall.
 * macOS only (WKWebView). Never fails the overall install.
 */
import { chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(root, "bin");
const bin = join(binDir, "captcha-webview");
const source = join(root, "scripts", "captcha-webview.swift");

if (process.platform !== "darwin") {
  console.log(
    "@proton-cli/authenticator: CAPTCHA helper is macOS-only; skipping build",
  );
  process.exit(0);
}

if (await Bun.file(bin).exists()) {
  console.log("@proton-cli/authenticator: CAPTCHA helper already built");
  process.exit(0);
}

await mkdir(binDir, { recursive: true });

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
  console.log(
    "proton-authenticator-cli: could not build CAPTCHA helper (needs Xcode CLT).",
  );
  if (stderr.trim() || stdout.trim()) {
    console.log(stderr.trim() || stdout.trim());
  }
  console.log(
    "proton-authenticator-cli: retry later with: bun run build:captcha",
  );
  process.exit(0);
}

try {
  await chmod(bin, 0o755);
} catch {
  // ignore
}

console.log("proton-authenticator-cli: CAPTCHA helper built (bin/captcha-webview)");
process.exit(0);
