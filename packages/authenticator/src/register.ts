import type { Command } from "commander";
import { registerCode } from "./commands/code.ts";
import { registerList } from "./commands/list.ts";
import { registerSignin } from "./commands/signin.ts";
import { registerSignout } from "./commands/signout.ts";
import { registerStatus } from "./commands/status.ts";
import { registerSync } from "./commands/sync.ts";
import { launchTui } from "./tui/launch.ts";
import { shouldRefuseInteractiveMenu } from "./util/agent.ts";

/** Register `proton auth …` (and legacy `protonauth …`) commands. */
export function registerAuthCommands(auth: Command): void {
  registerSignin(auth);
  registerSignout(auth);
  registerSync(auth);
  registerList(auth);
  registerCode(auth);
  registerStatus(auth);

  auth
    .command("tui")
    .description("Open the interactive Authenticator menu")
    .action(async () => {
      if (shouldRefuseInteractiveMenu()) {
        console.error(
          "proton auth tui: refused in agent/non-interactive mode.\n" +
            "Unset PROTONAUTH_AGENT/CI and use a TTY, or call a subcommand directly.",
        );
        process.exit(2);
      }
      await launchTui();
    });
}
