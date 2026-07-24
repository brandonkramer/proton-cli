import { AmbiguousError, NotFoundError } from "./errors.ts";

export interface RefCandidate {
  id: string;
  label: string;
}

/** Resolve REF to a single match; 0 → NotFound, 2+ → Ambiguous (exit 4). */
export function pickRef<T>(
  kind: string,
  ref: string,
  matches: T[],
  id: (item: T) => string,
  label: (item: T) => string,
): T {
  switch (matches.length) {
    case 0:
      throw new NotFoundError(kind, ref);
    case 1:
      return matches[0]!;
    default: {
      const candidates: RefCandidate[] = matches.map((item) => ({
        id: id(item),
        label: label(item),
      }));
      throw new AmbiguousError(kind, ref, candidates);
    }
  }
}

export function formatCandidates(candidates: RefCandidate[]): string {
  return candidates
    .map((candidate) => {
      if (candidate.label) {
        return `${candidate.id} ${candidate.label}`;
      }
      return candidate.id;
    })
    .join("\n");
}
