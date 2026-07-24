import { configDir } from "../config/paths.ts";
import { requireContactsRuntime } from "../context.ts";
import { loadSession } from "../proton/auth.ts";
import { signOut } from "../proton/auth.ts";
import { showContactList, showGroupList } from "../ui/list-view.tsx";
import { showMessage } from "../ui/message.tsx";
import { showStatus } from "../ui/status-view.tsx";
import { runTask } from "../ui/task.tsx";

export async function actionSignout(): Promise<void> {
  await signOut();
  await showMessage({
    variant: "success",
    title: "Signed out",
    body: "Contacts session cleared.",
    holdMs: 700,
  });
}

export async function actionList(): Promise<void> {
  const contacts = await runTask({
    title: "List contacts",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "fetch", label: "Fetching contacts" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const runtime = await requireContactsRuntime();
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const items = await runtime.client.listAll();
      ui.updateStep("fetch", {
        status: "done",
        detail: `${items.length}`,
      });
      return items;
    },
  });

  await showContactList(contacts);
}

export async function actionGroups(): Promise<void> {
  const groups = await runTask({
    title: "List groups",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "fetch", label: "Fetching groups" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const runtime = await requireContactsRuntime();
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const items = await runtime.client.listGroups();
      ui.updateStep("fetch", {
        status: "done",
        detail: `${items.length}`,
      });
      return items;
    },
  });

  await showGroupList(groups);
}

export async function actionStatus(): Promise<void> {
  const session = await loadSession();
  let contactCount = 0;
  let groupCount = 0;

  if (session) {
    try {
      const runtime = await requireContactsRuntime();
      const [contacts, groups] = await Promise.all([
        runtime.client.listAll(),
        runtime.client.listGroups(),
      ]);
      contactCount = contacts.length;
      groupCount = groups.length;
    } catch {
      // Status screen still useful when unlock fails.
    }
  }

  await showStatus({
    signedIn: Boolean(session),
    username: session?.username,
    contactCount,
    groupCount,
    configDir: configDir(),
  });
}
