import type { Command } from "commander";
import { requireMailRuntime } from "../context.ts";
import {
  createFolder,
  createUserLabel,
  deleteUserLabel,
  listFolders,
  listUserLabels,
  updateUserLabel,
  type LabelSummary,
} from "../service/labels.ts";
import { DEFAULT_LABEL_COLOR } from "../proton/constants.ts";
import { emitOk, isDryRun, wantsJson } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";
import { assertWriteAllowed, assertYesConfirmed } from "../util/safety.ts";

function printLabels(title: string, labels: LabelSummary[]): void {
  if (labels.length === 0) {
    process.stdout.write(`No ${title}.\n`);
    return;
  }
  for (const label of labels) {
    process.stdout.write(`${label.id}\t${label.name}\t${label.color}\n`);
  }
}

export async function runLabelsList(options: { passRef?: string }): Promise<void> {
  if (isDryRun()) {
    emitOk({ dryRun: true, action: "labels-list" });
    return;
  }
  const runtime = await requireMailRuntime({ passRef: options.passRef });
  const labels = await listUserLabels({ session: runtime.session });
  if (wantsJson()) {
    emitOk({ action: "labels-list", labels, total: labels.length });
    return;
  }
  printLabels("labels", labels);
}

export async function runFoldersList(options: { passRef?: string }): Promise<void> {
  if (isDryRun()) {
    emitOk({ dryRun: true, action: "folders-list" });
    return;
  }
  const runtime = await requireMailRuntime({ passRef: options.passRef });
  const folders = await listFolders({ session: runtime.session });
  if (wantsJson()) {
    emitOk({ action: "folders-list", folders, total: folders.length });
    return;
  }
  printLabels("folders", folders);
}

