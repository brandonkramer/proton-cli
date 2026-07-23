import type { Command } from "commander";
import { loadLocalEntries } from "../config/store.ts";
import { PASS_ENV } from "../pass/credentials.ts";
import { tryExistingSession } from "../proton/auth.ts";
import { runInteractiveSignin } from "../tui/signin-flow.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
import {
  addOutputOption,
  resolveOutputFormat,
  writeJson,
  writePlain,
} from "../util/output.ts";

export function registerSignin(program: Command): void {
  addOutputOption(
    program
      .command("signin")
      .argument(
        "[username]",
        "Proton username or email (overrides Pass username)",
      )
      .option(
        "--pass <ref>",
        `Proton Pass login item (pass://Vault/Item or Vault/Item). Also: $${PASS_ENV}`,
      )
      .option("--no-sync", "Skip initial Authenticator sync after sign-in")
      .description("Sign in to Proton and ensure Authenticator Key (then sync)"),
  ).action(
    async (
      usernameArg?: string,
      options?: { pass?: string; sync?: boolean; output?: string },
    ) => {
      try {
        const format = resolveOutputFormat(options?.output);
        setCommandOutputFormat(format);

        await runInteractiveSignin({
          usernameArg,
          passRef: options?.pass,
          sync: options?.sync,
        });

        if (format === "ink") {
          return;
        }

        const session = await tryExistingSession();
        const local = await loadLocalEntries();
        const payload = {
          ok: true,
          signedIn: Boolean(session),
          username: session?.username ?? null,
          entryCount: local.entries.length,
          lastSyncAt: local.lastSyncAt,
        };

        if (format === "json") {
          writeJson(payload);
          return;
        }

        writePlain(
          `signed in as ${payload.username ?? "?"} · ${payload.entryCount} entries`,
        );
      } catch (error) {
        await handleCommandError(error);
      }
    },
  );
}
