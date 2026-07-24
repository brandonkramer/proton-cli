export const LINK_TYPE_FOLDER = 1;
export const LINK_TYPE_FILE = 2;

export const DRIVE_BLOCK_SIZE = 4 * 1024 * 1024;

export interface DriveLink {
  LinkID: string;
  ParentLinkID: string;
  Type: number;
  Size: number;
  Name: string;
  MIMEType?: string;
  NodeKey: string;
  NodePassphrase: string;
  NodePassphraseSignature?: string;
  SignatureEmail?: string;
  CreateTime?: number;
  ModifyTime?: number;
  FolderProperties?: { NodeHashKey: string };
  AlbumProperties?: { NodeHashKey: string };
  FileProperties?: {
    ContentKeyPacket: string;
    ContentKeyPacketSignature?: string;
    ActiveRevision: { ID: string; ManifestSignature?: string; SignatureEmail?: string };
  };
  ShareIDs?: string[];
  ShareUrls?: { ShareURLID: string }[];
}

export interface TrashEntry {
  shareId: string;
  linkId: string;
  type: number;
  size: number;
}

export interface ShareLinkInfo {
  shareUrlId: string;
  shareId: string;
  url: string;
  canEdit: boolean;
  createTime: number;
  expireTime?: number | null;
  numAccesses: number;
  generatedPassword?: string;
  customPassword?: string;
}

export interface ShareMember {
  memberId: string;
  email: string;
  role: string;
  createTime: number;
}

export interface ShareInvitee {
  invitationId: string;
  email: string;
  role: string;
  createTime: number;
}

export interface ShareStatusInfo {
  path: string;
  type: string;
  publicLinks: ShareLinkInfo[];
  members: ShareMember[];
  pendingInvitations: ShareInvitee[];
}

export interface DriveInvitation {
  invitationId: string;
  inviterEmail: string;
  inviteeEmail: string;
  shareId: string;
  volumeId: string;
  role: string;
  createTime: number;
}

export interface DrivePhoto {
  linkId: string;
  captureTime: number;
  hash?: string;
  contentHash?: string;
  tags?: string[];
}

export interface DriveAlbum {
  linkId: string;
  name: string;
  photoCount: number;
}

export interface PhotosContext extends DriveContext {}

export interface LinkOptions {
  canEdit?: boolean;
  setEdit?: boolean;
  expireSeconds?: number;
  setExpiry?: boolean;
  customPassword?: string;
  setPassword?: boolean;
}

export interface DriveChild {
  linkId: string;
  name: string;
  type: number;
  size: number;
  createTime?: number;
  modifyTime?: number;
}

export interface DriveItemInfo {
  linkId: string;
  name: string;
  path: string;
  type: number;
  size: number;
  mimeType?: string;
  createTime?: number;
  modifyTime?: number;
  shared: boolean;
}

export interface ResolvedPath {
  shareId: string;
  linkId: string;
  name: string;
  isFolder: boolean;
  parentKeys: CryptoKeyRing;
  nodeKeys: CryptoKeyRing;
}

export type CryptoKeyRing = unknown[];

export interface DriveContext {
  shareId: string;
  volumeId: string;
  rootLinkId: string;
  shareKeys: CryptoKeyRing;
  addressId: string;
  addressEmail: string;
  addressKeys: CryptoKeyRing;
}

export interface UploadPlan {
  shareId: string;
  parentLinkId: string;
  destFolder: string;
  fileName: string;
  size?: number;
}

export interface DryRunAction {
  action: string;
  detail: Record<string, unknown>;
}
