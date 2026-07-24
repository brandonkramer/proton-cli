import type { Command } from "commander";
import { emitOk, emitPlain, isDryRun, wantsJson } from "../util/agent.ts";
import { handleCommandError } from "../util/command.ts";
import { normalizeDrivePath } from "../util/paths.ts";
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

export function registerShareCommands(share: Command): void {
  share
    .command("status")
    .description("Show public links, members, and pending invitations")
    .argument("<path>", "Drive item path")
    .option("--json", "Machine-readable JSON output")
    .action(async (path: string, _options, command) => {
      const opts = applyDriveGlobals(command);
      addDriveAuthOptions(command);
      try {
        await withOpen(opts, async (service, client, context) => {
          const result = await service.shareStatus(
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
            emitOk({ share: result });
            return;
          }
          if (
            result.publicLinks.length === 0 &&
            result.members.length === 0 &&
            result.pendingInvitations.length === 0
          ) {
            emitPlain("Not shared.");
            return;
          }
          for (const link of result.publicLinks) {
            emitPlain(`public\t${link.url}\t${link.canEdit ? "edit" : "view"}`);
          }
          for (const member of result.members) {
            emitPlain(`member\t${member.email}\t${member.role}`);
          }
          for (const invite of result.pendingInvitations) {
            emitPlain(`pending\t${invite.email}\t${invite.role}`);
          }
        });
      } catch (error) {
        await handleCommandError(error);
      }
    });

  const link = share
    .command("link")
    .description("Create or show the public link for an item")
    .argument("<path>", "Drive item path")
    .option("--edit", "Allow editing (default: view only)")
    .option("--expires <duration>", "Link expiration (seconds)")
    .option("--link-password <password>", "Custom password appended to generated link password")
    .option("--dry-run", "Print planned action without mutating Drive")
    .option("--json", "Machine-readable JSON output");
  addDriveAuthOptions(link);
  link.action(async (path: string, options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      await withOpen(opts, async (service, client, context) => {
        const linkOpts = {
          canEdit: Boolean(options.edit),
          setEdit: Boolean(options.edit),
          expireSeconds: options.expires ? Number(options.expires) : undefined,
          setExpiry: Boolean(options.expires),
          customPassword: options.linkPassword,
          setPassword: Boolean(options.linkPassword),
        };
        const result = await service.ensureShareLink(
          client,
          context,
          path,
          linkOpts,
          isDryRun(),
        );
        if (result && "action" in result) {
          emitDryRun(result);
          return;
        }
        if (wantsJson()) {
          emitOk({ link: result });
          return;
        }
        emitPlain(result.url);
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });

  const unlink = share
    .command("unlink")
    .description("Remove public link(s) for an item")
    .argument("<path>", "Drive item path")
    .option("--dry-run", "Print planned action without mutating Drive")
    .option("--json", "Machine-readable JSON output");
  addDriveAuthOptions(unlink);
  unlink.action(async (path: string, _options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      await withOpen(opts, async (service, client, context) => {
        const result = await service.unlinkShare(
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
          emitOk({ removed: result.removed });
          return;
        }
        emitPlain(`Removed ${result.removed} public link(s)`);
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });

  const add = share
    .command("add")
    .description("Invite a Proton user to an item")
    .argument("<path>", "Drive item path")
    .argument("<email>", "Invitee email")
    .option("--edit", "Allow editing")
    .option("--message <text>", "Optional invitation message")
    .option("--dry-run", "Print planned action without mutating Drive")
    .option("--json", "Machine-readable JSON output");
  addDriveAuthOptions(add);
  add.action(async (path: string, email: string, options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      await withOpen(opts, async (service, client, context) => {
        const result = await service.addShareMember(
          client,
          context,
          path,
          email,
          Boolean(options.edit),
          options.message ?? "",
          isDryRun(),
        );
        if (result && "action" in result) {
          emitDryRun(result);
          return;
        }
        if (wantsJson()) {
          emitOk({ invited: true, path: normalizeDrivePath(path), email });
          return;
        }
        emitPlain(`Invited ${email}`);
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });

  const remove = share
    .command("remove")
    .description("Revoke a member or cancel a pending invitation")
    .argument("<path>", "Drive item path")
    .argument("<email>", "Member or invitee email")
    .option("--dry-run", "Print planned action without mutating Drive")
    .option("--json", "Machine-readable JSON output");
  addDriveAuthOptions(remove);
  remove.action(async (path: string, email: string, _options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      await withOpen(opts, async (service, client, context) => {
        const result = await service.removeShareMember(
          client,
          context,
          path,
          email,
          isDryRun(),
        );
        if (result && "action" in result) {
          emitDryRun(result);
          return;
        }
        if (wantsJson()) {
          emitOk({ removed: true, path: normalizeDrivePath(path), email });
          return;
        }
        emitPlain(`Revoked access for ${email}`);
      });
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
