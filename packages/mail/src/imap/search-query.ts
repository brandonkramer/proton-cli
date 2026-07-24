import type { SearchObject } from "imapflow";
import { CliError } from "../util/errors.ts";
import { MailExitCode } from "../util/exit.ts";

export interface MessageSearchInput {
  text?: string;
  from?: string;
  to?: string;
  subject?: string;
  since?: string;
  before?: string;
  seen?: boolean;
  unseen?: boolean;
}

export function buildSearchQuery(input: MessageSearchInput): SearchObject {
  const query: SearchObject = {};
  let hasCriteria = false;

  if (input.text?.trim()) {
    query.text = input.text.trim();
    hasCriteria = true;
  }
  if (input.from?.trim()) {
    query.from = input.from.trim();
    hasCriteria = true;
  }
  if (input.to?.trim()) {
    query.to = input.to.trim();
    hasCriteria = true;
  }
  if (input.subject?.trim()) {
    query.subject = input.subject.trim();
    hasCriteria = true;
  }
  if (input.since?.trim()) {
    query.since = parseSearchDate(input.since.trim(), "since");
    hasCriteria = true;
  }
  if (input.before?.trim()) {
    query.before = parseSearchDate(input.before.trim(), "before");
    hasCriteria = true;
  }
  if (input.seen === true) {
    query.seen = true;
    hasCriteria = true;
  }
  if (input.unseen === true) {
    query.seen = false;
    hasCriteria = true;
  }

  if (!hasCriteria) {
    throw new CliError(
      "Search requires at least one criterion (--text, --from, --to, --subject, --since, --before, --seen, --unseen).",
      "search_query_empty",
      MailExitCode.USER,
    );
  }

  return query;
}

function parseSearchDate(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new CliError(
      `Invalid ${label} date "${value}". Use an ISO date such as 2026-01-15.`,
      "invalid_search_date",
      MailExitCode.USER,
    );
  }
  return parsed;
}
