import { loadLocalEntries } from "../config/store.ts";
import { signOut } from "../proton/auth.ts";
import type { EntryTypeFilter } from "../sync/filter.ts";
import { pickBestMatch } from "../sync/match.ts";
import {
  decryptLocalEntry,
  formatSyncSummary,
  syncEntries,
  unlockWithPassword,
} from "../sync/sync.ts";
import { showCodeView } from "../ui/code-view.tsx";
import { showEntryList } from "../ui/list-view.tsx";
import { showMessage } from "../ui/message.tsx";
import { inkPromptText } from "../ui/prompts.tsx";
import { showStatus } from "../ui/status-view.tsx";
import { runTask } from "../ui/task.tsx";
import { configDir } from "../config/paths.ts";
import { tryExistingSession } from "../proton/auth.ts";
import { CliError } from "../util/errors.ts";
import { resolveAccountPassword } from "../util/password.ts";
import { runInteractiveSignin } from "./signin-flow.ts";

export async function actionSignin(): Promise<void> {
  await runInteractiveSignin();
}

export async function actionSignout(): Promise<void> {
  await signOut();
  await showMessage({
    variant: "success",
    title: "Signed out",
    body: "Session and local entry cache cleared.",
    holdMs: 700,
  });
}

export async function actionSync(): Promise<void> {
  const password = await resolveAccountPassword({});
  await runTask({
    title: "Sync",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "pull", label: "Pulling remote entries" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("pull", { status: "running" });
      const result = await syncEntries(password);
      ui.updateStep("pull", {
        status: "done",
        detail: `${result.pulled}/${result.remoteTotal}`,
      });
      ui.setResult({
        variant:
          result.remoteTotal === 0 || result.skipped > 0 ? "warning" : "success",
        title: "Synced",
        body: formatSyncSummary(result),
      });
      return result;
    },
  });
}

export async function actionList(
  options: { type?: EntryTypeFilter } = {},
): Promise<void> {
  const local = await loadLocalEntries();
  await showEntryList(local.entries, { type: options.type ?? "all" });
}

export async function actionCode(queryArg?: string): Promise<void> {
  const local = await loadLocalEntries();
  if (local.entries.length === 0) {
    throw new CliError(
      'No local entries. Run "proton auth sync" first.',
      "no_entries",
    );
  }

  const { preferNonInteractive } = await import("../util/agent.ts");
  if (!queryArg?.trim() && preferNonInteractive()) {
    throw new CliError(
      "Query required in non-interactive mode.\n" +
        "Usage: proton auth code <issuer-or-name> --output json",
      "query_required",
    );
  }

  const query =
    queryArg?.trim() ||
    (await inkPromptText("Search issuer or name", {
      placeholder: "github",
    }));

  const match = pickBestMatch(local.entries, query);
  if (!match) {
    throw new CliError(`No entry matched "${query}".`);
  }

  const password = await resolveAccountPassword({
    promptHint: "Password unlocks the Authenticator Key to generate a code.",
  });

  const model = await runTask({
    title: "Code",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "decrypt", label: "Decrypting entry" },
    ],
    note: `${match.issuer} · ${match.name}`,
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const ctx = await unlockWithPassword(password);
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("decrypt", { status: "running" });
      const decrypted = await decryptLocalEntry(match, ctx.encryptionKeys);
      ui.updateStep("decrypt", { status: "done" });
      return decrypted;
    },
  });

  await showCodeView({
    model,
    label: `${match.issuer || "—"} · ${match.name || "(unnamed)"}`,
  });
}

export async function actionStatus(): Promise<void> {
  const session = await tryExistingSession();
  const local = await loadLocalEntries();
  await showStatus({
    signedIn: Boolean(session),
    username: session?.username,
    entryCount: local.entries.filter((e) => e.syncState !== "PendingToDelete")
      .length,
    lastSyncAt: local.lastSyncAt,
    authenticatorKeyId: local.authenticatorKeyId,
    configDir: configDir(),
  });
}
