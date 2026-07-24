import type { Command } from "commander";
import { requireContactsRuntime } from "../context.ts";
import {
  DEFAULT_GROUP_COLOR,
  validateAccentColor,
} from "../util/colors.ts";
import { emitOk, isDryRun } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";

export function registerGroups(contacts: Command): void {
  const groups = contacts.command("groups").description("Contact groups");

  groups
    .command("list")
    .description("List contact groups")
    .action(async () => {
      try {
        const runtime = await requireContactsRuntime();
        const items = await runtime.client.listGroups();
        emitOk({ action: "groups-list", groups: items, total: items.length });
      } catch (error) {
        reportCommandError(error);
      }
    });

  groups
    .command("create")
    .description("Create a contact group")
    .requiredOption("--name <name>", "Group name")
    .option("--color <hex>", "Proton accent color", DEFAULT_GROUP_COLOR)
    .option("--dry-run", "Show payload without calling the API")
    .action(async (options: { name: string; color: string }) => {
      try {
        const colorError = validateAccentColor(options.color);
        if (colorError) throw new Error(colorError);
        if (isDryRun()) {
          emitOk({
            dryRun: true,
            action: "groups-create",
            name: options.name,
            color: options.color,
          });
          return;
        }
        const runtime = await requireContactsRuntime();
        const id = await runtime.client.createGroup(options.name, options.color);
        emitOk({
          action: "groups-create",
          id,
          name: options.name,
          color: options.color,
          message: `Created group "${options.name}"`,
        });
      } catch (error) {
        reportCommandError(error);
      }
    });

  groups
    .command("delete")
    .description("Delete a contact group")
    .argument("<group-id>", "Group ID")
    .option("--dry-run", "Show target without calling the API")
    .action(async (groupId: string) => {
      try {
        if (isDryRun()) {
          emitOk({ dryRun: true, action: "groups-delete", id: groupId });
          return;
        }
        const runtime = await requireContactsRuntime();
        await runtime.client.deleteGroup(groupId);
        emitOk({ action: "groups-delete", id: groupId, deleted: true });
      } catch (error) {
        reportCommandError(error);
      }
    });

  groups
    .command("add")
    .description("Add contacts to a group")
    .argument("<group-id>", "Group ID")
    .argument("<refs...>", "Contact REF(s)")
    .option("--dry-run", "Show targets without calling the API")
    .action(async (groupId: string, refs: string[]) => {
      try {
        const runtime = await requireContactsRuntime();
        const ids: string[] = [];
        for (const ref of refs) {
          ids.push(await runtime.client.resolveRef(ref));
        }
        if (isDryRun()) {
          emitOk({
            dryRun: true,
            action: "groups-add",
            groupId,
            contactIds: ids,
            refs,
          });
          return;
        }
        await runtime.client.addGroupMembers(groupId, ids);
        emitOk({
          action: "groups-add",
          groupId,
          contactIds: ids,
          count: ids.length,
          message: `Added ${ids.length} contact(s) to group`,
        });
      } catch (error) {
        reportCommandError(error);
      }
    });

  groups
    .command("remove")
    .description("Remove contacts from a group")
    .argument("<group-id>", "Group ID")
    .argument("<refs...>", "Contact REF(s)")
    .option("--dry-run", "Show targets without calling the API")
    .action(async (groupId: string, refs: string[]) => {
      try {
        const runtime = await requireContactsRuntime();
        const ids: string[] = [];
        for (const ref of refs) {
          ids.push(await runtime.client.resolveRef(ref));
        }
        if (isDryRun()) {
          emitOk({
            dryRun: true,
            action: "groups-remove",
            groupId,
            contactIds: ids,
            refs,
          });
          return;
        }
        await runtime.client.removeGroupMembers(groupId, ids);
        emitOk({
          action: "groups-remove",
          groupId,
          contactIds: ids,
          count: ids.length,
          message: `Removed ${ids.length} contact(s) from group`,
        });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
