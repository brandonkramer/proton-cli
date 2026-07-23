/** Stable product ids used for session files and sign-in fan-out. */
export const PRODUCTS = ["vpn", "authenticator"] as const;

export type ProductId = (typeof PRODUCTS)[number];

export function isProductId(value: string): value is ProductId {
  return (PRODUCTS as readonly string[]).includes(value);
}

/** CLI namespace for each product (`proton <namespace> …`). */
export function productNamespace(product: ProductId): "vpn" | "auth" {
  return product === "authenticator" ? "auth" : "vpn";
}

export function parseProductList(
  raw: string | undefined,
  fallback: readonly ProductId[] = PRODUCTS,
): ProductId[] {
  if (!raw || raw.trim() === "" || raw.trim() === "all") {
    return [...fallback];
  }
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const out: ProductId[] = [];
  for (const part of parts) {
    const normalized =
      part === "auth" || part === "authenticator"
        ? "authenticator"
        : part === "vpn"
          ? "vpn"
          : null;
    if (!normalized) {
      throw new Error(
        `Unknown product "${part}". Use: vpn, auth (authenticator), or all.`,
      );
    }
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}
