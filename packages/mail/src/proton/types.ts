export interface AuthInfoResponse {
  Code: number;
  Version: number;
  Modulus: string;
  ServerEphemeral: string;
  Salt: string;
  SRPSession: string;
  "2FA"?: {
    Enabled: number;
    TOTP: number;
  };
  Error?: string;
}

export interface Session {
  Code: number;
  AccessToken: string;
  RefreshToken: string;
  TokenType: string;
  Scopes: string[];
  UID: string;
  UserID: string;
  EventID?: string;
  ServerProof?: string;
  PasswordMode?: number;
  ExpiresIn: number;
  Error?: string;
}

export interface SavedSession {
  session: Session;
  username: string;
  savedAt: string;
  expiresAt: string;
}

export const API_CODE_OK = 1000;
export const API_CODE_MULTI = 1001;
export const API_CODE_PASSWORD_WRONG = 8002;
export const API_CODE_HUMAN_VERIFICATION = 9001;
export const API_CODE_APP_VERSION_BAD = 5003;
export const API_CODE_MAILBOX_PASSWORD = 10013;

export function isSuccessCode(code: number): boolean {
  return code === API_CODE_OK || code === API_CODE_MULTI;
}

export interface UsersResponse {
  Code: number;
  User?: import("@bkramer/proton-core").ProtonUser;
  Error?: string;
}

export interface KeySaltsResponse {
  Code: number;
  KeySalts?: import("@bkramer/proton-core").KeySalt[];
  Error?: string;
}

export interface MailRecipient {
  Name: string;
  Address: string;
}

export interface MessageMetadata {
  ID: string;
  ConversationID: string;
  AddressID: string;
  LabelIDs: string[];
  ExternalID: string;
  Subject: string;
  Sender: MailRecipient;
  ToList: MailRecipient[];
  CCList: MailRecipient[];
  BCCList: MailRecipient[];
  ReplyTos: MailRecipient[];
  Time: number;
  Size: number;
  Unread: number;
  IsReplied: number;
  IsRepliedAll: number;
  IsForwarded: number;
  NumAttachments: number;
  Flags: number;
}

export interface MailAttachment {
  ID: string;
  Name?: string;
  Size?: number;
  MIMEType?: string;
}

export interface Message extends MessageMetadata {
  Header: string;
  Body: string;
  MIMEType: string;
  Attachments: MailAttachment[];
  ParsedHeaders?: Record<string, string | string[] | undefined>;
}

export interface MessagesListResponse {
  Code?: number;
  Messages?: MessageMetadata[];
  Total?: number;
  Stale?: number;
  Error?: string;
}

export interface MessageResponse {
  Code?: number;
  Message?: Message;
  Error?: string;
}

export interface MessageQuery {
  Page?: number;
  PageSize?: number;
  Limit?: number;
  LabelID?: string;
  AddressID?: string;
  Sort?: string;
  Desc?: number;
  Unread?: number;
  Keyword?: string;
  From?: string;
  Recipients?: string;
  Subject?: string;
  Begin?: number;
  End?: number;
  ID?: string[];
}

export interface CreateDraftMessage {
  AddressID: string;
  Subject: string;
  Sender: MailRecipient;
  ToList: MailRecipient[];
  CCList: MailRecipient[];
  BCCList: MailRecipient[];
  Body: string;
  MIMEType: string;
  Unread?: number;
  Flags?: number;
}

export interface CreateDraftRequest {
  Message: CreateDraftMessage;
  ParentID?: string;
  Action?: number;
  AttachmentKeyPackets?: Record<string, string>;
}

export interface SendPackageRecipient {
  Type: number;
  Signature: number;
  BodyKeyPacket?: string;
  AttachmentKeyPackets?: Record<string, string>;
}

export interface SendPackage {
  Addresses: Record<string, SendPackageRecipient>;
  MIMEType: string;
  Type: number;
  Body: string;
  BodyKey?: { Key: string; Algorithm: string };
  AttachmentKeys?: Record<string, { Key: string; Algorithm: string }>;
}

export interface SendPackagesRequest {
  Packages: SendPackage[];
  AutoSaveContacts?: number;
  DelaySeconds?: number;
  DeliveryTime?: number;
  ExpirationTime?: number;
  ExpiresIn?: number;
}

export interface MessageActionRequest {
  IDs: string[];
}

export interface LabelMessagesRequest {
  LabelID: string;
  IDs: string[];
}

export interface ProtonLabel {
  ID: string;
  Name: string;
  Color: string;
  Type: number;
  ParentID?: string;
  Path?: string | string[];
}

export interface LabelsResponse {
  Code?: number;
  Labels?: ProtonLabel[];
  Error?: string;
}

export interface LabelResponse {
  Code?: number;
  Label?: ProtonLabel;
  Error?: string;
}

export interface CreateLabelRequest {
  Name: string;
  Color: string;
  Type: number;
  ParentID?: string;
}

export interface UpdateLabelRequest {
  Name?: string;
  Color?: string;
  ParentID?: string;
}

export interface AddressesResponse {
  Code?: number;
  Addresses?: import("../crypto/unlock.ts").ProtonAddress[];
  Error?: string;
}
