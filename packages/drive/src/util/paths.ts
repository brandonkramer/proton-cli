/** Drive path helpers (roman-16 compatible `/`-rooted paths). */

export function normalizeDrivePath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === ".") return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

export function dirOf(path: string): string {
  const normalized = normalizeDrivePath(path);
  if (normalized === "/") return "/";
  const last = normalized.lastIndexOf("/");
  if (last <= 0) return "/";
  return normalized.slice(0, last) || "/";
}

export function baseOf(path: string): string {
  const normalized = normalizeDrivePath(path);
  if (normalized === "/") return "";
  const last = normalized.lastIndexOf("/");
  return normalized.slice(last + 1);
}

export function joinDrivePath(parent: string, name: string): string {
  const base = normalizeDrivePath(parent);
  const leaf = name.replace(/^\/+/, "");
  if (base === "/") return `/${leaf}`;
  return `${base}/${leaf}`;
}
