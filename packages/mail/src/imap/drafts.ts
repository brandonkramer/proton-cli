import type { ImapFlow } from "imapflow";
import { buildRawMailMessage } from "../mime/build.ts";
import { parseMessageHeaders } from "../mime/headers.ts";
import { buildSendMail, type SendInput } from "../smtp/compose.ts";
import { deliverSend, type DeliverMailResult } from "../smtp/send.ts";
import type { Transporter } from "nodemailer";
import { CliError } from "../util/errors.ts";
import { MailExitCode } from "../util/exit.ts";
import { formatMessageRef, type MessageRef } from "../util/uid.ts";
import { cliErrorFromUnknown } from "../util/exit-map.ts";
import { selectMailbox } from "./client.ts";
import { resolveSpecialMailbox } from "./folders.ts";
import {
  listMailboxMessages,
  readMailboxMessage,
  type MessageDetail,
  type MessageSummary,
} from "./messages.ts";

export interface DraftSaveInput {
  from: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  html?: string;
}

export interface DraftMutationOptions {
  dryRun?: boolean;
}

export interface SaveDraftOptions extends DraftMutationOptions {
  updateRef?: MessageRef;
}

export interface SaveDraftResult {
  dryRun: boolean;
  ref: string;
  mailbox: string;
  uid: number | null;
  updated?: string;
}

export interface DeleteDraftResult {
  dryRun: boolean;
  ref: string;
  mailbox: string;
  uid: number;
}

export interface SendDraftResult {
  dryRun: boolean;
  ref: string;
  deliver: DeliverMailResult;
  deleted: boolean;
}

export async function resolveDraftsMailbox(client: ImapFlow): Promise<string> {
  return resolveSpecialMailbox(client, "drafts");
}

export async function listDraftMessages(
  client: ImapFlow,
  limit: number,
): Promise<MessageSummary[]> {
  const mailbox = await resolveDraftsMailbox(client);
  return listMailboxMessages(client, mailbox, limit);
}

export async function readDraftMessage(
  client: ImapFlow,
  uid: number,
  options: { raw?: boolean } = {},
): Promise<MessageDetail> {
  const mailbox = await resolveDraftsMailbox(client);
  return readMailboxMessage(client, mailbox, uid, options);
}

export async function saveDraftMessage(
  client: ImapFlow,
  input: DraftSaveInput,
  options: SaveDraftOptions = {},
): Promise<SaveDraftResult> {
  const mailbox = await resolveDraftsMailbox(client);
  const dryRun = options.dryRun === true;
  const preview = buildSendMail(toSendInput(input));
  const updateRef = options.updateRef;

  if (dryRun) {
    return {
      dryRun: true,
      ref: updateRef
        ? formatMessageRef(updateRef.mailbox, updateRef.uid)
        : `${mailbox}::(new)`,
      mailbox,
      uid: updateRef?.uid ?? null,
      updated: updateRef ? formatMessageRef(updateRef.mailbox, updateRef.uid) : undefined,
    };
  }

  const lock = await selectMailbox(client, mailbox);
  try {
    const raw = await buildRawMailMessage(preview);
    const appendResult = await client.append(mailbox, raw, ["\\Draft"], new Date());
    const appendedUid =
      appendResult && typeof appendResult === "object" && "uid" in appendResult
        ? appendResult.uid
        : undefined;
    const uid =
      typeof appendedUid === "number" && appendedUid > 0 ? appendedUid : null;

    if (updateRef) {
      await assertDraftRef(updateRef, mailbox);
      await client.messageDelete([updateRef.uid], { uid: true });
    }

    if (uid === null) {
      throw new CliError(
        "Draft was saved but IMAP APPEND did not return a UID.",
        "draft_save_failed",
        MailExitCode.CONFLICT,
      );
    }

    return {
      dryRun: false,
      ref: formatMessageRef(mailbox, uid),
      mailbox,
      uid,
      updated: updateRef ? formatMessageRef(updateRef.mailbox, updateRef.uid) : undefined,
    };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw cliErrorFromUnknown(error, "draft_save_failed");
  } finally {
    lock.release();
  }
}

export async function deleteDraftMessage(
  client: ImapFlow,
  ref: MessageRef,
  options: DraftMutationOptions = {},
): Promise<DeleteDraftResult> {
  const mailbox = await resolveDraftsMailbox(client);
  await assertDraftRef(ref, mailbox);

  const dryRun = options.dryRun === true;
  const formatted = formatMessageRef(ref.mailbox, ref.uid);

  if (dryRun) {
    return {
      dryRun: true,
      ref: formatted,
      mailbox: ref.mailbox,
      uid: ref.uid,
    };
  }

  const lock = await selectMailbox(client, ref.mailbox);
  try {
    await client.messageDelete([ref.uid], { uid: true });
    return {
      dryRun: false,
      ref: formatted,
      mailbox: ref.mailbox,
      uid: ref.uid,
    };
  } catch (error) {
    throw cliErrorFromUnknown(error, "draft_delete_failed");
  } finally {
    lock.release();
  }
}

export async function sendDraftMessage(
  client: ImapFlow,
  ref: MessageRef,
  options: DraftMutationOptions & {
    transport?: Transporter;
    from: string;
  },
): Promise<SendDraftResult> {
  const mailbox = await resolveDraftsMailbox(client);
  await assertDraftRef(ref, mailbox);

  const dryRun = options.dryRun === true;
  const draft = await readDraftMessage(client, ref.uid, { raw: true });
  if (!draft.raw) {
    throw new CliError(
      `Could not load draft source for ${draft.ref}.`,
      "draft_source_missing",
      MailExitCode.NOT_FOUND,
    );
  }

  const parsed = await parseMessageHeaders(Buffer.from(draft.raw, "utf8"));
  const to = parsed.to.length ? parsed.to : draft.to;
  if (!to.length) {
    throw new CliError(
      `Draft ${draft.ref} has no recipients. Add --to when saving or edit the draft.`,
      "draft_missing_recipients",
      MailExitCode.USER,
    );
  }

  const deliver = await deliverSend(
    {
      from: options.from,
      to,
      cc: parsed.cc.length ? parsed.cc : draft.cc,
      subject: parsed.subject ?? draft.subject ?? "(no subject)",
      body: parsed.text ?? draft.text ?? undefined,
      html: parsed.html ?? draft.html ?? undefined,
    },
    { dryRun, transport: options.transport },
  );

  let deleted = false;
  if (!dryRun) {
    const lock = await selectMailbox(client, ref.mailbox);
    try {
      await client.messageDelete([ref.uid], { uid: true });
      deleted = true;
    } catch (error) {
      throw cliErrorFromUnknown(error, "draft_delete_after_send_failed");
    } finally {
      lock.release();
    }
  }

  return {
    dryRun,
    ref: draft.ref,
    deliver,
    deleted,
  };
}

async function assertDraftRef(ref: MessageRef, draftsMailbox: string): Promise<void> {
  if (ref.mailbox !== draftsMailbox) {
    throw new CliError(
      `Message is not in the Drafts mailbox: ${formatMessageRef(ref.mailbox, ref.uid)}`,
      "not_a_draft",
      MailExitCode.USER,
    );
  }
}

function toSendInput(input: DraftSaveInput): SendInput {
  return {
    from: input.from,
    to: input.to ?? [],
    cc: input.cc,
    subject: input.subject?.trim() || "(no subject)",
    body: input.body,
    html: input.html,
  };
}
