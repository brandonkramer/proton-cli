import type { Command } from "commander";
import { serveMcp } from "../mcp/server.ts";

export function registerMcp(program: Command, version: string): void {
  program
    .command("mcp")
    .description("Run Proton MCP stdio server for Cursor / Codex / agent hosts")
    .action(async () => {
      await serveMcp(version);
    });
}
