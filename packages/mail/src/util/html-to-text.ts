/**
 * Zero-dep HTML → plain text for terminal display of Mail bodies.
 */

const BLOCK_TAGS =
  /<\/?(?:p|div|tr|table|thead|tbody|tfoot|section|article|header|footer|h[1-6]|blockquote|pre|hr|ul|ol|li|dl|dt|dd)(?:\s[^>]*)?>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => {
      return NAMED_ENTITIES[name.toLowerCase()] ?? match;
    });
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTagsKeepText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<hr\b[^>]*>/gi, "\n---\n")
    .replace(BLOCK_TAGS, "\n")
    .replace(/<[^>]+>/g, "");
}

/**
 * Convert an HTML document/fragment to readable plain text.
 */
export function htmlToPlainText(html: string): string {
  let s = html;

  // Drop non-content regions first.
  s = s.replace(/<(script|style|head|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Replace links with placeholders so later tag stripping cannot eat `<url>`.
  const links: string[] = [];
  s = s.replace(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, inner: string) => {
      const label = collapseWhitespace(
        decodeEntities(stripTagsKeepText(inner)),
      ).replace(/\s+/g, " ");
      const url = href.trim();
      let replacement: string;
      if (!label) {
        replacement = url;
      } else if (
        !url ||
        label === url ||
        (url.startsWith("mailto:") && label.includes("@"))
      ) {
        replacement = label;
      } else {
        replacement = `${label} <${url}>`;
      }
      const index = links.length;
      links.push(replacement);
      return `\u0000LINK${index}\u0000`;
    },
  );

  s = stripTagsKeepText(s);
  s = decodeEntities(s);
  s = s.replace(/\u0000LINK(\d+)\u0000/g, (_m, index: string) => {
    return links[Number(index)] ?? "";
  });
  return collapseWhitespace(s);
}

/** True when MIME type indicates an HTML body (ignores parameters). */
export function isHtmlMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return base === "text/html" || base === "application/xhtml+xml";
}

/**
 * Format a decrypted message body for human terminal display.
 * JSON / --raw callers should keep the original body.
 */
export function formatMessageBodyForDisplay(
  body: string,
  mimeType: string | undefined,
): string {
  if (!body) return "";
  if (!isHtmlMimeType(mimeType) && !/^\s*</.test(body)) {
    return body;
  }
  // MIME says HTML, or body looks like HTML when type is missing/wrong.
  if (
    isHtmlMimeType(mimeType) ||
    /^\s*<(!doctype|html|body|div|table|mj-)/i.test(body)
  ) {
    return htmlToPlainText(body);
  }
  return body;
}
