import { ContactsClient } from "@bkramer/proton-contacts";
import type { ComposeAction } from "../crypto/mime.ts";
import { configDir } from "../config/paths.ts";
import { requireMailRuntime } from "../context.ts";
import { loadSession, signOut } from "../proton/auth.ts";
import {
  getAndDecryptMessage,
  listMessagesForCommand,
  searchMessages,
  type DecryptedMessage,
} from "../service/messages.ts";
import {
  sendMail,
  type ComposeInput,
  type SendResult,
} from "../service/send.ts";
import {
  pickMessage,
  showMessageDetail,
  showMessageList,
} from "../ui/list-view.tsx";
import { showMessage } from "../ui/message.tsx";
import {
  inkPromptOptionalText,
  inkPromptSelect,
  inkPromptText,
} from "../ui/prompts.tsx";
import { showStatus } from "../ui/status-view.tsx";
import { runTask } from "../ui/task.tsx";
import { resolveAccountPassword } from "../util/password.ts";

export async function actionSignout(): Promise<void> {
  await signOut();
  await showMessage({
    variant: "success",
    title: "Signed out",
    body: "Mail session cleared.",
    holdMs: 700,
  });
}

export async function actionListInbox(): Promise<void> {
  const result = await runTask({
    title: "Inbox",
    steps: [
      { id: "session", label: "Loading session" },
      { id: "fetch", label: "Fetching messages" },
    ],
    run: async (ui) => {
      ui.updateStep("session", { status: "running" });
      const runtime = await requireMailRuntime();
      ui.updateStep("session", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const page = await listMessagesForCommand({
        session: runtime.session,
        labelId: "inbox",
      });
      ui.updateStep("fetch", {
        status: "done",
        detail: `${page.messages.length}/${page.total}`,
      });
      return page;
    },
  });

  const picked = await pickMessage("Inbox", result.messages);
  if (picked) {
    await actionRead(picked);
  }
}

export async function actionSearch(): Promise<void> {
  const query = await inkPromptText("Search mail", {
    placeholder: "keyword",
    hint: "Server-side keyword search",
  });

  const result = await runTask({
    title: "Search",
    steps: [
      { id: "session", label: "Loading session" },
      { id: "fetch", label: "Searching" },
    ],
    note: query,
    run: async (ui) => {
      ui.updateStep("session", { status: "running" });
      const runtime = await requireMailRuntime();
      ui.updateStep("session", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const page = await searchMessages({
        session: runtime.session,
        query,
      });
      ui.updateStep("fetch", {
        status: "done",
        detail: `${page.messages.length}/${page.total}`,
      });
      return page;
    },
  });

  if (result.messages.length === 0) {
    await showMessageList(`Search: ${query}`, result.messages);
    return;
  }

  const picked = await pickMessage(`Search: ${query}`, result.messages);
  if (picked) {
    await actionRead(picked);
  }
}

async function pickRecipientFromContacts(
  ensurePassword: () => Promise<string>,
): Promise<string | null> {
  const password = await ensurePassword();
  const contacts = await runTask({
    title: "Contacts",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "list", label: "Loading contacts" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const runtime = await requireMailRuntime({ unlockKeys: true, password });
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("list", { status: "running" });
      if (!runtime.userKey) {
        throw new Error("Could not unlock user key for contacts.");
      }
      const client = new ContactsClient({
        // Mail + Contacts share mail-api; session shapes match.
        session: runtime.session as never,
        userKey: runtime.userKey,
      });
      const list = await client.listAll();
      ui.updateStep("list", {
        status: "done",
        detail: `${list.length}`,
      });
      return list;
    },
  });

  const options: Array<{ label: string; value: string }> = [];
  for (const contact of contacts) {
    const emails = contact.emails.length
      ? contact.emails
      : contact.email
        ? [contact.email]
        : [];
    for (const email of emails) {
      const name = contact.name?.trim();
      options.push({
        label: name ? `${name} <${email}>` : email,
        value: email,
      });
    }
  }

  if (options.length === 0) {
    await showMessage({
      variant: "warning",
      title: "No contacts",
      body: "No contacts with email addresses. Type an address instead.",
      holdMs: 1200,
    });
    return null;
  }

  options.push({ label: "Type email instead", value: "__type__" });
  const picked = await inkPromptSelect(
    "Pick recipient",
    options,
    "Esc/q cancel",
  );
  if (!picked || picked === "__type__") return null;
  return picked;
}

async function promptComposeFields(options: {
  action: ComposeAction;
  message?: DecryptedMessage;
  ensurePassword: () => Promise<string>;
}): Promise<ComposeInput | null> {
  const { action, message, ensurePassword } = options;

  let to: string[] | undefined;
  let subject: string | undefined;

  if (action === "send" || action === "forward") {
    const mode = await inkPromptSelect(
      "To",
      [
        { label: "Type email", value: "type" },
        { label: "Pick from contacts", value: "contacts" },
      ],
      "Esc/q cancel",
    );
    if (!mode) return null;

    if (mode === "contacts") {
      const fromContacts = await pickRecipientFromContacts(ensurePassword);
      if (fromContacts) {
        to = [fromContacts];
      }
    }

    if (!to) {
      const toRaw = await inkPromptText("To", {
        placeholder: "you@example.com",
        hint: "Comma-separated addresses OK",
      });
      to = [toRaw];
    }
  }

  if (action === "send") {
    subject = await inkPromptText("Subject", {
      placeholder: "Subject",
    });
  } else if (message) {
    const defaultSubject =
      action === "forward"
        ? message.subject.startsWith("Fwd:")
          ? message.subject
          : `Fwd: ${message.subject}`
        : message.subject.startsWith("Re:")
          ? message.subject
          : `Re: ${message.subject}`;
    const subjectRaw = await inkPromptOptionalText("Subject", {
      defaultValue: defaultSubject,
      hint: "Leave as-is or edit · Enter accepts",
    });
    subject = subjectRaw || defaultSubject;
  }

  const ccRaw = await inkPromptOptionalText("Cc", {
    placeholder: "(optional)",
  });
  const body = await inkPromptOptionalText("Body", {
    placeholder: "Message text (single line)",
    hint:
      action === "reply" || action === "reply-all" || action === "forward"
        ? "Your note — quoted original is appended automatically"
        : "Plain text body",
  });

  const attachRaw = await inkPromptOptionalText("Attachments", {
    placeholder: "/path/to/file.pdf",
    hint: "Optional · comma-separated local file paths",
  });
  const attach = attachRaw
    ? attachRaw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : undefined;

  const summaryParts = [
    `Action: ${action}`,
    to ? `To: ${to.join(", ")}` : message ? `To: (from original)` : null,
    ccRaw ? `Cc: ${ccRaw}` : null,
    subject ? `Subject: ${subject}` : null,
    `Body: ${body ? `${body.slice(0, 60)}${body.length > 60 ? "…" : ""}` : "(empty)"}`,
    attach?.length ? `Attach: ${attach.length} file(s)` : null,
  ].filter(Boolean);

  const confirm = await inkPromptSelect(
    "Send message?",
    [
      { label: "Send", value: "send" },
      { label: "Cancel", value: "cancel" },
    ],
    summaryParts.join(" · "),
  );
  if (confirm !== "send") return null;

  return {
    action,
    to,
    cc: ccRaw ? [ccRaw] : undefined,
    subject,
    body,
    messageId: message?.id,
    attach,
  };
}

async function runSendFlow(
  input: ComposeInput,
  password?: string,
): Promise<void> {
  const resolvedPassword = password ?? (await resolveAccountPassword({}));
  const result = await runTask({
    title:
      input.action === "send"
        ? "Send message"
        : input.action === "forward"
          ? "Forward message"
          : "Reply",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "send", label: "Encrypting and sending" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const runtime = await requireMailRuntime({
        unlockKeys: true,
        password: resolvedPassword,
      });
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("send", { status: "running" });
      const sent = await sendMail(input, {
        session: runtime.session,
        password: resolvedPassword,
        username: runtime.username,
        addressKeys: runtime.addressKeys,
        addresses: runtime.addresses,
      });
      ui.updateStep("send", { status: "done" });
      return sent;
    },
  });

  if ("dryRun" in result && result.dryRun) {
    await showMessage({
      variant: "info",
      title: "Dry run",
      body: `Would ${result.action} to ${result.to.join(", ") || "(none)"}`,
      holdMs: 1200,
    });
    return;
  }

  const sent = result as SendResult;
  await showMessage({
    variant: "success",
    title: "Sent",
    body: `${sent.subject} → ${sent.to.join(", ") || "(recipients)"}`,
    holdMs: 1200,
  });
}

