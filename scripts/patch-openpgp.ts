/**
 * @protontech/openpgp only exports `./lightweight` under the `browser` condition.
 * Bun (Node-like) resolution therefore fails when @protontech/crypto imports it.
 * Add import/default conditions pointing at the same lightweight build.
 *
 * Finds the package under classic hoists, npm aliases (`openpgp` →
 * `@protontech/openpgp`), and Bun's `node_modules/.bun/@protontech+openpgp@*` store.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

function classicCandidates(root: string): string[] {
  return [
    join(root, "node_modules", "openpgp", "package.json"),
    join(root, "node_modules", "@protontech", "openpgp", "package.json"),
  ];
}

function findInBunStore(nodeModules: string): string | null {
  const bunDir = join(nodeModules, ".bun");
  if (!existsSync(bunDir)) return null;

  for (const entry of readdirSync(bunDir)) {
    if (
      !entry.startsWith("@protontech+openpgp@") &&
      !entry.startsWith("openpgp@")
    ) {
      continue;
    }
    const nested = [
      join(
        bunDir,
        entry,
        "node_modules",
        "@protontech",
        "openpgp",
        "package.json",
      ),
      join(bunDir, entry, "node_modules", "openpgp", "package.json"),
    ];
    for (const candidate of nested) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function findOpenpgpPackageJson(
  startDir = scriptDir,
): string | null {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    for (const candidate of classicCandidates(dir)) {
      if (existsSync(candidate)) return candidate;
    }
    const fromBun = findInBunStore(join(dir, "node_modules"));
    if (fromBun) return fromBun;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function patchOpenpgp(packagePath?: string): boolean {
  const path = packagePath ?? findOpenpgpPackageJson();
  if (!path) {
    console.warn("patch-openpgp: openpgp not installed yet; skipping");
    return false;
  }

  const raw = readFileSync(path, "utf8");
  const pkg = JSON.parse(raw) as {
    exports?: Record<string, Record<string, string> | string>;
  };
  const lightweight = pkg.exports?.["./lightweight"];
  if (!lightweight || typeof lightweight === "string") {
    console.warn("patch-openpgp: unexpected openpgp exports; skipping");
    return false;
  }

  const target =
    lightweight.browser ?? "./dist/lightweight/openpgp.min.mjs";
  let changed = false;
  for (const key of ["import", "require", "default"] as const) {
    if (!lightweight[key]) {
      lightweight[key] = target;
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(
      `patch-openpgp: added Node resolution for openpgp/lightweight (${path})`,
    );
  } else {
    console.log(`patch-openpgp: already patched (${path})`);
  }
  return changed;
}

if (import.meta.main) {
  patchOpenpgp();
}
