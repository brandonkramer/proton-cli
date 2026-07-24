import type { Command } from "commander";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { emitOk, emitPlain, isDryRun, wantsJson } from "../util/agent.ts";
import { handleCommandError } from "../util/command.ts";
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

async function withPhotos(
  opts: DriveCommandOptions,
  run: (
    service: DriveService,
    client: Awaited<ReturnType<DriveService["open"]>>["client"],
    photosContext: Awaited<ReturnType<DriveService["resolvePhotosContext"]>>,
  ) => Promise<void>,
): Promise<void> {
  const service = new DriveService();
  const { client, unlocked } = await service.open({
    password: opts.password,
    passRef: opts.pass,
  });
  const photosContext = await service.resolvePhotosContext(client, unlocked);
  await run(service, client, photosContext);
}

export function registerPhotosCommands(photos: Command): void {
  photos
    .command("list")
    .description("List photos in the library")
    .option("--json", "Machine-readable JSON output")
    .action(async (_options, command) => {
      const opts = applyDriveGlobals(command);
      addDriveAuthOptions(command);
      try {
        await withPhotos(opts, async (service, client, photosContext) => {
          const result = await service.listPhotos(
            client,
            photosContext,
            isDryRun(),
          );
          if (result && "action" in result) {
            emitDryRun(result);
            return;
          }
          if (wantsJson()) {
            emitOk({ photos: result });
            return;
          }
          for (const photo of result) {
            emitPlain(`${photo.linkId}\t${photo.captureTime}`);
          }
        });
      } catch (error) {
        await handleCommandError(error);
      }
    });

  const upload = photos
    .command("upload")
    .description("Upload a photo file")
    .argument("<file>", "Local photo path")
    .option("--json", "Machine-readable JSON output");
  addDriveMutationOptions(upload);
  upload.action(async (file: string, _options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      await withPhotos(opts, async (service, client, photosContext) => {
        const info = await stat(file);
        if (!info.isFile()) {
          throw new Error(`${file} is not a file.`);
        }
        const bytes = new Uint8Array(await Bun.file(file).arrayBuffer());
        const result = await service.uploadPhoto(
          client,
          photosContext,
          basename(file),
          bytes,
          Math.floor(info.mtimeMs / 1000),
          isDryRun(),
        );
        if (result && "action" in result) {
          emitDryRun(result);
          return;
        }
        if (wantsJson()) {
          emitOk({
            uploaded: true,
            name: basename(file),
            linkId: result.linkId,
            revisionId: result.revisionId,
          });
          return;
        }
        emitPlain(`Uploaded ${basename(file)}`);
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });

  const download = photos
    .command("download")
    .description("Download a photo by link ID")
    .argument("<link-id>", "Photo link ID")
    .argument("[out]", "Output path or - for stdout", "-")
    .option("--json", "Machine-readable JSON output")
    .option("--force", "Overwrite existing local file");
  addDriveMutationOptions(download);
  download.action(async (linkId: string, out: string, options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      await withPhotos(opts, async (service, client, photosContext) => {
        const result = await service.downloadPhoto(
          client,
          photosContext,
          linkId,
          isDryRun(),
        );
        if (result && "action" in result) {
          emitDryRun(result);
          return;
        }
        const data = result as Uint8Array;
        if (out === "-") {
          process.stdout.write(data);
          return;
        }
        if (!options.force && (await Bun.file(out).exists())) {
          throw new Error(`Refusing to overwrite ${out} (use --force).`);
        }
        await Bun.write(out, data);
        if (wantsJson()) {
          emitOk({ downloaded: true, linkId, out, bytes: data.length });
          return;
        }
        emitPlain(`Downloaded ${linkId} → ${out}`);
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });

  const trashCmd = photos
    .command("trash")
    .description("Move photos to trash")
    .argument("<link-id...>", "Photo link ID(s)")
    .option("--json", "Machine-readable JSON output");
  addDriveMutationOptions(trashCmd);
  trashCmd.action(async (linkIds: string[], _options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      await withPhotos(opts, async (service, client, photosContext) => {
        const result = await service.trashPhotos(
          client,
          photosContext,
          linkIds,
          isDryRun(),
        );
        if (result && "action" in result) {
          emitDryRun(result);
          return;
        }
        if (wantsJson()) {
          emitOk({ trashed: true, count: linkIds.length, linkIds });
          return;
        }
        emitPlain(`Trashed ${linkIds.length} photo(s)`);
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });

  const albums = photos.command("albums").description("Photo albums");
  albums
    .command("list")
    .description("List photo albums")
    .option("--json", "Machine-readable JSON output")
    .action(async (_options, command) => {
      const opts = applyDriveGlobals(command);
      addDriveAuthOptions(command);
      try {
        await withPhotos(opts, async (service, client, photosContext) => {
          const result = await service.listAlbums(
            client,
            photosContext,
            isDryRun(),
          );
          if (result && "action" in result) {
            emitDryRun(result);
            return;
          }
          if (wantsJson()) {
            emitOk({ albums: result });
            return;
          }
          for (const album of result) {
            emitPlain(`${album.name}\t${album.photoCount}\t${album.linkId}`);
          }
        });
      } catch (error) {
        await handleCommandError(error);
      }
    });
}
