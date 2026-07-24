import { describe, expect, test } from "bun:test";
import type { MessageStructureObject } from "imapflow";
import { collectAttachmentParts } from "../src/mime/attachments.ts";

describe("collectAttachmentParts", () => {
  test("collects attachment nodes with filenames", () => {
    const structure: MessageStructureObject = {
      type: "multipart",
      childNodes: [
        {
          part: "1",
          type: "text",
          parameters: { subtype: "plain" },
        },
        {
          part: "2",
          type: "application",
          parameters: { subtype: "pdf" },
          disposition: "attachment",
          dispositionParameters: { filename: "report.pdf" },
          size: 4096,
        },
      ],
    };

    expect(collectAttachmentParts(structure)).toEqual([
      {
        part: "2",
        filename: "report.pdf",
        contentType: "application/pdf",
        size: 4096,
        disposition: "attachment",
      },
    ]);
  });

  test("returns empty list when no attachments", () => {
    expect(collectAttachmentParts(undefined)).toEqual([]);
  });
});
