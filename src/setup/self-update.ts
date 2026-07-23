import { spawn } from "node:child_process";

export type InstallChannel = "bun" | "npm" | "unknown";

export interface UpdatePlan {
  channel: InstallChannel;
  command: string;
  args: string[];
}

export interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
}

/** npm package name (GitHub repo is brandonkramer/proton-cli). */
const PACKAGE_NAME = "proton-unified-cli";

function run(
  command: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function detectInstallChannel(
  entryPath = process.argv[1] ?? "",
  hasBunRuntime = typeof process.versions.bun === "string",
): InstallChannel {
  const path = entryPath.replace(/\\/g, "/");
  if (path.includes(".bun/install/global") || path.includes("/.bun/bin/")) {
    return "bun";
  }
  if (
    path.includes("/npm/node_modules/") ||
    path.includes("/lib/node_modules/proton-unified-cli") ||
    path.includes("/lib/node_modules/proton-cli") ||
    path.includes("/pnpm-global/")
  ) {
    return "npm";
  }
  if (
    (path.includes("node_modules/proton-unified-cli") ||
      path.includes("node_modules/proton-cli")) &&
    hasBunRuntime
  ) {
    return "bun";
  }
  if (
    path.includes("node_modules/proton-unified-cli") ||
    path.includes("node_modules/proton-cli")
  ) {
    return "npm";
  }
  if (hasBunRuntime) return "bun";
  return "unknown";
}

export function buildUpdatePlan(
  channel: InstallChannel,
  target = "latest",
): UpdatePlan {
  const spec =
    target === "latest" ? `${PACKAGE_NAME}@latest` : `${PACKAGE_NAME}@${target}`;
  if (channel === "npm") {
    return { channel, command: "npm", args: ["install", "-g", spec] };
  }
  return {
    channel: channel === "unknown" ? "bun" : channel,
    command: "bun",
    args: ["add", "-g", spec],
  };
}

export async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(
    `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to check npm for updates (HTTP ${response.status}).`,
    );
  }
  const data = (await response.json()) as { version?: string };
  if (!data.version) {
    throw new Error("npm registry response missing version.");
  }
  return data.version;
}

export function compareVersions(current: string, latest: string): VersionInfo {
  return {
    current,
    latest,
    updateAvailable: current !== latest,
  };
}

export async function runSelfUpdate(plan: UpdatePlan): Promise<{
  stdout: string;
  stderr: string;
}> {
  const result = await run(plan.command, plan.args);
  if (result.code !== 0) {
    throw new Error(
      `Update failed (${plan.command} ${plan.args.join(" ")}).\n` +
        `${result.stderr || result.stdout}`.trim(),
    );
  }
  return { stdout: result.stdout, stderr: result.stderr };
}
