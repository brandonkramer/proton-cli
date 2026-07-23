import { describe, expect, test } from "bun:test";
import {
  buildUpdatePlan,
  compareVersions,
  detectInstallChannel,
} from "../src/setup/self-update.ts";

describe("self-update", () => {
  test("detectInstallChannel prefers bun global paths", () => {
    expect(
      detectInstallChannel(
        "/Users/x/.bun/install/global/node_modules/proton-unified-cli/src/index.ts",
      ),
    ).toBe("bun");
  });

  test("buildUpdatePlan targets proton-unified-cli", () => {
    expect(buildUpdatePlan("bun", "latest").args).toEqual([
      "add",
      "-g",
      "proton-unified-cli@latest",
    ]);
    expect(buildUpdatePlan("npm", "0.2.0").args).toEqual([
      "install",
      "-g",
      "proton-unified-cli@0.2.0",
    ]);
  });

  test("compareVersions", () => {
    expect(compareVersions("0.1.0", "0.1.0").updateAvailable).toBe(false);
    expect(compareVersions("0.1.0", "0.1.1").updateAvailable).toBe(true);
  });
});
