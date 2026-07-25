import { runProtonCli } from "./run.ts";

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
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

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function strList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  const one = str(value);
  return one ? [one] : [];
}

function pushRepeat(argv: string[], flag: string, values: string[]): void {
  for (const v of values) {
    argv.push(flag, v);
  }
}

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const TOOLS: McpToolDef[] = [
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
    name: "proton_vpn_list",
    description:
      "List VPN exit countries or servers (proton vpn countries|servers --json).",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["countries", "servers"],
          description: "Default countries",
        },
        country: {
          type: "string",
          description: "Filter servers by exit country code (e.g. US)",
        },
        city: { type: "string", description: "Filter servers by city" },
        limit: {
          type: "number",
          description: "Max server rows (servers mode)",
        },
      },
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
    name: "proton_mail_get",
    description: "Read and decrypt a mail message (proton mail read <id> --json).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message ID" },
        raw: {
          type: "boolean",
          description: "Keep HTML body without text conversion",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "proton_mail_search",
    description: "Search mail messages (proton mail search <query> --json).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword" },
        page: { type: "number", description: "Page index (0-based)" },
        pageSize: { type: "number", description: "Page size" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "proton_mail_send",
    description:
      "Encrypt and send mail (proton mail send). Always confirmed; never pass secrets.",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "array",
          items: { type: "string" },
          description: "To recipients",
        },
        cc: { type: "array", items: { type: "string" } },
        bcc: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
        body: { type: "string" },
        html: { type: "boolean", description: "Treat body as HTML" },
        attach: {
          type: "array",
          items: { type: "string" },
          description: "Local attachment paths",
        },
      },
      required: ["to", "subject"],
      additionalProperties: false,
    },
  },
  {
    name: "proton_mail_reply",
    description:
      "Reply to a mail message (proton mail reply <id>). Always confirmed.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message ID" },
        body: { type: "string", description: "Reply body prefix" },
        all: { type: "boolean", description: "Reply-all" },
        html: { type: "boolean" },
        to: { type: "array", items: { type: "string" } },
        subject: { type: "string" },
      },
      required: ["id", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "proton_contacts_list",
    description: "List contacts (proton contacts list --json).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "proton_contacts_create",
    description: "Create a contact (proton contacts create). Always confirmed.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: {
          type: "array",
          items: { type: "string" },
          description: "Email addresses",
        },
        phone: { type: "array", items: { type: "string" } },
        note: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "proton_calendar_upcoming",
    description:
      "List upcoming calendar events (proton calendar events list --json). Defaults to next 7 local days.",
    inputSchema: {
      type: "object",
      properties: {
        calendar: { type: "string", description: "Calendar ID or name" },
        start: { type: "string", description: "Start YYYY-MM-DD (default today)" },
        end: {
          type: "string",
          description: "End YYYY-MM-DD (default start+7 days)",
        },
        days: {
          type: "number",
          description: "Days ahead when end omitted (default 7)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "proton_calendar_create",
    description:
      "Create a calendar event (proton calendar events create). Always confirmed.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: {
          type: "string",
          description: "Start RFC3339 or YYYY-MM-DDTHH:MM",
        },
        duration: { type: "string", description: "e.g. 1h, 30m (default 1h)" },
        calendar: { type: "string", description: "Calendar ID or name" },
        location: { type: "string" },
        description: { type: "string" },
        allDay: { type: "boolean" },
      },
      required: ["title", "start"],
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
    name: "proton_drive_get",
    description:
      "Drive item metadata (info) or download to a local path (proton drive items info|download).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Drive file/folder path" },
        out: {
          type: "string",
          description:
            "If set, download to this local path (confirmed). Omit for metadata only.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "proton_drive_upload",
    description:
      "Upload a local file to Drive (proton drive items upload). Always confirmed.",
    inputSchema: {
      type: "object",
      properties: {
        src: { type: "string", description: "Local file path" },
        dest: {
          type: "string",
          description: "Destination folder (default /)",
        },
      },
      required: ["src"],
      additionalProperties: false,
    },
  },
  {
    name: "proton_settings_get",
    description:
      "Get account or mail preference settings (proton settings get|mail --json).",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["account", "mail"],
          description: "Default account",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "proton_cli",
    description:
      "Run an allowlisted proton CLI subcommand with JSON/agent mode. Pass args after `proton` (e.g. [\"mail\",\"list\"]). Non-read commands require confirm=true. Never pass --password/--totp.",
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
          description: "Required true for non-read (mutating) commands",
        },
      },
      required: ["args"],
      additionalProperties: false,
    },
  },
];

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "proton_status":
      return formatResult(await runProtonCli(["status"]));
    case "proton_vpn_status":
      return formatResult(await runProtonCli(["vpn", "status"]));
    case "proton_vpn_list": {
      const mode = str(args.mode) || "countries";
      if (mode === "servers") {
        const argv = ["vpn", "servers"];
        const country = str(args.country);
        const city = str(args.city);
        if (country) argv.push("--country", country);
        if (city) argv.push("--city", city);
        if (typeof args.limit === "number" && Number.isFinite(args.limit)) {
          argv.push("--limit", String(Math.trunc(args.limit)));
        }
        return formatResult(await runProtonCli(argv));
      }
      if (mode !== "countries") {
        return toolText("error: mode must be countries or servers", true);
      }
      return formatResult(await runProtonCli(["vpn", "countries"]));
    }
    case "proton_auth_code": {
      const query = str(args.query);
      if (!query) return toolText("error: query is required", true);
      return formatResult(await runProtonCli(["auth", "code", query]));
    }
    case "proton_mail_list": {
      const argv = ["mail", "list"];
      const label = str(args.label);
      if (label) argv.push("--label", label);
      return formatResult(await runProtonCli(argv));
    }
    case "proton_mail_get": {
      const id = str(args.id);
      if (!id) return toolText("error: id is required", true);
      const argv = ["mail", "read", id];
      if (args.raw === true) argv.push("--raw");
      return formatResult(await runProtonCli(argv));
    }
    case "proton_mail_search": {
      const query = str(args.query);
      if (!query) return toolText("error: query is required", true);
      const argv = ["mail", "search", query];
      if (typeof args.page === "number" && Number.isFinite(args.page)) {
        argv.push("--page", String(Math.trunc(args.page)));
      }
      if (typeof args.pageSize === "number" && Number.isFinite(args.pageSize)) {
        argv.push("--page-size", String(Math.trunc(args.pageSize)));
      }
      return formatResult(await runProtonCli(argv));
    }
    case "proton_mail_send": {
      const to = strList(args.to);
      const subject = str(args.subject);
      if (to.length === 0) return toolText("error: to is required", true);
      if (!subject) return toolText("error: subject is required", true);
      const argv = ["mail", "send", "--subject", subject];
      pushRepeat(argv, "--to", to);
      pushRepeat(argv, "--cc", strList(args.cc));
      pushRepeat(argv, "--bcc", strList(args.bcc));
      pushRepeat(argv, "--attach", strList(args.attach));
      const body = str(args.body);
      if (body) argv.push("--body", body);
      if (args.html === true) argv.push("--html");
      return formatResult(await runProtonCli(argv, { confirm: true }));
    }
    case "proton_mail_reply": {
      const id = str(args.id);
      const body = str(args.body);
      if (!id) return toolText("error: id is required", true);
      if (!body) return toolText("error: body is required", true);
      const argv = ["mail", "reply", id, "--body", body];
      pushRepeat(argv, "--to", strList(args.to));
      const subject = str(args.subject);
      if (subject) argv.push("--subject", subject);
      if (args.all === true) argv.push("--all");
      if (args.html === true) argv.push("--html");
      return formatResult(await runProtonCli(argv, { confirm: true }));
    }
    case "proton_contacts_list":
      return formatResult(await runProtonCli(["contacts", "list"]));
    case "proton_contacts_create": {
      const name = str(args.name);
      if (!name) return toolText("error: name is required", true);
      const argv = ["contacts", "create", "--name", name];
      pushRepeat(argv, "--email", strList(args.email));
      pushRepeat(argv, "--phone", strList(args.phone));
      const note = str(args.note);
      if (note) argv.push("--note", note);
      return formatResult(await runProtonCli(argv, { confirm: true }));
    }
    case "proton_calendar_upcoming": {
      const start = str(args.start) || localYmd(new Date());
      let end = str(args.end);
      if (!end) {
        const days =
          typeof args.days === "number" && Number.isFinite(args.days)
            ? Math.max(0, Math.trunc(args.days))
            : 7;
        const endDate = new Date(`${start}T12:00:00`);
        if (Number.isNaN(endDate.getTime())) {
          return toolText("error: start must be YYYY-MM-DD", true);
        }
        endDate.setDate(endDate.getDate() + days);
        end = localYmd(endDate);
      }
      const argv = [
        "calendar",
        "events",
        "list",
        "--start",
        start,
        "--end",
        end,
      ];
      const calendar = str(args.calendar);
      if (calendar) argv.push("--calendar", calendar);
      return formatResult(await runProtonCli(argv));
    }
    case "proton_calendar_create": {
      const title = str(args.title);
      const start = str(args.start);
      if (!title) return toolText("error: title is required", true);
      if (!start) return toolText("error: start is required", true);
      const argv = [
        "calendar",
        "events",
        "create",
        "--title",
        title,
        "--start",
        start,
      ];
      const duration = str(args.duration);
      if (duration) argv.push("--duration", duration);
      const calendar = str(args.calendar);
      if (calendar) argv.push("--calendar", calendar);
      const location = str(args.location);
      if (location) argv.push("--location", location);
      const description = str(args.description);
      if (description) argv.push("--description", description);
      if (args.allDay === true) argv.push("--all-day");
      return formatResult(await runProtonCli(argv, { confirm: true }));
    }
    case "proton_drive_list": {
      const path = str(args.path) || "/";
      return formatResult(await runProtonCli(["drive", "items", "list", path]));
    }
    case "proton_drive_get": {
      const path = str(args.path);
      if (!path) return toolText("error: path is required", true);
      const out = str(args.out);
      if (out) {
        return formatResult(
          await runProtonCli(["drive", "items", "download", path, out], {
            confirm: true,
          }),
        );
      }
      return formatResult(await runProtonCli(["drive", "items", "info", path]));
    }
    case "proton_drive_upload": {
      const src = str(args.src);
      if (!src) return toolText("error: src is required", true);
      const dest = str(args.dest) || "/";
      return formatResult(
        await runProtonCli(["drive", "items", "upload", src, dest], {
          confirm: true,
        }),
      );
    }
    case "proton_settings_get": {
      const scope = str(args.scope) || "account";
      if (scope === "mail") {
        return formatResult(await runProtonCli(["settings", "mail"]));
      }
      if (scope !== "account") {
        return toolText("error: scope must be account or mail", true);
      }
      return formatResult(await runProtonCli(["settings", "get"]));
    }
    case "proton_cli": {
      const cliArgs = Array.isArray(args.args)
        ? args.args.map((a) => String(a))
        : [];
      return formatResult(
        await runProtonCli(cliArgs, { confirm: Boolean(args.confirm) }),
      );
    }
    default:
      return toolText(`error: unknown tool ${name}`, true);
  }
}
