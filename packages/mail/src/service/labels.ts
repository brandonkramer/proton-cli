import {
  DEFAULT_LABEL_COLOR,
  LABEL_TYPE_FOLDER,
  LABEL_TYPE_LABEL,
} from "../proton/constants.ts";
import {
  createLabel,
  deleteLabel,
  listLabels,
  updateLabel,
  type LabelSummary,
} from "../proton/client.ts";
import type { Session } from "../proton/types.ts";

export interface LabelsServiceOptions {
  session: Session;
  fetchImpl?: typeof fetch;
}

export type { LabelSummary };

export async function listUserLabels(
  options: LabelsServiceOptions,
): Promise<LabelSummary[]> {
  return listLabels({
    session: options.session,
    fetchImpl: options.fetchImpl,
    types: [LABEL_TYPE_LABEL],
  });
}

export async function listFolders(
  options: LabelsServiceOptions,
): Promise<LabelSummary[]> {
  return listLabels({
    session: options.session,
    fetchImpl: options.fetchImpl,
    types: [LABEL_TYPE_FOLDER],
  });
}

export async function createUserLabel(
  options: LabelsServiceOptions & { name: string; color?: string; parentId?: string },
): Promise<LabelSummary> {
  return createLabel({
    session: options.session,
    fetchImpl: options.fetchImpl,
    request: {
      Name: options.name,
      Color: options.color ?? DEFAULT_LABEL_COLOR,
      Type: LABEL_TYPE_LABEL,
      ...(options.parentId ? { ParentID: options.parentId } : {}),
    },
  });
}

export async function createFolder(
  options: LabelsServiceOptions & { name: string; color?: string; parentId?: string },
): Promise<LabelSummary> {
  return createLabel({
    session: options.session,
    fetchImpl: options.fetchImpl,
    request: {
      Name: options.name,
      Color: options.color ?? DEFAULT_LABEL_COLOR,
      Type: LABEL_TYPE_FOLDER,
      ...(options.parentId ? { ParentID: options.parentId } : {}),
    },
  });
}

export async function updateUserLabel(
  options: LabelsServiceOptions & {
    labelId: string;
    name?: string;
    color?: string;
    parentId?: string;
  },
): Promise<LabelSummary> {
  return updateLabel({
    session: options.session,
    fetchImpl: options.fetchImpl,
    labelId: options.labelId,
    request: {
      ...(options.name !== undefined ? { Name: options.name } : {}),
      ...(options.color !== undefined ? { Color: options.color } : {}),
      ...(options.parentId !== undefined ? { ParentID: options.parentId } : {}),
    },
  });
}

export async function deleteUserLabel(
  options: LabelsServiceOptions & { labelId: string },
): Promise<void> {
  await deleteLabel({
    session: options.session,
    fetchImpl: options.fetchImpl,
    labelId: options.labelId,
  });
}
