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

export interface ApiContactRecord {
  ID: string;
  Cards: Array<Record<string, unknown>>;
}

export interface ContactsExportResponse {
  Code?: number;
  Contacts: ApiContactRecord[];
  Total?: number;
  Error?: string;
}

export interface ContactResponse {
  Code?: number;
  Contact: ApiContactRecord;
  Error?: string;
}

export interface CreateContactsRequest {
  Contacts: Array<{ Cards: Array<Record<string, unknown>> }>;
  Overwrite: number;
  Labels: number;
}

export interface CreateContactsResponse {
  Responses: Array<{
    Response: {
      Code?: number;
      Contact?: ApiContactRecord;
      Error?: string;
    };
  }>;
}

export interface UpdateContactRequest {
  Cards: Array<Record<string, unknown>>;
}

export interface DeleteContactsRequest {
  IDs: string[];
}

export interface ContactGroup {
  ID: string;
  Name: string;
  Color: string;
}

export interface LabelsResponse {
  Code?: number;
  Labels: ContactGroup[];
  Error?: string;
}

export interface LabelResponse {
  Code?: number;
  Label: ContactGroup;
  Error?: string;
}

export interface CreateLabelRequest {
  Name: string;
  Color: string;
  Type: number;
}

export interface ContactLabelRequest {
  LabelID: string;
  ContactIDs: string[];
}
