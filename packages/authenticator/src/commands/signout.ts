import type { Command } from "commander";
import { signOut } from "../proton/auth.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
import {
  addOutputOption,
  resolveOutputFormat,
  writeJson,
  writePlain,
} from "../util/output.ts";

export function registerSignout(program: Command): void {
  addOutputOption(
    program
      .command("signout")
      .description("Clear session and local entry cache"),
  ).action(async (options?: { output?: string }) => {
    try {
      const format = resolveOutputFormat(options?.output);
      setCommandOutputFormat(format);

      await signOut();

      if (format === "json") {
        writeJson({
          ok: true,
          signedOut: true,
          message: "Session and local entry cache cleared.",
        });
        return;
      }

      if (format === "plain") {
        writePlain("signed out");
        return;
      }

      const { showMessage } = await import("../ui/message.tsx");
      await showMessage({
        variant: "success",
        title: "Signed out",
        body: "Session and local entry cache cleared.",
        holdMs: 700,
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
