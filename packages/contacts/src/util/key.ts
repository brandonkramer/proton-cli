import { readFile } from "node:fs/promises";
import { getCryptoProxy } from "@bkramer/proton-core";
import { CliError } from "./errors.ts";

function armoredPublicKeyBytes(armored: string): Uint8Array {
  const lines = armored.trim().split(/\r?\n/);
  const body: string[] = [];
  let inBody = false;
  for (const line of lines) {
    if (line.startsWith("-----BEGIN")) {
      inBody = true;
      continue;
    }
    if (line.startsWith("-----END")) break;
    if (inBody) body.push(line);
  }
  if (body.length === 0) {
    throw new CliError("invalid public key: missing armored body");
  }
  const binary = Buffer.from(body.join(""), "base64");
  return new Uint8Array(binary);
}

export async function readArmoredKey(path: string): Promise<string> {
  const data =
    path === "-"
      ? await new Promise<string>((resolve, reject) => {
          const chunks: Buffer[] = [];
          process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
          process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          process.stdin.on("error", reject);
        })
      : await readFile(path, "utf8");
  const trimmed = data.trim();
  if (!trimmed) {
    throw new CliError("empty key input");
  }
  return trimmed;
}

/** Encode an armored public key as a vCard KEY property value. */
export async function encodePinnedKey(armored: string): Promise<string> {
  const trimmed = armored.trim();
  const proxy = await getCryptoProxy();
  await proxy.importPublicKey({ armoredKey: trimmed });
  const bytes = armoredPublicKeyBytes(trimmed);
  return `data:application/pgp-keys;base64,${Buffer.from(bytes).toString("base64")}`;
}

export function prependUnique(existing: string[], value: string): string[] {
  const out = [value];
  for (const entry of existing) {
    if (entry !== value) out.push(entry);
  }
  return out;
}
