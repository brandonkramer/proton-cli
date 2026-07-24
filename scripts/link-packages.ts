/**
 * Ensure @bkramer/proton-* workspace packages resolve after install.
 * Safe to re-run; never fails the overall install.
 */
import { lstat, mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const packages: Array<[string, string]> = [
  ["@bkramer/proton-core", "packages/core"],
  ["@bkramer/proton-vpn", "packages/vpn"],
  ["@bkramer/proton-authenticator", "packages/authenticator"],
  ["@bkramer/proton-contacts", "packages/contacts"],
  ["@bkramer/proton-calendar", "packages/calendar"],
  ["@bkramer/proton-drive", "packages/drive"],
  ["@bkramer/proton-settings", "packages/settings"],
  ["@bkramer/proton-mail", "packages/mail"],
];

async function linkOne(name: string, rel: string): Promise<void> {
  const dest = join(root, "node_modules", ...name.split("/"));
  const src = join(root, rel);
  await mkdir(dirname(dest), { recursive: true });
  try {
    const st = await lstat(dest);
    if (st.isSymbolicLink() || st.isDirectory()) return;
    await rm(dest, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await symlink(src, dest, "dir");
}

try {
  for (const [name, rel] of packages) {
    await linkOne(name, rel);
  }
} catch (error) {
  console.warn(
    "@bkramer/proton-cli: workspace link skipped:",
    error instanceof Error ? error.message : error,
  );
}
