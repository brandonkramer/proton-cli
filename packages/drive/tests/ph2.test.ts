import { afterAll, describe, expect, mock, test } from "bun:test";
import type { DriveLink } from "../src/drive/types.ts";
import { LINK_TYPE_FILE, LINK_TYPE_FOLDER } from "../src/drive/types.ts";

const mockDecryptName = mock(async (_enc: string, _keys: unknown[]) => "visible.txt");
const mockUnlockNode = mock(async (_link: DriveLink, _parent: unknown[]) => ["node-key"]);
const mockReEncryptName = mock(async (name: string) => `enc:${name}`);
const mockReEncryptPass = mock(async () => ({
  passphrase: "new-pass",
  signature: "new-sig",
}));

mock.module("../src/drive/crypto/node-crypto.ts", () => ({
  decryptName: mockDecryptName,
  unlockNodeKey: mockUnlockNode,
  encryptName: async (name: string) => `enc:${name}`,
  reEncryptName: mockReEncryptName,
  reEncryptNodePassphrase: mockReEncryptPass,
  hashKeyOf: async () => new Uint8Array(32),
  lookupHash: (name: string) => `hash-${name}`,
  generateNodeKeys: async () => ({
    nodeKeyArmored: "node-key",
    nodePassphraseArmored: "pass",
    nodePassphraseSignature: "sig",
    nodePrivateKey: "priv",
  }),
  generateNodeHashKey: async () => "hash-key",
  generateFileKeys: async () => ({
    sessionKey: { data: new Uint8Array(16), algorithm: "aes256" },
    contentKeyPacket: "packet",
    contentKeyPacketSignature: "sig",
  }),
  encryptBlock: async (data: Uint8Array) => ({
    encrypted: data,
    encSignature: "enc-sig",
  }),
  decryptBlock: async (data: Uint8Array) => data,
  decryptAndVerifyBlock: async (data: Uint8Array) => data,
  decryptFileSessionKey: async () => ({
    data: new Uint8Array(16),
    algorithm: "aes256",
  }),
  verifyRevisionManifest: async () => {},
  sha256Base64: () => "hash",
  sha256Raw: () => new Uint8Array(32),
  xorVerifier: () => "verifier",
  signManifest: async () => "manifest-sig",
}));

mock.module("../src/drive/crypto/share-crypto.ts", () => ({
  shareRoleLabel: (p: number) => (p & 2 ? "editor" : "viewer"),
  permFor: (edit: boolean) => (edit ? 6 : 4),
  randomSharePassword: () => "GenPass12345",
  composeSharePassword: (generated: string) => ({
    full: generated,
    flags: 2,
    custom: "",
  }),
  buildShareUrlPasswordFields: async () => ({
    SharePassphraseKeyPacket: "kp",
    SharePasswordSalt: "salt",
    Password: "enc-pass",
    SRPModulusID: "mod-id",
    SRPVerifier: "verifier",
    UrlPasswordSalt: "url-salt",
  }),
  decryptShareUrlPassword: async () => ({ generated: "GenPass12345", custom: "" }),
  encryptSessionKeyForPublicKeys: async () => "key-packet",
  signInviteKeyPacket: async () => "key-sig",
  signAcceptSessionKey: async () => "session-sig",
}));

mock.module("../src/drive/crypto/proxy.ts", () => ({
  getDriveCrypto: async () => ({
    decryptMessage: async () => ({ data: new Uint8Array([1, 2, 3]) }),
    importPrivateKey: async () => "share-key",
    importPublicKey: async () => "pub-key",
    generateSessionKey: async () => ({
      data: new Uint8Array(16),
      algorithm: "aes256",
    }),
    decryptSessionKey: async () => ({
      data: new Uint8Array(16),
      algorithm: "aes256",
    }),
    encryptSessionKey: async () => new Uint8Array(8),
    encryptMessage: async () => ({ message: "enc" }),
    signMessage: async () => ({ signature: "sig" }),
    verifyMessage: async () => ({ verificationStatus: 1 }),
  }),
  base64ToBytes: (v: string) => new Uint8Array(Buffer.from(v, "base64")),
  sha256Raw: () => new Uint8Array(32),
  VERIFICATION_STATUS: {
    NOT_SIGNED: 0,
    SIGNED_AND_VALID: 1,
    SIGNED_AND_INVALID: 2,
  },
}));

