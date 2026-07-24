import type { Command } from "commander";
import { configureAgentFlags } from "../util/agent.ts";

export interface DriveCommandOptions {
  json?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  password?: string;
  pass?: string;
}

export function applyDriveGlobals(
  command: Command,
  inherited?: DriveCommandOptions,
): DriveCommandOptions {
  const root = command.optsWithGlobals() as DriveCommandOptions;
  const merged: DriveCommandOptions = {
    json: inherited?.json ?? root.json,
    yes: inherited?.yes ?? root.yes,
    dryRun: inherited?.dryRun ?? root.dryRun,
    password: inherited?.password ?? root.password,
    pass: inherited?.pass ?? root.pass,
  };
  configureAgentFlags({
    json: Boolean(merged.json),
    yes: Boolean(merged.yes),
    dryRun: Boolean(merged.dryRun),
  });
  return merged;
}

export function addDriveAuthOptions(command: Command): void {
  command
    .option("--password <password>", "Account password (Single Password Mode)")
    .option("--pass <ref>", "Proton Pass item for account password");
}

export function addDriveMutationOptions(command: Command): void {
  addDriveAuthOptions(command);
  command.option("--dry-run", "Print planned action without mutating Drive");
}
