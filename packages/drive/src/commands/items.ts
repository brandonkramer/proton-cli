import type { Command } from "commander";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { emitOk, emitPlain, isDryRun, wantsJson } from "../util/agent.ts";
import { handleCommandError } from "../util/command.ts";
import { normalizeDrivePath } from "../util/paths.ts";
import { DriveService } from "../drive/service.ts";
import type { DryRunAction } from "../drive/types.ts";
import {
  addDriveAuthOptions,
  addDriveMutationOptions,
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

async function withService<T>(
  opts: DriveCommandOptions,
  run: (service: DriveService) => Promise<T>,
): Promise<T> {
  const service = new DriveService();
  return run(service);
}

export function registerItemsCommands(items: Command): void {
  items
    .command("list")
    .description("List folder contents")
    .argument("[path]", "Drive folder path", "/")
    .option("--json", "Machine-readable JSON output")
    .option("-j, --output <format>", "Output format (json)")
    .action(async (path: string, _options, command) => {
      const opts = applyDriveGlobals(command);
      try {
        await withService(opts, async (service) => {
          const { client, context } = await service.open({
            password: opts.password,
            passRef: opts.pass,
          });
          const children = await service.list(client, context, path);
          if (wantsJson() || opts.json || _options.output === "json") {
            emitOk({ path: normalizeDrivePath(path), items: children });
            return;
          }
          if (children.length === 0) {
            emitPlain("(empty)");
            return;
          }
          for (const child of children) {
            const kind = child.type === 1 ? "folder" : "file";
            emitPlain(`${child.name}\t${kind}\t${child.size}\t${child.linkId}`);
          }
        });
      } catch (error) {
        await handleCommandError(error);
      }
    });

  items
    .command("info")
    .description("Show item metadata")
    .argument("<path>", "Drive item path")
    .option("--json", "Machine-readable JSON output")
    .action(async (path: string, _options, command) => {
      const opts = applyDriveGlobals(command);
      try {
        await withService(opts, async (service) => {
          const { client, context } = await service.open({
            password: opts.password,
            passRef: opts.pass,
          });
          const info = await service.info(client, context, path);
          if (wantsJson()) {
            emitOk({ item: info });
            return;
          }
          emitPlain(`${info.name}\t${info.type === 1 ? "folder" : "file"}\t${info.size}`);
          emitPlain(`link_id: ${info.linkId}`);
        });
      } catch (error) {
        await handleCommandError(error);
      }
    });

  const upload = items
    .command("upload")
    .description("Upload a file (SRC=- reads stdin)")
    .argument("<src>", "Local path or - for stdin")
    .argument("[dest]", "Destination folder", "/")
    .option("--json", "Machine-readable JSON output");
  addDriveMutationOptions(upload);
  upload.action(async (src: string, dest: string, _options, command) => {
      const opts = applyDriveGlobals(command);
      try {
        await withService(opts, async (service) => {
          const { client, context } = await service.open({
            password: opts.password,
            passRef: opts.pass,
          });

          let fileName: string;
          let bytes: Uint8Array;
          let destFolder = dest;

          if (src === "-") {
            fileName = `stdin-${Date.now()}`;
            const buffer = await Bun.stdin.arrayBuffer();
            bytes = new Uint8Array(buffer);
            try {
              const resolved = await service.resolvePath(client, context, dest);
              if (!resolved.isFolder) {
                fileName = basename(dest);
                destFolder = normalizeDrivePath(dest).replace(/\/[^/]+$/, "") || "/";
              }
            } catch {
              fileName = basename(dest);
              destFolder = normalizeDrivePath(dest).replace(/\/[^/]+$/, "") || "/";
            }
          } else {
            const info = await stat(src);
            if (info.isDirectory()) {
              throw new Error(`${src} is a directory (recursive upload not in PH1).`);
            }
            fileName = basename(src);
            bytes = new Uint8Array(await Bun.file(src).arrayBuffer());
          }

          const result = await service.upload(
            client,
            context,
            destFolder,
            fileName,
            bytes,
            {
              dryRun: isDryRun(),
              sizeHint: bytes.length,
            },
          );

          if (result && "action" in result) {
            emitDryRun(result);
            return;
          }

          if (wantsJson()) {
            emitOk({
              uploaded: true,
              name: fileName,
              dest: normalizeDrivePath(destFolder),
              linkId: result.linkId,
              revisionId: result.revisionId,
            });
            return;
          }
          emitPlain(`Uploaded ${fileName}`);
        });
      } catch (error) {
        await handleCommandError(error);
      }
    });

  const download = items
    .command("download")
    .description("Download a file to stdout or OUT (-)")
    .argument("<path>", "Drive file path")
    .argument("[out]", "Local output path or - for stdout", "-")
    .option("--json", "Machine-readable JSON output")
    .option("--force", "Overwrite existing local file");
  addDriveMutationOptions(download);
  download.action(async (path: string, out: string, _options, command) => {
      const opts = applyDriveGlobals(command);
      try {
        await withService(opts, async (service) => {
          const { client, context } = await service.open({
            password: opts.password,
            passRef: opts.pass,
          });
          const result = await service.download(
            client,
            context,
            path,
            isDryRun(),
          );
          if (result && typeof result === "object" && "action" in result) {
            emitDryRun(result);
            return;
          }

          const data = result as Uint8Array;
          if (out === "-") {
            process.stdout.write(data);
            return;
          }

          if (!_options.force && (await Bun.file(out).exists())) {
            throw new Error(`Refusing to overwrite ${out} (use --force).`);
          }
          await Bun.write(out, data);
          if (wantsJson()) {
            emitOk({ downloaded: true, path, out, bytes: data.length });
            return;
          }
          emitPlain(`Downloaded ${path} → ${out}`);
        });
      } catch (error) {
        await handleCommandError(error);
      }
    });

  registerMutatingItemCommand(items, "rename", "Rename an item", async (service, client, context, args, dryRun) => {
    const [path, newName] = args;
    return service.rename(client, context, path!, newName!, dryRun);
  }, 2);

  registerMutatingItemCommand(items, "move", "Move an item to a folder", async (service, client, context, args, dryRun) => {
    const [source, dest] = args;
    return service.move(client, context, source!, dest!, dryRun);
  }, 2);

  registerMutatingItemCommand(items, "copy", "Copy a file to another folder", async (service, client, context, args, dryRun) => {
    const [source, dest] = args;
    return service.copy(client, context, source!, dest!, dryRun);
  }, 2);

  registerMutatingItemCommand(items, "trash", "Move an item to trash", async (service, client, context, args, dryRun) => {
    return service.trash(client, context, args[0]!, dryRun);
  }, 1);

  items
    .command("delete")
    .description("Trash or permanently delete an item")
    .argument("<path>", "Drive item path")
    .option("--permanent", "Permanently delete (skip trash restore)")
    .option("-y, --yes", "Skip confirmation")
    .option("--dry-run", "Print planned action without mutating Drive")
    .option("--json", "Machine-readable JSON output")
    .action(async (path: string, options, command) => {
      const opts = applyDriveGlobals(command, options);
      addDriveAuthOptions(command);
      try {
        await withService(opts, async (service) => {
          const { client, context } = await service.open({
            password: opts.password,
            passRef: opts.pass,
          });
          const result = await service.deleteItem(
            client,
            context,
            path,
            Boolean(options.permanent),
            isDryRun(),
          );
          if (result && "action" in result) {
            emitDryRun(result);
            return;
          }
          if (wantsJson()) {
            emitOk({ deleted: true, path, permanent: Boolean(options.permanent) });
            return;
          }
          emitPlain(`Deleted ${path}`);
        });
      } catch (error) {
        await handleCommandError(error);
      }
    });
}

function registerMutatingItemCommand(
  items: Command,
  name: string,
  description: string,
  handler: (
    service: DriveService,
    client: Awaited<ReturnType<DriveService["open"]>>["client"],
    context: Awaited<ReturnType<DriveService["open"]>>["context"],
    args: string[],
    dryRun: boolean,
  ) => Promise<DryRunAction | void>,
  argCount: number,
): void {
  const cmd = items
    .command(name)
    .description(description)
    .option("--dry-run", "Print planned action without mutating Drive")
    .option("--json", "Machine-readable JSON output");

  addDriveAuthOptions(cmd);

  if (argCount === 1) {
    cmd.argument("<path>", "Drive item path");
  } else if (argCount === 2) {
    cmd.argument("<source>", "Source path");
    cmd.argument("<dest>", "Destination folder or new name");
  }

  cmd.action(async (...rawArgs: unknown[]) => {
    const command = rawArgs[rawArgs.length - 1] as Command;
    const opts = applyDriveGlobals(command);
    const args = rawArgs.slice(0, argCount) as string[];
    try {
      await withService(opts, async (service) => {
        const { client, context } = await service.open({
          password: opts.password,
          passRef: opts.pass,
        });
        const result = await handler(
          service,
          client,
          context,
          args,
          isDryRun(),
        );
        if (result && "action" in result) {
          emitDryRun(result);
          return;
        }
        if (wantsJson()) {
          emitOk({ ok: true, action: name, ...Object.fromEntries(args.map((a, i) => [`arg${i}`, a])) });
          return;
        }
        emitPlain(`${name} completed`);
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
