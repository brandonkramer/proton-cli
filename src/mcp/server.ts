import { runProtonCli, validateCliArgs } from "./run.ts";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function toolText(text: string, isError = false): unknown {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function formatResult(result: Awaited<ReturnType<typeof runProtonCli>>): unknown {
  const body = [
    result.stdout.trim(),
    result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : "",
    `exit=${result.code} argv=${JSON.stringify(result.argv)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return toolText(body || "(no output)", !result.ok);
}

const TOOLS = [
  {
    name: "proton_status",
    description: "Show Proton CLI session status (proton status --json).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "proton_vpn_status",
    description: "Show VPN tunnel/session status (proton vpn status --json).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "proton_auth_code",
    description:
      "Show current Authenticator TOTP/Steam code for a query (proton auth code <query> --json).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Issuer/name substring" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "proton_mail_list",
    description: "List mail messages (proton mail list --json).",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Label id/name (default inbox)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "proton_drive_list",
    description: "List Drive folder (proton drive items list --json).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Folder path (default /)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "proton_cli",
    description:
      "Run an allowlisted proton CLI subcommand with JSON/agent mode. Pass args after `proton` (e.g. [\"mail\",\"list\"]). Mutating commands require confirm=true. Never pass --password/--totp.",
    inputSchema: {
      type: "object",
      properties: {
        args: {
          type: "array",
          items: { type: "string" },
          description: "CLI argv after proton",
        },
        confirm: {
          type: "boolean",
          description: "Required true for mutating commands",
        },
      },
      required: ["args"],
      additionalProperties: false,
    },
  },
] as const;

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "proton_status":
      return formatResult(await runProtonCli(["status"]));
    case "proton_vpn_status":
      return formatResult(await runProtonCli(["vpn", "status"]));
    case "proton_auth_code": {
      const query = String(args.query ?? "").trim();
      if (!query) return toolText("error: query is required", true);
      return formatResult(await runProtonCli(["auth", "code", query]));
    }
    case "proton_mail_list": {
      const argv = ["mail", "list"];
      const label = String(args.label ?? "").trim();
      if (label) argv.push("--label", label);
      return formatResult(await runProtonCli(argv));
    }
    case "proton_drive_list": {
      const path = String(args.path ?? "/").trim() || "/";
      return formatResult(await runProtonCli(["drive", "items", "list", path]));
    }
    case "proton_cli": {
      const cliArgs = Array.isArray(args.args)
        ? args.args.map((a) => String(a))
        : [];
      const bad = validateCliArgs(cliArgs);
      if (bad) return toolText(`error: ${bad}`, true);
      return formatResult(
        await runProtonCli(cliArgs, { confirm: Boolean(args.confirm) }),
      );
    }
    default:
      return toolText(`error: unknown tool ${name}`, true);
  }
}

function encodeMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(
    `Content-Length: ${body.byteLength}\r\n\r\n`,
    "utf8",
  );
  return Buffer.concat([header, body]);
}

async function handleRequest(
  req: JsonRpcRequest,
  version: string,
): Promise<unknown | null> {
  const method = req.method ?? "";
  const id = req.id;
  const params = req.params ?? {};

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "proton", version },
        },
      };
    case "notifications/initialized":
    case "initialized":
      return null;
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    case "tools/call": {
      const name = String(params.name ?? "");
      const args =
        params.arguments && typeof params.arguments === "object"
          ? (params.arguments as Record<string, unknown>)
          : {};
      try {
        return {
          jsonrpc: "2.0",
          id,
          result: await callTool(name, args),
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }
    default:
      if (id === undefined || id === null) return null;
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

async function readStdinMessages(
  onMessage: (req: JsonRpcRequest) => Promise<void>,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    let buf = Buffer.concat(chunks);
    chunks.length = 0;

    while (buf.length > 0) {
      // Content-Length framing
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd >= 0 && /^content-length:/im.test(buf.subarray(0, headerEnd).toString("utf8"))) {
        const header = buf.subarray(0, headerEnd).toString("utf8");
        const match = /content-length:\s*(\d+)/i.exec(header);
        const len = match ? Number(match[1]) : 0;
        const start = headerEnd + 4;
        if (buf.length < start + len) {
          chunks.push(buf);
          break;
        }
        const body = buf.subarray(start, start + len).toString("utf8");
        buf = buf.subarray(start + len);
        try {
          await onMessage(JSON.parse(body) as JsonRpcRequest);
        } catch {
          // ignore malformed
        }
        continue;
      }

      // Newline-delimited JSON fallback
      const nl = buf.indexOf("\n");
      if (nl < 0) {
        chunks.push(buf);
        break;
      }
      const line = buf.subarray(0, nl).toString("utf8").trim();
      buf = buf.subarray(nl + 1);
      if (!line) continue;
      try {
        await onMessage(JSON.parse(line) as JsonRpcRequest);
      } catch {
        // ignore malformed
      }
    }
  }
}

/** MCP stdio server (JSON-RPC with Content-Length, NDJSON fallback). */
export async function serveMcp(version: string): Promise<void> {
  await readStdinMessages(async (req) => {
    const response = await handleRequest(req, version);
    if (response) {
      process.stdout.write(encodeMessage(response));
    }
  });
}
