/**
 * Ensure @proton-cli/* resolves after install (npm tarball or bun workspaces).
 * Safe to re-run; never fails the overall install.
 */
import { lstat, mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const packages: Array<[string, string]> = [
  ["@proton-cli/core", "packages/core"],
  ["@proton-cli/vpn", "packages/vpn"],
  ["@proton-cli/authenticator", "packages/authenticator"],
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
    "proton-unified-cli: workspace link skipped:",
    error instanceof Error ? error.message : error,
  );
}
