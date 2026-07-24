import type { Command } from "commander";
import { configDir } from "../config/paths.ts";
import { loadSession } from "../proton/auth.ts";
import { actionStatus } from "../tui/actions.ts";
import { handleCommandError } from "../util/command.ts";
import { emitOk, wantsJson } from "../util/agent.ts";

export function registerStatus(mail: Command): void {
  mail
    .command("status")
    .description("Show Mail session and config location")
    .action(async () => {
      try {
        if (!wantsJson() && process.stdin.isTTY && process.stdout.isTTY) {
          await actionStatus();
          return;
        }

        const session = await loadSession();
        emitOk({
          action: "status",
          signedIn: Boolean(session),
          username: session?.username ?? null,
          configDir: configDir(),
          message: session
            ? `Signed in as ${session.username}`
            : "Not signed in to Mail",
        });
      } catch (error) {
        await handleCommandError(error);
      }
    });
}
