import { basename } from "node:path";
import { stat } from "node:fs/promises";
import { configDir } from "../config/paths.ts";
import { DriveService } from "../drive/service.ts";
import { loadSession, signOut } from "../proton/auth.ts";
import { showItemList, showTrashList } from "../ui/list-view.tsx";
import { showMessage } from "../ui/message.tsx";
import { inkPromptOptionalText, inkPromptText } from "../ui/prompts.tsx";
import { showStatus } from "../ui/status-view.tsx";
import { runTask } from "../ui/task.tsx";
import { normalizeDrivePath } from "../util/paths.ts";
import { resolveAccountPassword } from "../util/password.ts";

export async function actionSignout(): Promise<void> {
  await signOut();
  await showMessage({
    variant: "success",
    title: "Signed out",
    body: "Drive session cleared.",
    holdMs: 700,
  });
}

export async function actionListItems(): Promise<void> {
  const items = await runTask({
    title: "List items",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "fetch", label: "Fetching root folder" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const service = new DriveService();
      const password = await resolveAccountPassword({});
      const { client, context } = await service.open({ password });
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const children = await service.list(client, context, "/");
      ui.updateStep("fetch", {
        status: "done",
        detail: `${children.length}`,
      });
      return children;
    },
  });

  await showItemList("/", items);
}

export async function actionListTrash(): Promise<void> {
  const trash = await runTask({
    title: "List trash",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "fetch", label: "Fetching trash" },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const service = new DriveService();
      const password = await resolveAccountPassword({});
      const { client, context } = await service.open({ password });
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("fetch", { status: "running" });
      const entries = await service.listTrash(client, context);
      const items = Array.isArray(entries) ? entries : [];
      ui.updateStep("fetch", {
        status: "done",
        detail: `${items.length}`,
      });
      return items;
    },
  });

  await showTrashList(trash);
}

export async function actionUpload(): Promise<void> {
  let src: string;
  let dest: string;
  try {
    src = await inkPromptText("Local file", {
      placeholder: "/path/to/file.pdf",
      hint: "Absolute or relative path to a local file",
    });
    dest = await inkPromptOptionalText("Destination folder", {
      defaultValue: "/",
      placeholder: "/",
      hint: "Drive folder path (default /)",
    });
  } catch {
    await showMessage({
      variant: "info",
      title: "Cancelled",
      body: "Upload cancelled.",
      holdMs: 700,
    });
    return;
  }

  const destFolder = normalizeDrivePath(dest || "/");
  const info = await stat(src);
  if (info.isDirectory()) {
    await showMessage({
      variant: "error",
      title: "Upload failed",
      body: `${src} is a directory (recursive upload not supported here).`,
      holdMs: 1500,
    });
    return;
  }

  const fileName = basename(src);
  const bytes = new Uint8Array(await Bun.file(src).arrayBuffer());
  const password = await resolveAccountPassword({});

  const result = await runTask({
    title: "Upload file",
    steps: [
      { id: "unlock", label: "Unlocking keys" },
      { id: "upload", label: `Uploading ${fileName}` },
    ],
    run: async (ui) => {
      ui.updateStep("unlock", { status: "running" });
      const service = new DriveService();
      const { client, context } = await service.open({ password });
      ui.updateStep("unlock", { status: "done" });
      ui.updateStep("upload", { status: "running" });
      const uploaded = await service.upload(
        client,
        context,
        destFolder,
        fileName,
        bytes,
        { sizeHint: bytes.length },
      );
      if (!uploaded || "action" in uploaded) {
        throw new Error("Upload did not complete.");
      }
      ui.updateStep("upload", { status: "done", detail: uploaded.linkId });
      return uploaded;
    },
  });

  await showMessage({
    variant: "success",
    title: "Uploaded",
    body: `${fileName} → ${destFolder} (${result.linkId})`,
    holdMs: 1200,
  });
}

export async function actionStatus(): Promise<void> {
  const session = await loadSession();
  let itemCount: number | null = null;
  let trashCount: number | null = null;

  if (session) {
    try {
      const service = new DriveService();
      const password = await resolveAccountPassword({});
      const { client, context } = await service.open({ password });
      try {
        const items = await service.list(client, context, "/");
        itemCount = items.length;
      } catch {
        // Status screen still useful when list fails.
      }
      try {
        const trash = await service.listTrash(client, context);
        trashCount = Array.isArray(trash) ? trash.length : 0;
      } catch {
        // Status screen still useful when trash fetch fails.
      }
    } catch {
      // Status screen still useful when unlock fails.
    }
  }

  await showStatus({
    signedIn: Boolean(session),
    username: session?.username,
    itemCount,
    trashCount,
    configDir: configDir(),
  });
}
