import type { Command } from "commander";

function stubNotImplemented(command: string): () => never {
  return () => {
    console.error(`settings ${command}: not implemented yet`);
    process.exit(1);
  };
}

/** Register `proton settings …` (and legacy `protonsettings …`) commands. */
export function registerSettingsCommands(settings: Command): void {
  settings
    .command("get")
    .description("Get account settings (text or JSON)")
    .action(stubNotImplemented("get"));

  settings
    .command("mail")
    .description("Get mail preference settings (text or JSON)")
    .action(stubNotImplemented("mail"));

  settings
    .command("set")
    .description("List or update mail settings")
    .argument("[key]", "Setting key")
    .argument("[value]", "Setting value")
    .action(stubNotImplemented("set"));
}
