import {
  createDraft,
  deleteMessages,
  getMessage,
  sendPackages,
} from "../proton/client.ts";
import type { MailRecipient, Session } from "../proton/types.ts";
import {
  assertEncryptedBody,
  encryptForSend,
  type EncryptSendResult,
} from "../crypto/send.ts";
import {
  draftActionFor,
  ensureForwardSubject,
  ensureReplySubject,
  formatForwardBody,
  formatReplyBody,
  parseAddressList,
  type ComposeAction,
} from "../crypto/mime.ts";
import { decryptMessageBody } from "../crypto/decrypt.ts";
import {
  primaryAddressKey,
  unlockMailKeys,
  type UnlockedAddressKey,
  type UnlockedMailKeys,
} from "../crypto/unlock.ts";
import { fetchSenderPublicKeys } from "../crypto/sender-keys.ts";
import { isDryRun } from "../util/agent.ts";
import { assertSendAllowed } from "../util/safety.ts";
import { CliError } from "../util/errors.ts";

export interface ComposeInput {
  action: ComposeAction;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  html?: boolean;
  /** Original message id for reply/forward. */
  messageId?: string;
  attach?: string[];
}

export interface SendServiceOptions {
  session: Session;
  password?: string;
  fetchImpl?: typeof fetch;
  addressKeys?: Map<string, UnlockedAddressKey>;
  addresses?: UnlockedMailKeys["addresses"];
  /** Injected encrypt (tests). */
  encrypt?: typeof encryptForSend;
  /** Injected key loader (tests). */
  loadRecipientKeys?: (email: string) => Promise<unknown[]>;
}

export interface SendPlan {
  dryRun: true;
  action: ComposeAction;
  subject: string;
  to: string[];
  cc: string[];
  bcc: string[];
  mimeType: string;
  bodyChars: number;
  parentId?: string;
  attach: string[];
  /** True when Body would be encrypted before any POST. */
  encryptBody: true;
}

export interface SendResult {
  dryRun?: false;
  action: ComposeAction;
  messageId: string;
  subject: string;
  to: string[];
  cc: string[];
  bcc: string[];
}

async function ensureKeys(
  options: SendServiceOptions,
): Promise<{
  addressKeys: Map<string, UnlockedAddressKey>;
  addresses: UnlockedMailKeys["addresses"];
}> {
  if (options.addressKeys && options.addressKeys.size > 0 && options.addresses) {
    return { addressKeys: options.addressKeys, addresses: options.addresses };
  }
  if (!options.password) {
    throw new CliError(
      "Account password required to encrypt and send. Pass --pass or PROTON_PASSWORD.",
    );
  }
  const unlocked = await unlockMailKeys(
    options.session,
    options.password,
    options.fetchImpl,
  );
  return {
    addressKeys: unlocked.addressKeys,
    addresses: unlocked.addresses,
  };
}

async function resolveCompose(
  input: ComposeInput,
  options: SendServiceOptions,
  unlocked: {
    addressKeys: Map<string, UnlockedAddressKey>;
    addresses: UnlockedMailKeys["addresses"];
  },
): Promise<{
  subject: string;
  body: string;
  to: MailRecipient[];
  cc: MailRecipient[];
  bcc: MailRecipient[];
  parentId?: string;
  draftAction?: number;
  mimeType: string;
}> {
  const mimeType = input.html ? "text/html" : "text/plain";
  let subject = input.subject ?? "";
  let body = input.body ?? "";
  let to = parseAddressList(input.to);
  let cc = parseAddressList(input.cc);
  let bcc = parseAddressList(input.bcc);
  let parentId: string | undefined;
  let draftAction = draftActionFor(input.action);

  if (input.action === "send") {
    if (to.length === 0) {
      throw new CliError("Send requires at least one --to recipient.");
    }
    if (!subject) {
      throw new CliError("Send requires --subject.");
    }
    return { subject, body, to, cc, bcc, mimeType };
  }

  if (!input.messageId) {
    throw new CliError(`${input.action} requires a message id.`);
  }

  const original = await getMessage({
    session: options.session,
    fetchImpl: options.fetchImpl,
    messageId: input.messageId,
  });
  parentId = original.ID;

  const decrypted = await decryptMessageBody({
    armoredBody: original.Body,
    addressKeys: unlocked.addressKeys,
    addressId: original.AddressID,
    senderEmail: original.Sender?.Address,
    session: options.session,
    fetchImpl: options.fetchImpl,
  });

  if (input.action === "reply" || input.action === "reply-all") {
    subject = ensureReplySubject(input.subject ?? original.Subject);
    const quoted = formatReplyBody(
      decrypted.plaintext,
      original.Sender,
      original.Time,
    );
    body = `${input.body ?? ""}${quoted}`;
    to =
      to.length > 0
        ? to
        : original.ReplyTos?.length
          ? original.ReplyTos
          : [original.Sender];
    if (input.action === "reply-all") {
      const selfEmails = new Set(
        unlocked.addresses.map((a) => a.Email.toLowerCase()),
      );
      const merge = (list: MailRecipient[]) => {
        for (const r of list) {
          const addr = r.Address.toLowerCase();
          if (selfEmails.has(addr)) continue;
          if (
            to.some((t) => t.Address.toLowerCase() === addr) ||
            cc.some((t) => t.Address.toLowerCase() === addr)
          ) {
            continue;
          }
          cc.push(r);
        }
      };
      merge(original.ToList ?? []);
      merge(original.CCList ?? []);
    }
  } else if (input.action === "forward") {
    subject = ensureForwardSubject(input.subject ?? original.Subject);
    const forwarded = formatForwardBody(decrypted.plaintext, {
      subject: original.Subject,
      sender: original.Sender,
      to: original.ToList ?? [],
      cc: original.CCList ?? [],
      time: original.Time,
    });
    body = `${input.body ?? ""}${forwarded}`;
    if (to.length === 0) {
      throw new CliError("Forward requires at least one --to recipient.");
    }
  }

  return { subject, body, to, cc, bcc, parentId, draftAction, mimeType };
}

