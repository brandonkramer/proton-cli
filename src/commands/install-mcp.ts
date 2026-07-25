import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { homedir } from "node:os";

type Host = "cursor" | "codex" | "claude" | "pi" | "all";
type Scope = "user" | "project" | "local";

const ALL_HOSTS: Host[] = ["cursor", "codex", "claude", "pi"];

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function mcpServerBlock(command: string, args: string[]): Record<string, unknown> {
  return {
    command,
    args,
  };
}

function resolveProtonLaunch(root: string): { command: string; args: string[] } {
  const entry = join(root, "src", "index.ts");
  return { command: "bun", args: ["run", entry, "mcp"] };
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function mergeCursorMcp(
  path: string,
  server: Record<string, unknown>,
  dryRun: boolean,
): Promise<string> {
  let existing: { mcpServers?: Record<string, unknown> } = {};
  if (await pathExists(path)) {
    try {
      existing = JSON.parse(await readFile(path, "utf8")) as typeof existing;
    } catch {
      existing = {};
    }
  }
  const next = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers ?? {}),
      proton: server,
    },
  };
  if (!dryRun) await writeJson(path, next);
  return path;
}

async function writeCodexToml(
  path: string,
  command: string,
  args: string[],
  dryRun: boolean,
): Promise<string> {
  const argsToml = args.map((a) => JSON.stringify(a)).join(", ");
  const body = `[mcp_servers.proton]
command = ${JSON.stringify(command)}
args = [${argsToml}]
`;
  if (!dryRun) {
    await mkdir(dirname(path), { recursive: true });
    let existing = "";
    if (await pathExists(path)) {
      existing = await readFile(path, "utf8");
      existing = existing.replace(
        /\[mcp_servers\.proton\][\s\S]*?(?=\n\[|\s*$)/,
        "",
      );
      existing = existing.trimEnd();
      if (existing) existing += "\n\n";
    }
    await writeFile(path, `${existing}${body}`, "utf8");
  }
  return path;
}

async function writeProjectSkill(projectDir: string, dryRun: boolean): Promise<string> {
  const destDir = join(projectDir, ".agents", "skills", "proton-cli");
  const dest = join(destDir, "SKILL.md");
  const src = join(repoRoot(), "skills", "proton-cli", "SKILL.md");
  if (!dryRun) {
    await mkdir(destDir, { recursive: true });
    await copyFile(src, dest);
  }
  return dest;
}

async function writePiSettingsHint(
  projectDir: string,
  dryRun: boolean,
): Promise<string> {
  const path = join(projectDir, ".pi", "README.proton-mcp.md");
  const text = `# Proton CLI for Pi

Install this checkout as a Pi package (skills):

\`\`\`bash
pi install . -l
\`\`\`

Or from GitHub:

\`\`\`bash
pi install git:github.com/brandonkramer/proton-cli
\`\`\`

MCP: wire \`proton mcp\` through your MCP adapter (PATH binary, or \`bun run src/index.ts mcp\` from a checkout).

Sign in on a human TTY first: \`proton signin\` / \`proton account pass://Vault/Item\`.
`;
  if (!dryRun) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, "utf8");
  }
  return path;
}

function printClaudeUserInstall(root: string): void {
  console.log("Claude (user): from a checkout of this repo, run:");
  console.log(`  claude plugin marketplace add ${root}`);
  console.log("  claude plugin install proton@proton-local --scope user");
  console.log("  claude plugin update proton@proton-local");
  console.log("(requires `claude` on PATH; marketplace manifest: .claude-plugin/marketplace.json)");
}

export function registerInstallMcp(program: Command): void {
  program
    .command("install-mcp")
    .description("Wire proton MCP + skill into Cursor, Codex, Claude, and/or Pi")
    .option(
      "--scope <scope>",
      "user | project | local (default: project)",
      "project",
    )
    .option(
      "--host <host>",
      "cursor | codex | claude | pi | all (repeatable)",
      (value: string, prev: string[]) => [...prev, value],
      [] as string[],
    )
    .option("--root <path>", "Plugin/repo root (default: this package)")
    .option("--project-dir <path>", "Project directory (default: cwd)")
    .option("--dry-run", "Print actions without writing", false)
    .action(async (options: {
      scope: string;
      host: string[];
      root?: string;
      projectDir?: string;
      dryRun?: boolean;
    }) => {
      const scope = options.scope.toLowerCase() as Scope;
      if (!["user", "project", "local"].includes(scope)) {
        console.error("invalid --scope (want user|project|local)");
        process.exitCode = 1;
        return;
      }

      const hostsRaw = options.host.length ? options.host : ["all"];
      const hosts = new Set<Host>();
      for (const h of hostsRaw) {
        const v = h.toLowerCase() as Host;
        if (v === "all") {
          for (const host of ALL_HOSTS) hosts.add(host);
        } else if (
          v === "cursor" ||
          v === "codex" ||
          v === "claude" ||
          v === "pi"
        ) {
          hosts.add(v);
        } else {
          console.error(
            `invalid --host ${h} (want cursor|codex|claude|pi|all)`,
          );
          process.exitCode = 1;
          return;
        }
      }

      const root = resolve(options.root?.trim() || repoRoot());
      const projectDir = resolve(options.projectDir?.trim() || process.cwd());
      const dryRun = Boolean(options.dryRun);
      const launch = resolveProtonLaunch(root);
      const server = mcpServerBlock(launch.command, launch.args);

      console.log(`plugin root: ${root}`);
      console.log(`scope:       ${scope}`);
      console.log(`hosts:       ${[...hosts].join(",")}`);
      if (dryRun) console.log("dry-run; no changes will be written");

      const written: string[] = [];

      if (scope === "project" || scope === "local") {
        written.push(await writeProjectSkill(projectDir, dryRun));
        if (hosts.has("cursor")) {
          written.push(
            await mergeCursorMcp(join(projectDir, ".cursor", "mcp.json"), server, dryRun),
          );
        }
        if (hosts.has("codex")) {
          written.push(
            await writeCodexToml(
              join(projectDir, ".codex", "config.toml"),
              launch.command,
              launch.args,
              dryRun,
            ),
          );
        }
        if (hosts.has("claude")) {
          // Claude Code project MCP config
          written.push(
            await mergeCursorMcp(join(projectDir, ".mcp.json"), server, dryRun),
          );
        }
        if (hosts.has("pi")) {
          written.push(await writePiSettingsHint(projectDir, dryRun));
        }
      } else {
        // user scope
        if (hosts.has("cursor")) {
          written.push(
            await mergeCursorMcp(
              join(homedir(), ".cursor", "mcp.json"),
              server,
              dryRun,
            ),
          );
        }
        if (hosts.has("codex")) {
          written.push(
            await writeCodexToml(
              join(homedir(), ".codex", "config.toml"),
              launch.command,
              launch.args,
              dryRun,
            ),
          );
        }
        if (hosts.has("claude")) {
          printClaudeUserInstall(root);
        }
        if (hosts.has("pi")) {
          console.log(
            "Pi (user): run `pi install git:github.com/brandonkramer/proton-cli` (or `pi install <checkout>`).",
          );
          console.log(
            `MCP command for pi-mcp-adapter: ${launch.command} ${launch.args.join(" ")}`,
          );
        }
      }

      for (const path of written) {
        console.log(`${dryRun ? "would write" : "wrote"} ${path}`);
      }
    });
}
