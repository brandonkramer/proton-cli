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

export function registerInvitationsCommands(invitations: Command): void {
  invitations
    .command("list")
    .description("List pending incoming share invitations")
    .option("--json", "Machine-readable JSON output")
    .action(async (_options, command) => {
      const opts = applyDriveGlobals(command);
      addDriveAuthOptions(command);
      try {
        const service = new DriveService();
        const { client, context, unlocked } = await service.open({
          password: opts.password,
          passRef: opts.pass,
        });
        void context;
        const items = await service.listInvitations(client);
        if (wantsJson()) {
          emitOk({ invitations: items });
          return;
        }
        if (items.length === 0) {
          emitPlain("No pending invitations.");
          return;
        }
        for (const inv of items) {
          emitPlain(
            `${inv.invitationId}\t${inv.inviterEmail}\t${inv.role}\t${inv.createTime}`,
          );
        }
      } catch (error) {
        await handleCommandError(error);
      }
    });

  const accept = invitations
    .command("accept")
    .description("Accept a pending share invitation")
    .argument("<invitation-id>", "Invitation ID")
    .option("--dry-run", "Print planned action without mutating Drive")
    .option("--json", "Machine-readable JSON output");
  addDriveAuthOptions(accept);
  accept.action(async (invitationId: string, _options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      const service = new DriveService();
      const { client, unlocked } = await service.open({
        password: opts.password,
        passRef: opts.pass,
      });
      const result = await service.acceptInvitation(
        client,
        unlocked,
        invitationId,
        isDryRun(),
      );
      if (result && "action" in result) {
        emitDryRun(result);
        return;
      }
      if (wantsJson()) {
        emitOk({ accepted: true, invitationId });
        return;
      }
      emitPlain(`Accepted invitation ${invitationId}`);
    } catch (error) {
      await handleCommandError(error);
    }
  });

  const reject = invitations
    .command("reject")
    .description("Reject a pending share invitation")
    .argument("<invitation-id>", "Invitation ID")
    .option("--dry-run", "Print planned action without mutating Drive")
    .option("--json", "Machine-readable JSON output");
  addDriveAuthOptions(reject);
  reject.action(async (invitationId: string, _options, command) => {
    const opts = applyDriveGlobals(command);
    try {
      const service = new DriveService();
      const { client } = await service.open({
        password: opts.password,
        passRef: opts.pass,
      });
      const result = await service.rejectInvitation(
        client,
        invitationId,
        isDryRun(),
      );
      if (result && "action" in result) {
        emitDryRun(result);
        return;
      }
      if (wantsJson()) {
        emitOk({ rejected: true, invitationId });
        return;
      }
      emitPlain(`Rejected invitation ${invitationId}`);
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
