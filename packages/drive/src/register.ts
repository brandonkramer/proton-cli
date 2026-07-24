import type { Command } from "commander";
import { addDriveAuthOptions } from "./commands/common.ts";
import { loadSession } from "./proton/auth.ts";
import { registerFoldersCommands } from "./commands/folders.ts";
import { registerInvitationsCommands } from "./commands/invitations.ts";
import { registerItemsCommands } from "./commands/items.ts";
import { registerPhotosCommands } from "./commands/photos.ts";
import { registerShareCommands } from "./commands/share.ts";
import { registerTrashCommands } from "./commands/trash.ts";
import { emitOk, wantsJson } from "./util/agent.ts";
import { handleCommandError } from "./util/command.ts";

/** Register `proton drive …` (and legacy `protondrive …`) commands. */
export function registerDriveCommands(drive: Command): void {
  // Register auth options on the parent so `--pass`/`--password` parse before actions.
  addDriveAuthOptions(drive);

  drive
    .command("status")
    .description("Drive session status")
    .option("--json", "Machine-readable JSON output")
    .action(async (_options, command) => {
      try {
        const saved = await loadSession();
        if (wantsJson()) {
          emitOk({
            signedIn: Boolean(saved),
            username: saved?.username ?? null,
            expiresAt: saved?.expiresAt ?? null,
          });
          return;
        }
        if (!saved) {
          console.log("Drive: not signed in");
          return;
        }
        console.log(`Drive: signed in as ${saved.username} (expires ${saved.expiresAt})`);
      } catch (error) {
        await handleCommandError(error);
      }
    });

  const items = drive.command("items").description("Drive files and folders");
  registerItemsCommands(items);

  const folders = drive.command("folders").description("Drive folders");
  registerFoldersCommands(folders);

  const share = drive.command("share").description("Sharing (public links and members)");
  registerShareCommands(share);

  const invitations = drive
    .command("invitations")
    .description("Incoming share invitations");
  registerInvitationsCommands(invitations);

  const trash = drive.command("trash").description("Drive trash");
  registerTrashCommands(trash);

  const photos = drive.command("photos").description("Photo library");
  registerPhotosCommands(photos);
}
