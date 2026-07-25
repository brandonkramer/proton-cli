import { configDir } from "../config/paths.ts";
import { requireContactsRuntime } from "../context.ts";
import { loadSession } from "../proton/auth.ts";
import { signOut } from "../proton/auth.ts";
import { showContactList, showGroupList } from "../ui/list-view.tsx";
import { showMessage } from "../ui/message.tsx";
import { inkPromptOptionalText, inkPromptText } from "../ui/prompts.tsx";
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

export async function actionCreate(): Promise<void> {
  let name: string;
  let email: string;
  let phone: string;
  try {
    name = await inkPromptText("Name", {
      placeholder: "Ada Lovelace",
      hint: "Display name for the contact",
    });
    email = await inkPromptText("Email", {
      placeholder: "ada@example.com",
    });
    phone = await inkPromptOptionalText("Phone", {
      placeholder: "+1 555 0100",
    });
  } catch {
    await showMessage({
      variant: "info",
      title: "Cancelled",
      body: "Contact not created.",
      holdMs: 700,
    });
    return;
  }

  const id = await runTask({
    title: "Add contact",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "create", label: "Creating contact" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const runtime = await requireContactsRuntime();
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("create", { status: "running" });
      const createdId = await runtime.client.create({
        name,
        emails: [email],
        phones: phone ? [phone] : [],
        title: "",
        org: "",
        note: "",
        birthday: "",
        address: "",
        url: "",
      });
      ui.updateStep("create", { status: "done", detail: createdId });
      return createdId;
    },
  });

  await showMessage({
    variant: "success",
    title: "Contact created",
    body: `${name} <${email}> (${id})`,
    holdMs: 1200,
  });
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
