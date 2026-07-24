import type { Command } from "commander";
import { registerAttachments } from "./commands/attachments.ts";
import { registerSetup } from "./commands/setup.ts";
import { registerDoctor } from "./commands/doctor.ts";
import { registerStatus } from "./commands/status.ts";
import {
  registerMessages,
  registerMessagesGetAlias,
} from "./commands/messages.ts";
import { registerSend } from "./commands/send.ts";
import { registerFolders } from "./commands/folders.ts";
import { registerOrganize } from "./commands/organize.ts";
import { registerDrafts } from "./commands/drafts.ts";

/** Register `proton mail …` (and legacy `protonmail …`) commands. */
export function registerMailCommands(mail: Command): void {
  registerSetup(mail);
  registerDoctor(mail);
  registerStatus(mail);
  registerMessages(mail);
  registerMessagesGetAlias(mail);
  registerAttachments(mail);
  registerSend(mail);
  registerFolders(mail);
  registerOrganize(mail);
  registerDrafts(mail);
}
