export type CryptoKey = unknown;

export interface SessionKeyMaterial {
  data: Uint8Array;
  algorithm: string;
}

export const CardClear = 0;
export const CardEncrypted = 1;
export const CardSigned = 2;
export const CardEncryptedSigned = 3;

export interface EventCard {
  Type: number;
  Data: string;
  Signature?: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

export function cardFromRaw(raw: Record<string, unknown>): EventCard {
  return {
    Type: typeof raw.Type === "number" ? raw.Type : Number(raw.Type ?? 0),
    Data: String(raw.Data ?? ""),
    Signature: raw.Signature ? String(raw.Signature) : undefined,
  };
}
