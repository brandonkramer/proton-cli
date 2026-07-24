import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(path)));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(path);
    }
  }
  return files;
}

describe("mail crypto proxy", () => {
  test("does not call CryptoProxy.setEndpoint (shared core unlock)", async () => {
    const root = join(import.meta.dir, "..", "src");
    const files = await collectTsFiles(root);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source).not.toMatch(/setEndpoint\s*\(/);
    }
  });

  test("users unlock goes through core unlockUserKeys", async () => {
    const users = await readFile(
      join(import.meta.dir, "..", "src", "proton", "users.ts"),
      "utf8",
    );
    expect(users).toContain("unlockUserKeys");
    expect(users).toContain('@bkramer/proton-core');
  });
});
