import { sha256Base64 } from "./proxy.ts";

/** Reject omitted, replayed, or reordered block indices (must be 1..n contiguous). */
export function assertContiguousBlockIndices(indices: number[]): void {
  if (indices.length === 0) {
    throw new Error("Revision has no content blocks.");
  }
  const seen = new Set<number>();
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i]!;
    if (seen.has(index)) {
      throw new Error(`Duplicate/replayed block index ${index}.`);
    }
    seen.add(index);
    if (index !== i + 1) {
      throw new Error(
        `Omitted or reordered blocks: expected index ${i + 1}, got ${index}.`,
      );
    }
  }
}

export function assertBlockHash(
  encrypted: Uint8Array,
  expectedHashBase64?: string | null,
): void {
  if (!expectedHashBase64) return;
  const actual = sha256Base64(encrypted);
  if (actual !== expectedHashBase64) {
    throw new Error("Block hash mismatch (encrypted content integrity).");
  }
}

export function buildRevisionManifest(
  rawHashesByIndex: Map<number, Uint8Array>,
): Uint8Array {
  const indices = [...rawHashesByIndex.keys()].sort((a, b) => a - b);
  let total = 0;
  for (const idx of indices) total += rawHashesByIndex.get(idx)!.length;
  const manifest = new Uint8Array(total);
  let offset = 0;
  for (const idx of indices) {
    const hash = rawHashesByIndex.get(idx)!;
    manifest.set(hash, offset);
    offset += hash.length;
  }
  return manifest;
}
