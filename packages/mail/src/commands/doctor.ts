import type { Command } from "commander";
import { loadMailConfig } from "../config/store.ts";
import {
  passwordStatusFromConfig,
  resolveBridgePassword,
} from "../config/password.ts";
import { configDir } from "../config/paths.ts";
import { probeImap, probeSmtp, BRIDGE_HELP } from "../util/connectivity.ts";
import {
  handleCommandError,
  setCommandOutputFormat,
} from "../util/command.ts";
import { CliError } from "../util/errors.ts";
import {
  addOutputOption,
  resolveOutputFormat,
  writeJson,
  writePlain,
} from "../util/output.ts";

interface DoctorOptions {
  output?: string;
  skipAuth?: boolean;
}

export function registerDoctor(mail: Command): void {
  addOutputOption(
    mail
      .command("doctor")
      .description("Check Bridge connectivity and local mail config")
      .option(
        "--skip-auth",
        "Only probe IMAP/SMTP reachability; skip password resolution",
      ),
  ).action(async (options: DoctorOptions) => {
    try {
      const format = resolveOutputFormat(options.output);
      setCommandOutputFormat(format);

      const config = await loadMailConfig();
      if (!config) {
        throw new CliError(
          "Mail is not configured.\nRun `proton mail setup` first.",
          "config_missing",
          2,
        );
      }

      const passwordStatus = passwordStatusFromConfig(config);
      if (!passwordStatus.configured && !options.skipAuth) {
        throw new CliError(
          "Bridge password is not configured.\n" +
            "Set PROTONMAIL_PASSWORD, PROTONMAIL_PASS, or configure Pass/file in `proton mail setup`.",
          "password_missing",
          2,
        );
      }

      if (!options.skipAuth) {
        const password = await resolveBridgePassword(config);
        if (!password) {
          throw new CliError(
            "Bridge password could not be resolved.\n" +
              "Set PROTONMAIL_PASSWORD or configure Pass/file in `proton mail setup`.",
            "password_missing",
            2,
          );
        }
        // Password is resolved for future IMAP auth checks; connectivity probe is TLS-only in PH0.
        void password;
      }

      const imap = await probeImap(config.imap);
      const smtp = await probeSmtp(config.smtp);
      const ok = imap.ok && smtp.ok;

      const payload = {
        ok,
        configDir: configDir(),
        username: config.username,
        password: {
          configured: passwordStatus.configured,
          source: passwordStatus.source,
          detail: passwordStatus.detail ?? null,
        },
        imap,
        smtp,
        help: BRIDGE_HELP,
      };

      if (format === "json") {
        writeJson(payload);
      } else {
        writePlain([
          `ok\t${ok}`,
          `configDir\t${configDir()}`,
          `username\t${config.username}`,
          `password\t${passwordStatus.configured ? passwordStatus.source : "missing"}`,
          ...(passwordStatus.detail ? [`passwordDetail\t${passwordStatus.detail}`] : []),
          `imap\t${imap.ok ? "ok" : "fail"} ${imap.endpoint} — ${imap.message.split("\n")[0]}`,
          `smtp\t${smtp.ok ? "ok" : "fail"} ${smtp.endpoint} — ${smtp.message.split("\n")[0]}`,
        ]);
        if (!ok) {
          writePlain("");
          writePlain(imap.ok ? smtp.message : imap.message);
        }
      }

      if (!ok) {
        process.exitCode = 5;
      }
    } catch (error) {
      await handleCommandError(error);
    }
  });
}