async function loadRecipientPrefs(
  recipients: MailRecipient[],
  options: SendServiceOptions,
): Promise<{ email: string; publicKeys: unknown[] }[]> {
  const loader =
    options.loadRecipientKeys ??
    ((email: string) =>
      fetchSenderPublicKeys(email, {
        session: options.session,
        fetchImpl: options.fetchImpl,
      }));
  const prefs: { email: string; publicKeys: unknown[] }[] = [];
  for (const recipient of recipients) {
    const publicKeys = await loader(recipient.Address);
    prefs.push({ email: recipient.Address, publicKeys });
  }
  return prefs;
}

/**
 * Compose + encrypt + create draft + send packages.
 * `--dry-run` / isDryRun(): returns a plan and never POSTs.
 */
export async function sendMail(
  input: ComposeInput,
  options: SendServiceOptions,
): Promise<SendPlan | SendResult> {
  const attach = input.attach ?? [];

  if (isDryRun()) {
    const to = parseAddressList(input.to).map((r) => r.Address);
    const cc = parseAddressList(input.cc).map((r) => r.Address);
    const bcc = parseAddressList(input.bcc).map((r) => r.Address);
    const subject =
      input.subject ??
      (input.action === "forward"
        ? "Fwd: (original)"
        : input.action === "send"
          ? ""
          : "Re: (original)");
    const plan: SendPlan = {
      dryRun: true,
      action: input.action,
      subject,
      to,
      cc,
      bcc,
      mimeType: input.html ? "text/html" : "text/plain",
      bodyChars: (input.body ?? "").length,
      parentId: input.messageId,
      attach,
      encryptBody: true,
    };
    return plan;
  }

  assertSendAllowed();

  if (attach.length > 0) {
    throw new CliError(
      "Attachments are not yet supported on the live send path. Use --dry-run to preview.",
    );
  }

  const unlocked = await ensureKeys(options);
  const composed = await resolveCompose(input, options, unlocked);
  const senderKey = primaryAddressKey({
    addresses: unlocked.addresses,
    addressKeys: unlocked.addressKeys,
  });

  const allRecipients = [...composed.to, ...composed.cc, ...composed.bcc];
  const recipientPrefs = await loadRecipientPrefs(allRecipients, options);

  const encrypt = options.encrypt ?? encryptForSend;
  const encrypted: EncryptSendResult = await encrypt({
    plaintext: composed.body,
    mimeType: composed.mimeType,
    senderKey,
    recipients: recipientPrefs,
  });

  assertEncryptedBody(encrypted.draftBody);

  let draftId: string | undefined;
  try {
    const draft = await createDraft({
      session: options.session,
      fetchImpl: options.fetchImpl,
      draft: {
        Message: {
          AddressID: senderKey.addressId,
          Subject: composed.subject,
          Sender: { Name: "", Address: senderKey.email },
          ToList: composed.to,
          CCList: composed.cc,
          BCCList: composed.bcc,
          Body: encrypted.draftBody,
          MIMEType: encrypted.mimeType,
        },
        ParentID: composed.parentId,
        Action: composed.draftAction,
        AttachmentKeyPackets: {},
      },
    });
    draftId = draft.ID;

    await sendPackages({
      session: options.session,
      fetchImpl: options.fetchImpl,
      messageId: draft.ID,
      request: {
        Packages: encrypted.packages,
        AutoSaveContacts: 0,
        DelaySeconds: 0,
      },
    });

    return {
      action: input.action,
      messageId: draft.ID,
      subject: composed.subject,
      to: composed.to.map((r) => r.Address),
      cc: composed.cc.map((r) => r.Address),
      bcc: composed.bcc.map((r) => r.Address),
    };
  } catch (error) {
    if (draftId) {
      try {
        await deleteMessages({
          session: options.session,
          fetchImpl: options.fetchImpl,
          messageIds: [draftId],
        });
      } catch {
        // best-effort cleanup
      }
    }
    throw error;
  }
}
