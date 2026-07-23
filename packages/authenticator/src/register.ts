import type { Command } from "commander";
import { registerCode } from "./commands/code.ts";
import { registerList } from "./commands/list.ts";
import { registerSignin } from "./commands/signin.ts";
import { registerSignout } from "./commands/signout.ts";
import { registerStatus } from "./commands/status.ts";
import { registerSync } from "./commands/sync.ts";

/** Register `proton auth …` (and legacy `protonauth …`) commands. */
export function registerAuthCommands(auth: Command): void {
  registerSignin(auth);
  registerSignout(auth);
  registerSync(auth);
  registerList(auth);
  registerCode(auth);
  registerStatus(auth);
}
