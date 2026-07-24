/** Proton fixed accent palette (WebClients ACCENT_COLORS). */
export const ACCENT_COLORS = [
  { name: "purple", hex: "#8080FF" },
  { name: "pink", hex: "#DB60D6" },
  { name: "strawberry", hex: "#EC3E7C" },
  { name: "carrot", hex: "#F78400" },
  { name: "sahara", hex: "#936D58" },
  { name: "enzian", hex: "#5252CC" },
  { name: "plum", hex: "#A839A4" },
  { name: "cerise", hex: "#BA1E55" },
  { name: "copper", hex: "#C44800" },
  { name: "soil", hex: "#54473F" },
  { name: "slateblue", hex: "#415DF0" },
  { name: "pacific", hex: "#179FD9" },
  { name: "reef", hex: "#1DA583" },
  { name: "fern", hex: "#3CBB3A" },
  { name: "olive", hex: "#B4A40E" },
  { name: "cobalt", hex: "#273EB2" },
  { name: "ocean", hex: "#0A77A6" },
  { name: "pine", hex: "#0F735A" },
  { name: "forest", hex: "#258723" },
  { name: "pickle", hex: "#807304" },
] as const;

export const DEFAULT_GROUP_COLOR = "#8080FF";

export function validateAccentColor(color: string): string | null {
  if (!color) return null;
  const match = ACCENT_COLORS.some(
    (entry) => entry.hex.toLowerCase() === color.toLowerCase(),
  );
  if (match) return null;
  const lines = ACCENT_COLORS.map(
    (entry) => `  ${entry.name.padEnd(11)} ${entry.hex}`,
  ).join("\n");
  return `invalid color "${color}"; Proton accepts only these accent colors:\n${lines}`;
}
