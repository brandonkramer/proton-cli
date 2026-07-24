export {
  connectImap,
  connectImapFromStore,
  imapFlowOptions,
  resolveImapCredentials,
  selectMailbox,
  withImapSession,
  type ImapConnectOptions,
} from "./client.ts";
export {
  findSpecialMailbox,
  listMailFolders,
  resolveSpecialMailbox,
  type FolderSummary,
  type SpecialMailboxPurpose,
} from "./folders.ts";
export {
  deleteDraftMessage,
  listDraftMessages,
  readDraftMessage,
  resolveDraftsMailbox,
  saveDraftMessage,
  sendDraftMessage,
  type DeleteDraftResult,
  type DraftMutationOptions,
  type DraftSaveInput,
  type SaveDraftOptions,
  type SaveDraftResult,
  type SendDraftResult,
} from "./drafts.ts";
export {
  organizeMessage,
  organizeMessages,
  type OrganizeAction,
  type OrganizeBatchResult,
  type OrganizeItemResult,
  type OrganizeOptions,
} from "./organize.ts";
