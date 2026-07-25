import { callTool, TOOLS } from "./tools.ts";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
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
      if (
        headerEnd >= 0 &&
        /^content-length:/im.test(buf.subarray(0, headerEnd).toString("utf8"))
      ) {
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