const rootLink: DriveLink = {
  LinkID: "root",
  ParentLinkID: "",
  Type: LINK_TYPE_FOLDER,
  Size: 0,
  Name: "enc-root",
  NodeKey: "nk",
  NodePassphrase: "np",
  FolderProperties: { NodeHashKey: "hk" },
};

const sharedFile: DriveLink = {
  LinkID: "file-1",
  ParentLinkID: "root",
  Type: LINK_TYPE_FILE,
  Size: 10,
  Name: "enc-name",
  NodeKey: "nk2",
  NodePassphrase: "np2",
  ShareIDs: ["share-1", "share-link-1"],
};

const photoLink: DriveLink = {
  LinkID: "photo-1",
  ParentLinkID: "photos-root",
  Type: LINK_TYPE_FILE,
  Size: 100,
  Name: "enc-photo",
  NodeKey: "nk3",
  NodePassphrase: "np3",
  FileProperties: {
    ContentKeyPacket: Buffer.from("packet").toString("base64"),
    ActiveRevision: { ID: "rev-photo" },
  },
};

function mockFetch(): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.includes("/drive/volumes") && method === "GET" && !url.includes("/photos") && !url.includes("/trash")) {
      return jsonResponse({
        Volumes: [{ VolumeID: "vol-1", Share: { ShareID: "share-1", LinkID: "root" } }],
      });
    }
    if (url.includes("/drive/shares?") || url.endsWith("/drive/shares")) {
      return jsonResponse({
        Shares: [
          {
            ShareID: "photos-share",
            LinkID: "photos-root",
            VolumeID: "photos-vol",
            Type: 4,
            Locked: false,
          },
        ],
      });
    }
    if (url.includes("/drive/shares/share-1") && !url.includes("/links/") && !url.includes("/folders/") && !url.includes("/files/")) {
      return jsonResponse({
        Share: {
          AddressID: "addr-1",
          Key: "share-key-armored",
          Passphrase: "share-pass",
          PassphraseSignature: "share-sig",
        },
      });
    }
    if (url.includes("/drive/shares/photos-share") && !url.includes("/links/") && !url.includes("/files/")) {
      return jsonResponse({
        Share: {
          AddressID: "addr-1",
          Key: "photos-key",
          Passphrase: "photos-pass",
          PassphraseSignature: "photos-sig",
        },
      });
    }
    if (url.includes("/links/root") || url.includes("/links/photos-root")) {
      return jsonResponse({ Link: rootLink });
    }
    if (url.includes("/folders/root/children")) {
      return jsonResponse({ Links: [sharedFile] });
    }
    if (url.includes("/links/file-1")) {
      return jsonResponse({ Link: sharedFile });
    }
    if (url.includes("/links/photo-1")) {
      return jsonResponse({ Link: photoLink });
    }
    if (url.includes("/drive/volumes/vol-1/trash") && method === "GET") {
      return jsonResponse({
        Trash: [{ ShareID: "share-1", LinkIDs: ["trashed-1"] }],
      });
    }
    if (url.includes("/trash/restore_multiple") && method === "PUT") {
      return jsonResponse({ Code: 1000 });
    }
    if (url.includes("/drive/volumes/vol-1/trash") && method === "DELETE") {
      return jsonResponse({ Code: 1000 });
    }
    if (url.includes("/drive/shares/share-link-1/urls") && method === "GET") {
      return jsonResponse({
        ShareURLs: [
          {
            ShareURLID: "url-1",
            ShareID: "share-link-1",
            Token: "tok",
            PublicUrl: "https://drive.proton.me/urls/abc",
            Password: "enc-url-pass",
            Permissions: 4,
            Flags: 2,
            CreateTime: 1,
            NumAccesses: 0,
          },
        ],
      });
    }
    if (url.includes("/drive/v2/shares/share-link-1/members")) {
      return jsonResponse({
        Members: [
          {
            MemberID: "mem-1",
            Email: "bob@proton.me",
            Permissions: 4,
            CreateTime: 2,
          },
        ],
      });
    }
    if (url.includes("/drive/v2/shares/share-link-1/invitations") && method === "GET") {
      return jsonResponse({
        Invitations: [
          {
            InvitationID: "out-inv-1",
            InviteeEmail: "pending@proton.me",
            Permissions: 4,
            CreateTime: 3,
          },
        ],
      });
    }
    if (url.includes("/drive/v2/shares/invitations/inv-in-1")) {
      return jsonResponse({
        Invitation: {
          InvitationID: "inv-in-1",
          InviterEmail: "alice@proton.me",
          InviteeEmail: "bob@proton.me",
          Permissions: 4,
          CreateTime: 4,
          KeyPacket: Buffer.from("kp").toString("base64"),
        },
        Share: { ShareID: "share-1", VolumeID: "vol-1" },
      });
    }
    if (url.includes("/drive/v2/shares/invitations") && method === "GET") {
      return jsonResponse({
        Invitations: [
          {
            VolumeID: "vol-1",
            ShareID: "share-1",
            InvitationID: "inv-in-1",
          },
        ],
        AnchorID: "",
        More: false,
      });
    }
    if (url.includes("/drive/volumes/photos-vol/photos")) {
      return jsonResponse({
        Photos: [
          {
            LinkID: "photo-1",
            CaptureTime: 1000,
            Hash: "h1",
            ContentHash: "ch1",
            Tags: [],
          },
        ],
      });
    }
    if (url.includes("/drive/photos/volumes/photos-vol/albums")) {
      return jsonResponse({
        Albums: [{ LinkID: "album-1", PhotoCount: 2 }],
      });
    }
    if (url.includes("/links/album-1")) {
      return jsonResponse({
        Link: {
          ...rootLink,
          LinkID: "album-1",
          Name: "enc-album",
        },
      });
    }
    if (url.includes("/revisions/rev-photo") || url.includes("/revisions/rev-1")) {
      return jsonResponse({
        Revision: {
          Blocks: [
            {
              Index: 1,
              BareURL: "https://storage.example/photo-block",
              Token: "tok",
              EncSignature: "sig",
            },
          ],
        },
      });
    }
    if (url.includes("storage.example/photo-block")) {
      return new Response(new Uint8Array([5, 6, 7]), { status: 200 });
    }
    if (url.includes("/links/trashed-1")) {
      return jsonResponse({
        Link: { ...sharedFile, LinkID: "trashed-1" },
      });
    }
    if (url.includes("/core/v4/users")) {
      return jsonResponse({
        Code: 1000,
        User: {
          ID: "u1",
          Name: "alice",
          Keys: [{ ID: "k1", Version: 3, PrivateKey: "pk", Primary: 1, Active: 1 }],
        },
      });
    }
    if (url.includes("/core/v4/keys/salts")) {
      return jsonResponse({ Code: 1000, KeySalts: [{ ID: "k1", KeySalt: null }] });
    }
    if (url.includes("/core/v4/addresses")) {
      return jsonResponse({
        Code: 1000,
        Addresses: [
          {
            ID: "addr-1",
            Email: "alice@proton.me",
            Keys: [{ ID: "ak1", PrivateKey: "apk", Active: 1 }],
          },
        ],
      });
    }

    if (method === "POST" || method === "PUT" || method === "DELETE") {
      return jsonResponse({ Code: 1000 });
    }

    return jsonResponse({ Code: 1000 }, 404);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ETag: "etag" },
  });
}

