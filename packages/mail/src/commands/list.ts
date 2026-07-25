import type { Command } from "commander";
import { requireMailRuntime } from "../context.ts";
import {
  listMessagesForCommand,
  type MessageSummary,
} from "../service/messages.ts";
import { DEFAULT_PAGE_SIZE, resolveLabelId } from "../proton/constants.ts";
import { emitOk, isDryRun, wantsJson } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";

function printMessageTable(
  messages: MessageSummary[],
  options: { party?: "from" | "to" } = {},
): void {
  if (messages.length === 0) {
    process.stdout.write("No messages.\n");
    return;
  }

  for (const message of messages) {
    const date = new Date(message.time * 1000).toISOString().slice(0, 16);
    const unread = message.unread ? "*" : " ";
    const party =
      options.party === "to"
        ? message.to.length > 0
          ? `→ ${message.to.join(", ")}`
          : "(no recipients)"
        : message.senderName
          ? `${message.senderName} <${message.senderEmail}>`
          : message.senderEmail;
    process.stdout.write(
      `${unread}\t${date}\t${party}\t${message.subject}\t${message.id}\n`,
    );
  }
}

export async function runMailList(options: {
  label?: string;
  page?: number;
  pageSize?: number;
  unread?: boolean;
  passRef?: string;
}): Promise<void> {
  const labelId = resolveLabelId(options.label);
  const page = options.page ?? 0;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  if (isDryRun()) {
    emitOk({
      dryRun: true,
      action: "list",
      labelId,
      page,
      pageSize,
      unread: Boolean(options.unread),
    });
    return;
  }

  const runtime = await requireMailRuntime({ passRef: options.passRef });
  const result = await listMessagesForCommand({
    session: runtime.session,
    labelId: options.label,
    page,
    pageSize,
    unread: options.unread,
  });

  if (wantsJson()) {
    emitOk({
      action: "list",
      labelId: result.labelId,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      messages: result.messages,
    });
    return;
  }

  const party =
    result.labelId === resolveLabelId("sent") || options.label === "sent"
      ? "to"
      : "from";
  printMessageTable(result.messages, { party });
}

function registerListCommand(
  mail: Command,
  name: string,
  description: string,
  defaultLabel?: string,
): void {
  mail
    .command(name)
    .description(description)
    .option(
      "--label <id>",
      "Label ID or system name (inbox, sent, drafts, trash, spam, archive, starred, all)",
      defaultLabel,
    )
    .option("--page <n>", "Page index (0-based)", (value) => Number.parseInt(value, 10))
    .option("--page-size <n>", "Page size", (value) => Number.parseInt(value, 10))
    .option("--unread", "Unread messages only")
    .option("--dry-run", "Print planned query without calling the API")
    .action(async function (
      this: Command,
      options: {
        label?: string;
        page?: number;
        pageSize?: number;
        unread?: boolean;
      },
    ) {
      try {
        const globals = this.parent?.optsWithGlobals() as { pass?: string } | undefined;
        await runMailList({
          ...options,
          label: options.label ?? defaultLabel,
          passRef: globals?.pass,
        });
      } catch (error) {
        reportCommandError(error);
      }
    });
}

export function registerList(mail: Command): void {
  registerListCommand(
    mail,
    "list",
    "List messages in a label (default: inbox)",
  );
  registerListCommand(mail, "sent", "List sent messages", "sent");
}
