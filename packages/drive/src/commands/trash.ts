import type { Command } from "commander";
import { emitOk, emitPlain, isDryRun, wantsJson } from "../util/agent.ts";
import { handleCommandError } from "../util/command.ts";
import { DriveService } from "../drive/service.ts";
import type { DryRunAction } from "../drive/types.ts";
import {
  addDriveAuthOptions,
  applyDriveGlobals,
  type DriveCommandOptions,
} from "./common.ts";

function emitDryRun(plan: DryRunAction): void {
  if (wantsJson()) {
    emitOk({ dryRun: true, plan });
    return;
  }
  emitPlain(`dry-run: ${plan.action} ${JSON.stringify(plan.detail)}`);
}

async function withOpen(
  opts: DriveCommandOptions,
  run: (service: DriveService, client: Awaited<ReturnType<DriveService["open"]>>["client"], context: Awaited<ReturnType<DriveService["open"]>>["context"]) => Promise<void>,
): Promise<void> {
  const service = new DriveService();
  const { client, context } = await service.open({
    password: opts.password,
    passRef: opts.pass,
  });
  await run(service, client, context);
}

export function registerTrashCommands(trash: Command): void {
  trash
    .command("list")
    .description("List trashed items")
    .option("--json", "Machine-readable JSON output")
    .action(async (_options, command) => {
      const opts = applyDriveGlobals(command);
      addDriveAuthOptions(command);
      try {
        await withOpen(opts, async (service, client, context) => {
          const result = await service.listTrash(client, context, isDryRun());
          if (result && "action" in result) {
            emitDryRun(result);
            return;
          }
          if (wantsJson()) {
            emitOk({ items: result });
            return;
          }
          if (result.length === 0) {
            emitPlain("(trash is empty)");
            return;
          }
          for (const item of result) {
            emitPlain(`${item.linkId}\t${item.type}\t${item.size}`);
          }
        });
      } catch (error) {
        await handleCommandError(error);
      }
    });

  const restore = trash
    .command("restore")
    .description("Restore items from trash (link IDs)")
    .argument("<link-id...>", "One or more link IDs")
    .option("--dry-run", "Print planned action without mutating Drive")
    .option("--json", "Machine-readable JSON output");
  addDriveAuthOptions(restore);
  restore.action(async (linkIds: string[], _options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      await withOpen(opts, async (service, client, context) => {
        const result = await service.restoreTrash(
          client,
          context,
          linkIds,
          isDryRun(),
        );
        if (result && "action" in result) {
          emitDryRun(result);
          return;
        }
        if (wantsJson()) {
          emitOk({ restored: true, count: linkIds.length, linkIds });
          return;
        }
        emitPlain(`Restored ${linkIds.length} item(s)`);
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });

  const empty = trash
    .command("empty")
    .description("Empty trash across all volumes")
    .option("--dry-run", "Print planned action without mutating Drive")
    .option("--json", "Machine-readable JSON output");
  addDriveAuthOptions(empty);
  empty.action(async (_options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      await withOpen(opts, async (service, client, context) => {
        const result = await service.emptyTrash(client, context, isDryRun());
        if (result && "action" in result) {
          emitDryRun(result);
          return;
        }
        if (wantsJson()) {
          emitOk({ emptied: true });
          return;
        }
        emitPlain("Trash emptied.");
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
