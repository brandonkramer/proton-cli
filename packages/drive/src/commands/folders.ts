import type { Command } from "commander";
import { emitOk, emitPlain, isDryRun, wantsJson } from "../util/agent.ts";
import { handleCommandError } from "../util/command.ts";
import { normalizeDrivePath } from "../util/paths.ts";
import { DriveService } from "../drive/service.ts";
import type { DryRunAction } from "../drive/types.ts";
import {
  addDriveMutationOptions,
  applyDriveGlobals,
} from "./common.ts";

function emitDryRun(plan: DryRunAction): void {
  if (wantsJson()) {
    emitOk({ dryRun: true, plan });
    return;
  }
  emitPlain(`dry-run: ${plan.action} ${JSON.stringify(plan.detail)}`);
}

export function registerFoldersCommands(folders: Command): void {
  const create = folders
    .command("create")
    .description("Create a folder at PATH")
    .argument("<path>", "Full folder path to create")
    .option("--json", "Machine-readable JSON output");
  addDriveMutationOptions(create);
  create.action(async (path: string, _options, command) => {
      const opts = applyDriveGlobals(command);
      try {
        const service = new DriveService();
        const { client, context } = await service.open({
          password: opts.password,
          passRef: opts.pass,
        });
        const result = await service.createFolder(
          client,
          context,
          path,
          isDryRun(),
        );
        if (result && "action" in result) {
          emitDryRun(result);
          return;
        }
        if (wantsJson()) {
          emitOk({ created: true, path: normalizeDrivePath(path) });
          return;
        }
        emitPlain(`Created folder ${normalizeDrivePath(path)}`);
      } catch (error) {
        await handleCommandError(error);
      }
    });
}