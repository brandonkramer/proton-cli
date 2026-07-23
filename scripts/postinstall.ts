/**
 * Root postinstall: workspace links + product setup (openpgp / captcha / wireguard).
 * Best-effort — never fails the overall install.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function run(label: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn("bun", args, {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", (error) => {
      console.warn(`${label}:`, error.message);
      resolve();
    });
    child.on("close", (code) => {
      if (code !== 0) console.warn(`${label}: exit ${code}`);
      resolve();
    });
  });
}

await run("link-packages", ["run", "scripts/link-packages.ts"]);
await run("vpn postinstall", [
  "run",
  "packages/vpn/scripts/patch-openpgp.ts",
]);
await run("vpn wireguard", [
  "run",
  "packages/vpn/scripts/ensure-wireguard.ts",
]);
await run("auth postinstall", [
  "run",
  "packages/authenticator/scripts/patch-openpgp.ts",
]);
await run("auth captcha", [
  "run",
  "packages/authenticator/scripts/build-captcha.ts",
]);