export async function actionCompose(): Promise<void> {
  let password: string | undefined;
  const input = await promptComposeFields({
    action: "send",
    ensurePassword: async () => {
      if (!password) password = await resolveAccountPassword({});
      return password;
    },
  });
  if (!input) {
    await showMessage({
      variant: "info",
      title: "Cancelled",
      body: "Message not sent.",
      holdMs: 700,
    });
    return;
  }
  await runSendFlow(input, password);
}

export async function actionRead(messageId: string): Promise<void> {
  // Prompt outside the task spinner so Ink UIs do not stack.
  let password = await resolveAccountPassword({});

  const message = await runTask({
    title: "Read message",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "fetch", label: "Decrypting message" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const runtime = await requireMailRuntime({ unlockKeys: true, password });
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const decrypted = await getAndDecryptMessage({
        session: runtime.session,
        messageId,
        password,
        username: runtime.username,
        addressKeys: runtime.addressKeys,
      });
      ui.updateStep("fetch", { status: "done" });
      return decrypted;
    },
  });

  const next = await showMessageDetail(message);
  if (next === "close") return;

  const input = await promptComposeFields({
    action: next,
    message,
    ensurePassword: async () => {
      if (!password) password = await resolveAccountPassword({});
      return password;
    },
  });
  if (!input) {
    await showMessage({
      variant: "info",
      title: "Cancelled",
      body: "Message not sent.",
      holdMs: 700,
    });
    return;
  }
  await runSendFlow(input, password);
}

export async function actionStatus(): Promise<void> {
  const session = await loadSession();
  let inboxCount: number | null = null;
  let inboxTotal: number | null = null;

  if (session) {
    try {
      const runtime = await requireMailRuntime();
      const page = await listMessagesForCommand({
        session: runtime.session,
        labelId: "inbox",
        pageSize: 1,
      });
      inboxTotal = page.total;
      inboxCount = page.total;
    } catch {
      // Status screen still useful when fetch fails.
    }
  }

  await showStatus({
    signedIn: Boolean(session),
    username: session?.username,
    inboxCount,
    inboxTotal,
    configDir: configDir(),
  });
}
