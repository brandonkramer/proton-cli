const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parse user duration strings like `15m`, `1h`, `1d`, or Go-style `1h30m`. */
export function parseDuration(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Duration is required.");
  }

  const chunks = trimmed.match(/\d+(?:\.\d+)?[smhd]/gi);
  if (!chunks || chunks.join("") !== trimmed.replace(/\s+/g, "")) {
    throw new Error(`Invalid duration: ${input}`);
  }

  let total = 0;
  for (const chunk of chunks) {
    const match = /^(\d+(?:\.\d+)?)([smhd])$/i.exec(chunk);
    if (!match) {
      throw new Error(`Invalid duration: ${input}`);
    }
    const value = Number(match[1]);
    const unit = UNIT_MS[match[2]!.toLowerCase()];
    if (!unit || value <= 0) {
      throw new Error(`Invalid duration: ${input}`);
    }
    total += value * unit;
  }
  return total;
}

export function formatDuration(ms: number): string {
  if (ms % UNIT_MS.d! === 0) {
    return `${ms / UNIT_MS.d!}d`;
  }
  if (ms % UNIT_MS.h! === 0) {
    return `${ms / UNIT_MS.h!}h`;
  }
  if (ms % UNIT_MS.m! === 0) {
    return `${ms / UNIT_MS.m!}m`;
  }
  return `${Math.round(ms / 1000)}s`;
}
