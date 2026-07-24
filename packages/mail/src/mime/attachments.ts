import type { MessageStructureObject } from "imapflow";

export interface AttachmentPart {
  part: string;
  filename: string | null;
  contentType: string;
  size: number | null;
  disposition: string | null;
}

export function collectAttachmentParts(
  structure: MessageStructureObject | undefined,
): AttachmentPart[] {
  if (!structure) return [];

  const parts: AttachmentPart[] = [];
  walkStructure(structure, parts);
  return parts;
}

function walkStructure(node: MessageStructureObject, parts: AttachmentPart[]): void {
  const partId = node.part;
  const filename = node.dispositionParameters?.filename ?? null;
  const disposition = node.disposition ?? null;
  const contentType = formatContentType(node);

  if (partId && isAttachmentNode(node)) {
    parts.push({
      part: partId,
      filename,
      contentType,
      size: node.size ?? null,
      disposition,
    });
  }

  for (const child of node.childNodes ?? []) {
    walkStructure(child, parts);
  }
}

function isAttachmentNode(node: MessageStructureObject): boolean {
  if (node.disposition?.toLowerCase() === "attachment") return true;
  if (node.dispositionParameters?.filename) return true;
  if (node.type?.toLowerCase() === "application" && node.disposition !== "inline") {
    return Boolean(node.dispositionParameters?.filename ?? node.parameters?.name);
  }
  return false;
}

function formatContentType(node: MessageStructureObject): string {
  const type = node.type?.toLowerCase() ?? "application";
  const subtype = node.parameters?.subtype ?? node.parameters?.type ?? "octet-stream";
  return `${type}/${subtype}`;
}