mock.module("../src/proton/http.ts", () => ({
  protonFetch: async <T>(
    path: string,
    options: {
      fetchImpl?: typeof fetch;
      method?: string;
      body?: unknown;
      session?: unknown;
    } = {},
  ) => {
    const fetchImpl = options.fetchImpl ?? mockFetch();
    const response = await fetchImpl(`https://drive-api.proton.me${path}`, {
      method: options.method,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const raw = await response.text();
    const data = JSON.parse(raw) as T;
    return { status: response.status, data, raw, etag: response.headers.get("ETag") };
  },
}));

mock.module("../src/proton/auth.ts", () => ({
  loadSession: async () => ({
    username: "alice",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    session: {
      Code: 1000,
      AccessToken: "token",
      RefreshToken: "refresh",
      TokenType: "Bearer",
      Scopes: [],
      UID: "uid",
      UserID: "u1",
      ExpiresIn: 3600,
    },
  }),
  verifySession: async () => true,
  refreshSession: async (session: { AccessToken: string }) => session,
  persistSession: async () => {},
}));

const unlockedFixture = {
  userKeys: [{ ID: "k1", privateKey: "user-priv", publicKey: "user-pub" }],
  addressKeys: new Map([["addr-1", ["addr-key"]]]),
  addresses: [{ ID: "addr-1", Email: "alice@proton.me", Keys: [] }],
};

mock.module("../src/keys/unlock.ts", () => ({
  unlockDriveKeys: async () => unlockedFixture,
  primaryAddress: (unlocked: typeof unlockedFixture) => {
    for (const address of unlocked.addresses) {
      const keys = unlocked.addressKeys.get(address.ID);
      if (!keys?.length) continue;
      const email = address.Email.toLowerCase();
      if (
        email.endsWith("@proton.me") ||
        email.endsWith("@pm.me") ||
        email.endsWith("@protonmail.com")
      ) {
        return { addressId: address.ID, email: address.Email, keys };
      }
    }
    for (const address of unlocked.addresses) {
      const keys = unlocked.addressKeys.get(address.ID);
      if (keys?.length) {
        return { addressId: address.ID, email: address.Email, keys };
      }
    }
    throw new Error("No address key ring available.");
  },
  addressKeysForId: (unlocked: typeof unlockedFixture, addressId: string) => {
    const keys = unlocked.addressKeys.get(addressId);
    if (!keys?.length) {
      throw new Error(`No key ring for address ${addressId}.`);
    }
    return keys;
  },
}));

const { DriveService } = await import("../src/drive/service.ts");

describe("drive PH2 with mocked API", () => {
  afterAll(() => {
    mock.restore();
  });

  test("share status includes links, members, and pending invites", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, context } = await service.open({ password: "pw" });
    const status = await service.shareStatus(client, context, "/visible.txt", false);
    if ("action" in status) throw new Error("expected status");
    expect(status.publicLinks).toHaveLength(1);
    expect(status.members[0]?.email).toBe("bob@proton.me");
    expect(status.pendingInvitations[0]?.email).toBe("pending@proton.me");
  });

  test("dry-run trash restore returns plan", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, context } = await service.open({ password: "pw" });
    const plan = await service.restoreTrash(
      client,
      context,
      ["trashed-1"],
      true,
    );
    expect(plan).toMatchObject({
      action: "trash.restore",
      detail: { linkIds: ["trashed-1"] },
    });
  });

  test("trash list returns entries", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, context } = await service.open({ password: "pw" });
    const items = await service.listTrash(client, context, false);
    if ("action" in items) throw new Error("expected list");
    expect(items).toHaveLength(1);
    expect(items[0]?.linkId).toBe("trashed-1");
  });

  test("move re-encrypts and calls move API", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, context } = await service.open({ password: "pw" });
    await service.move(client, context, "/visible.txt", "/", false);
    expect(mockReEncryptName).toHaveBeenCalled();
    expect(mockReEncryptPass).toHaveBeenCalled();
  });

  test("photos list and albums list", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, unlocked } = await service.open({ password: "pw" });
    const photosContext = await service.resolvePhotosContext(client, unlocked);
    const photos = await service.listPhotos(client, photosContext, false);
    if ("action" in photos) throw new Error("expected photos");
    expect(photos[0]?.linkId).toBe("photo-1");

    const albums = await service.listAlbums(client, photosContext, false);
    if ("action" in albums) throw new Error("expected albums");
    expect(albums[0]?.linkId).toBe("album-1");
  });

  test("photo download returns bytes", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, unlocked } = await service.open({ password: "pw" });
    const photosContext = await service.resolvePhotosContext(client, unlocked);
    const data = await service.downloadPhoto(client, photosContext, "photo-1", false);
    if ("action" in data) throw new Error("expected bytes");
    expect(data).toEqual(new Uint8Array([5, 6, 7]));
  });

  test("invitations list returns details", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client } = await service.open({ password: "pw" });
    const invitations = await service.listInvitations(client);
    expect(invitations[0]?.invitationId).toBe("inv-in-1");
  });

  test("dry-run share link returns plan", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, context } = await service.open({ password: "pw" });
    const plan = await service.ensureShareLink(client, context, "/visible.txt", {}, true);
    expect(plan).toMatchObject({ action: "share.link" });
  });
});
