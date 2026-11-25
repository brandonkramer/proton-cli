/**
 * Best-effort CAPTCHA helper build during package postinstall.
 * macOS: WKWebView (Swift). Windows: WebView2 (C# / .NET).
 * Never fails the overall install.
 */
import { chmod, copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = join(root, "scripts");
const binDir = join(root, "bin");

async function buildDarwin(): Promise<void> {
  const bin = join(binDir, "captcha-webview");
  const source = join(scriptsDir, "captcha-webview.swift");

  if (await Bun.file(bin).exists()) {
    console.log("@bkramer/proton-cli: CAPTCHA helper already built");
    return;
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
      "@bkramer/proton-cli: could not build CAPTCHA helper (needs Xcode CLT).",
    );
    if (stderr.trim() || stdout.trim()) {
      console.log(stderr.trim() || stdout.trim());
    }
    console.log("@bkramer/proton-cli: retry later with: bun run build:captcha");
    return;
  }

  try {
    await chmod(bin, 0o755);
  } catch {
    // ignore
  }

  console.log("@bkramer/proton-cli: CAPTCHA helper built (bin/captcha-webview)");
}

async function buildWin32(): Promise<void> {
  const bin = join(binDir, "captcha-webview.exe");
  const csproj = join(scriptsDir, "captcha-webview.csproj");

  if (await Bun.file(bin).exists()) {
    console.log("@bkramer/proton-cli: CAPTCHA helper already built");
    return;
  }

  await mkdir(binDir, { recursive: true });

  const publishDir = join(binDir, ".captcha-publish");
  await rm(publishDir, { recursive: true, force: true });

  const proc = Bun.spawn(
    [
      "dotnet",
      "publish",
      csproj,
      "-c",
      "Release",
      "-r",
      "win-x64",
      "--self-contained",
      "false",
      "-o",
      publishDir,
      "-p:PublishSingleFile=true",
      "-p:IncludeNativeLibrariesForSelfExtract=true",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    console.log(
      "@bkramer/proton-cli: could not build CAPTCHA helper (needs .NET SDK).",
    );
    if (stderr.trim() || stdout.trim()) {
      console.log(stderr.trim() || stdout.trim());
    }
    console.log("@bkramer/proton-cli: retry later with: bun run build:captcha");
    await rm(publishDir, { recursive: true, force: true }).catch(() => {});
    return;
  }

  const publishedExe = join(publishDir, "captcha-webview.exe");
  if (!(await Bun.file(publishedExe).exists())) {
    console.log(
      "@bkramer/proton-cli: CAPTCHA publish succeeded but exe missing.",
    );
    await rm(publishDir, { recursive: true, force: true }).catch(() => {});
    return;
  }

  // Copy the single-file exe plus any leftover native sidecars WebView2 needs.
  await copyFile(publishedExe, bin);
  for (const name of await readdir(publishDir)) {
    if (name === "captcha-webview.exe") continue;
    if (!/\.(dll|json|pdb)$/i.test(name) && !name.endsWith(".exe")) continue;
    try {
      await copyFile(join(publishDir, name), join(binDir, name));
    } catch {
      // best-effort sidecars
    }
  }

  await rm(publishDir, { recursive: true, force: true }).catch(() => {});
  console.log(
    "@bkramer/proton-cli: CAPTCHA helper built (bin/captcha-webview.exe)",
  );
}

if (process.platform === "darwin") {
  await buildDarwin();
  process.exit(0);
}

if (process.platform === "win32") {
  await buildWin32();
  process.exit(0);
}

console.log(
  `@bkramer/proton-cli: CAPTCHA helper unsupported on ${process.platform}; skipping build`,
);
process.exit(0);
