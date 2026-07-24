import type { Command } from "commander";
import { CliError } from "../util/errors.ts";
import { reportCommandError } from "../util/errors.ts";
import { ExitCode } from "../util/exit.ts";

export function registerList(mail: Command): void {
  mail
    .command("list")
    .description("List messages (not yet implemented)")
    .action(async () => {
      try {
        throw new CliError(
          "Mail list is not implemented yet. See PH0-T02.",
          ExitCode.ERROR,
        );
      } catch (error) {
        reportCommandError(error);
      }
    });
}