export function registerLabels(mail: Command): void {
  const labels = mail.command("labels").description("User labels and folders");

  labels
    .command("list")
    .description("List user labels (Type=1)")
    .option("--dry-run", "Print planned action without calling the API")
    .action(async function (this: Command) {
      try {
        const globals = this.parent?.parent?.optsWithGlobals() as { pass?: string } | undefined;
        await runLabelsList({ passRef: globals?.pass });
      } catch (error) {
        reportCommandError(error);
      }
    });

  labels
    .command("create")
    .description("Create a user label")
    .requiredOption("--name <name>", "Label name")
    .option("--color <hex>", "Proton accent color", DEFAULT_LABEL_COLOR)
    .option("--parent <id>", "Parent label/folder ID")
    .option("--dry-run", "Show payload without calling the API")
    .action(async function (
      this: Command,
      options: { name: string; color: string; parent?: string },
    ) {
      try {
        const globals = this.parent?.parent?.optsWithGlobals() as { pass?: string } | undefined;
        if (isDryRun()) {
          emitOk({
            dryRun: true,
            action: "labels-create",
            name: options.name,
            color: options.color,
            parentId: options.parent,
          });
          return;
        }
        assertWriteAllowed();
        const runtime = await requireMailRuntime({ passRef: globals?.pass });
        const label = await createUserLabel({
          session: runtime.session,
          name: options.name,
          color: options.color,
          parentId: options.parent,
        });
        emitOk({
          action: "labels-create",
          label,
          ...(wantsJson() ? {} : { message: `Created label "${label.name}"` }),
        });
      } catch (error) {
        reportCommandError(error);
      }
    });

  labels
    .command("update")
    .description("Update a user label")
    .argument("<label-id>", "Label ID")
    .option("--name <name>", "New name")
    .option("--color <hex>", "New accent color")
    .option("--parent <id>", "New parent label/folder ID")
    .option("--dry-run", "Show payload without calling the API")
    .action(async function (
      this: Command,
      labelId: string,
      options: { name?: string; color?: string; parent?: string },
    ) {
      try {
        const globals = this.parent?.parent?.optsWithGlobals() as { pass?: string } | undefined;
        if (isDryRun()) {
          emitOk({
            dryRun: true,
            action: "labels-update",
            labelId,
            name: options.name,
            color: options.color,
            parentId: options.parent,
          });
          return;
        }
        assertWriteAllowed();
        const runtime = await requireMailRuntime({ passRef: globals?.pass });
        const label = await updateUserLabel({
          session: runtime.session,
          labelId,
          name: options.name,
          color: options.color,
          parentId: options.parent,
        });
        emitOk({
          action: "labels-update",
          label,
          ...(wantsJson() ? {} : { message: `Updated label "${label.name}"` }),
        });
      } catch (error) {
        reportCommandError(error);
      }
    });

  labels
    .command("delete")
    .description("Delete a user label (requires -y/--yes)")
    .argument("<label-id>", "Label ID")
    .option("--dry-run", "Show target without calling the API")
    .action(async function (this: Command, labelId: string) {
      try {
        const globals = this.parent?.parent?.optsWithGlobals() as { pass?: string } | undefined;
        if (isDryRun()) {
          emitOk({ dryRun: true, action: "labels-delete", labelId });
          return;
        }
        assertWriteAllowed();
        assertYesConfirmed("Delete label");
        const runtime = await requireMailRuntime({ passRef: globals?.pass });
        await deleteUserLabel({ session: runtime.session, labelId });
        emitOk({
          action: "labels-delete",
          labelId,
          deleted: true,
          ...(wantsJson() ? {} : { message: `Deleted label ${labelId}` }),
        });
      } catch (error) {
        reportCommandError(error);
      }
    });

  const folders = labels.command("folders").description("Mail folders (Type=3)");

  folders
    .command("list")
    .description("List mail folders")
    .option("--dry-run", "Print planned action without calling the API")
    .action(async function (this: Command) {
      try {
        const globals = this.parent?.parent?.parent?.optsWithGlobals() as
          | { pass?: string }
          | undefined;
        await runFoldersList({ passRef: globals?.pass });
      } catch (error) {
        reportCommandError(error);
      }
    });

  folders
    .command("create")
    .description("Create a mail folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--color <hex>", "Proton accent color", DEFAULT_LABEL_COLOR)
    .option("--parent <id>", "Parent folder ID")
    .option("--dry-run", "Show payload without calling the API")
    .action(async function (
      this: Command,
      options: { name: string; color: string; parent?: string },
    ) {
      try {
        const globals = this.parent?.parent?.parent?.optsWithGlobals() as
          | { pass?: string }
          | undefined;
        if (isDryRun()) {
          emitOk({
            dryRun: true,
            action: "folders-create",
            name: options.name,
            color: options.color,
            parentId: options.parent,
          });
          return;
        }
        assertWriteAllowed();
        const runtime = await requireMailRuntime({ passRef: globals?.pass });
        const folder = await createFolder({
          session: runtime.session,
          name: options.name,
          color: options.color,
          parentId: options.parent,
        });
        emitOk({
          action: "folders-create",
          folder,
          ...(wantsJson() ? {} : { message: `Created folder "${folder.name}"` }),
        });
      } catch (error) {
        reportCommandError(error);
      }
    });

  folders
    .command("update")
    .description("Update a mail folder")
    .argument("<folder-id>", "Folder ID")
    .option("--name <name>", "New name")
    .option("--color <hex>", "New accent color")
    .option("--parent <id>", "New parent folder ID")
    .option("--dry-run", "Show payload without calling the API")
    .action(async function (
      this: Command,
      folderId: string,
      options: { name?: string; color?: string; parent?: string },
    ) {
      try {
        const globals = this.parent?.parent?.parent?.optsWithGlobals() as
          | { pass?: string }
          | undefined;
        if (isDryRun()) {
          emitOk({
            dryRun: true,
            action: "folders-update",
            folderId,
            name: options.name,
            color: options.color,
            parentId: options.parent,
          });
          return;
        }
        assertWriteAllowed();
        const runtime = await requireMailRuntime({ passRef: globals?.pass });
        const folder = await updateUserLabel({
          session: runtime.session,
          labelId: folderId,
          name: options.name,
          color: options.color,
          parentId: options.parent,
        });
        emitOk({
          action: "folders-update",
          folder,
          ...(wantsJson() ? {} : { message: `Updated folder "${folder.name}"` }),
        });
      } catch (error) {
        reportCommandError(error);
      }
    });

  folders
    .command("delete")
    .description("Delete a mail folder (requires -y/--yes)")
    .argument("<folder-id>", "Folder ID")
    .option("--dry-run", "Show target without calling the API")
    .action(async function (this: Command, folderId: string) {
      try {
        const globals = this.parent?.parent?.parent?.optsWithGlobals() as
          | { pass?: string }
          | undefined;
        if (isDryRun()) {
          emitOk({ dryRun: true, action: "folders-delete", folderId });
          return;
        }
        assertWriteAllowed();
        assertYesConfirmed("Delete folder");
        const runtime = await requireMailRuntime({ passRef: globals?.pass });
        await deleteUserLabel({ session: runtime.session, labelId: folderId });
        emitOk({
          action: "folders-delete",
          folderId,
          deleted: true,
          ...(wantsJson() ? {} : { message: `Deleted folder ${folderId}` }),
        });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
