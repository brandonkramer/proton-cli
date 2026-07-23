import type { Command } from "commander";
import {
  buildUpdatePlan,
  compareVersions,
  detectInstallChannel,
  fetchLatestVersion,
  runSelfUpdate,
} from "../setup/self-update.ts";

const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);

async function currentVersion(): Promise<string> {
  const pkg = (await Bun.file(PACKAGE_JSON_URL).json()) as { version: string };
  return pkg.version;
}

export function registerUpdate(program: Command): void {
  program
    .command("update")
    .description(
      "Update @bkramer/proton-cli to the latest version (or a given one)",
    )
    .argument("[version]", "Target version (default: latest)")
    .option("--check", "Only check for updates; do not install")
    .option("--json", "Machine-readable JSON")
    .action(async function (
      this: Command,
      versionArg: string | undefined,
    ) {
      const opts = this.optsWithGlobals() as { check?: boolean; json?: boolean };
      try {
        const current = await currentVersion();
        const channel = detectInstallChannel();
        const target = versionArg?.trim() || "latest";
        const latest =
          target === "latest" ? await fetchLatestVersion() : target;
        const info = compareVersions(current, latest);
        const plan = buildUpdatePlan(channel, target);

        if (opts.check || (target === "latest" && !info.updateAvailable)) {
          const payload = {
            version: 1,
            current: info.current,
            latest: info.latest,
            updateAvailable: info.updateAvailable,
            channel: plan.channel,
            checkedOnly: Boolean(opts.check) || !info.updateAvailable,
          };
          if (opts.json) {
            console.log(JSON.stringify(payload));
            return;
          }
          console.log(
            info.updateAvailable
              ? `Current ${info.current} → latest ${info.latest} (${plan.channel}). Run \`proton update\`.`
              : `Already on latest (${info.current}) via ${plan.channel}.`,
          );
          return;
        }

        if (!opts.json) {
          console.log(
            `Updating @bkramer/proton-cli ${info.current} → ${latest} via ${plan.command}…`,
          );
        }

        await runSelfUpdate(plan);
        const after = await currentVersion();
        if (opts.json) {
          console.log(
            JSON.stringify({
              version: 1,
              updated: true,
              previous: info.current,
              current: after,
              target: latest,
              channel: plan.channel,
            }),
          );
          return;
        }
        console.log(
          after === info.current
            ? `Update command finished. Restart the shell if \`proton --version\` still shows ${info.current}.`
            : `${info.current} → ${after} (${plan.channel})`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (opts.json) {
          console.log(JSON.stringify({ version: 1, ok: false, error: message }));
        } else {
          console.error(message);
        }
        process.exitCode = 1;
      }
    });
}
