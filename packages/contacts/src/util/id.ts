/** True when REF looks like a full Proton base64 ID. */
export function isFullId(value: string): boolean {
  return value.length >= 60 && value.endsWith("==");
}
