/** Stable product ids used for session files and sign-in fan-out. */
export const PRODUCTS = [
  "vpn",
  "authenticator",
  "drive",
  "calendar",
  "contacts",
] as const;

export type ProductId = (typeof PRODUCTS)[number];

export type ProductNamespace =
  | "vpn"
  | "auth"
  | "drive"
  | "cal"
  | "contacts";

export function isProductId(value: string): value is ProductId {
  return (PRODUCTS as readonly string[]).includes(value);
}

/** CLI namespace for each product (`proton <namespace> …`). */
export function productNamespace(product: ProductId): ProductNamespace {
  switch (product) {
    case "authenticator":
      return "auth";
    case "drive":
      return "drive";
    case "calendar":
      return "cal";
    case "contacts":
      return "contacts";
    default:
      return "vpn";
  }
}

const PRODUCT_ALIASES: Record<string, ProductId> = {
  vpn: "vpn",
  auth: "authenticator",
  authenticator: "authenticator",
  drive: "drive",
  cal: "calendar",
  calendar: "calendar",
  ctc: "contacts",
  contacts: "contacts",
};

const KNOWN_PRODUCT_NAMES = [
  "vpn",
  "auth (authenticator)",
  "drive",
  "cal (calendar)",
  "ctc (contacts)",
  "all",
] as const;

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
    const normalized = PRODUCT_ALIASES[part] ?? null;
    if (!normalized || !isProductId(normalized)) {
      throw new Error(
        `Unknown product "${part}". Use: ${KNOWN_PRODUCT_NAMES.join(", ")}.`,
      );
    }
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}
