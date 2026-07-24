import type { Command } from "commander";
import { requireMailRuntime } from "../context.ts";
import {
  searchMessages,
  type MessageSummary,
} from "../service/messages.ts";
import { DEFAULT_PAGE_SIZE } from "../proton/constants.ts";
import { emitOk, isDryRun, wantsJson } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";

function printSearchResults(query: string, messages: MessageSummary[]): void {
  if (messages.length === 0) {
    process.stdout.write(`No results for "${query}".\n`);
    return;
  }

  for (const message of messages) {
    const date = new Date(message.time * 1000).toISOString().slice(0, 16);
    const sender = message.senderName
      ? `${message.senderName} <${message.senderEmail}>`
      : message.senderEmail;
    process.stdout.write(
      `${date}\t${sender}\t${message.subject}\t${message.id}\n`,
    );
  }
}

export async function runMailSearch(
  query: string,
  options: {
    page?: number;
    pageSize?: number;
    passRef?: string;
  },
): Promise<void> {
  const page = options.page ?? 0;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  if (isDryRun()) {
    emitOk({
      dryRun: true,
      action: "search",
      query,
      page,
      pageSize,
    });
    return;
  }

  const runtime = await requireMailRuntime({ passRef: options.passRef });
  const result = await searchMessages({
    session: runtime.session,
    query,
    page,
    pageSize,
  });

  if (wantsJson()) {
    emitOk({
      action: "search",
      query,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      messages: result.messages,
    });
    return;
  }

  printSearchResults(query, result.messages);
}

export function registerSearch(mail: Command): void {
  mail
    .command("search")
    .description("Search messages by keyword")
    .argument("<query>", "Search keyword")
    .option("--page <n>", "Page index (0-based)", (value) => Number.parseInt(value, 10))
    .option("--page-size <n>", "Page size", (value) => Number.parseInt(value, 10))
    .option("--dry-run", "Print planned search without calling the API")
    .action(async function (
      this: Command,
      query: string,
      options: { page?: number; pageSize?: number },
    ) {
      try {
        const globals = this.parent?.optsWithGlobals() as { pass?: string } | undefined;
        await runMailSearch(query, {
          ...options,
          passRef: globals?.pass,
        });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
