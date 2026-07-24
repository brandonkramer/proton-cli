import { configDir } from "../config/paths.ts";
import { requireMailRuntime } from "../context.ts";
import { loadSession, signOut } from "../proton/auth.ts";
import {
  getAndDecryptMessage,
  listMessagesForCommand,
  searchMessages,
} from "../service/messages.ts";
import {
  pickMessage,
  showMessageDetail,
  showMessageList,
} from "../ui/list-view.tsx";
import { showMessage } from "../ui/message.tsx";
import { inkPromptText } from "../ui/prompts.tsx";
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

export async function actionRead(messageId: string): Promise<void> {
  const message = await runTask({
    title: "Read message",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "fetch", label: "Decrypting message" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const runtime = await requireMailRuntime({ unlockKeys: true });
      const password = await resolveAccountPassword({});
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const decrypted = await getAndDecryptMessage({
        session: runtime.session,
        messageId,
        password,
        addressKeys: runtime.addressKeys,
      });
      ui.updateStep("fetch", { status: "done" });
      return decrypted;
    },
  });

  await showMessageDetail(message);
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
