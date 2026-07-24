/** Pure hash helpers — keep out of `proxy.ts` so test mocks cannot strip them. */

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

export function sha256Base64(data: Uint8Array): string {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(data);
  return hash.digest("base64");
}

export function sha256Raw(data: Uint8Array): Uint8Array {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(data);
  return new Uint8Array(hash.digest());
}
