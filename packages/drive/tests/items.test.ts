import { describe, expect, test } from "bun:test";
import { baseOf, dirOf, joinDrivePath, normalizeDrivePath } from "../src/util/paths.ts";
import { DriveService } from "../src/drive/service.ts";

describe("drive paths", () => {
  test("normalizeDrivePath", () => {
    expect(normalizeDrivePath("/Documents")).toBe("/Documents");
    expect(normalizeDrivePath("Documents/")).toBe("/Documents");
    expect(normalizeDrivePath("/")).toBe("/");
  });

  test("dirOf and baseOf", () => {
    expect(dirOf("/Documents/report.pdf")).toBe("/Documents");
    expect(baseOf("/Documents/report.pdf")).toBe("report.pdf");
    expect(joinDrivePath("/Documents", "notes.txt")).toBe("/Documents/notes.txt");
  });
});

describe("drive dry-run plans", () => {
  const service = new DriveService();

  test("upload plan", () => {
    const plan = service.planUpload("/Docs", "a.txt", 12);
    expect(plan.action).toBe("items.upload");
    expect(plan.detail.dest).toBe("/Docs");
    expect(plan.detail.name).toBe("a.txt");
  });

  test("folder create plan", () => {
    const plan = service.planFolderCreate("/Projects/new");
    expect(plan.action).toBe("folder.create");
    expect(plan.detail.path).toBe("/Projects/new");
  });

  test("download plan", () => {
    const plan = service.planDownload("/Docs/a.txt");
    expect(plan.action).toBe("items.download");
  });
});
