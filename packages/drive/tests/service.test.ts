import { afterAll, describe, expect, mock, test } from "bun:test";
import type { DriveLink } from "../src/drive/types.ts";
import { LINK_TYPE_FILE, LINK_TYPE_FOLDER } from "../src/drive/types.ts";

const mockDecryptName = mock(async (_enc: string, _keys: unknown[]) => "visible.txt");
const mockUnlockNode = mock(async (_link: DriveLink, _parent: unknown[]) => ["node-key"]);

mock.module("../src/drive/crypto/node-crypto.ts", () => ({
  decryptName: mockDecryptName,
  unlockNodeKey: mockUnlockNode,
  encryptName: async (name: string) => `enc:${name}`,
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

mock.module("../src/drive/crypto/proxy.ts", () => ({
  getDriveCrypto: async () => ({
    decryptMessage: async () => ({ data: new Uint8Array([1, 2, 3]) }),
    importPrivateKey: async () => "share-key",
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

const childFile: DriveLink = {
  LinkID: "file-1",
  ParentLinkID: "root",
  Type: LINK_TYPE_FILE,
  Size: 10,
  Name: "enc-name",
  NodeKey: "nk2",
  NodePassphrase: "np2",
  FileProperties: {
    ContentKeyPacket: Buffer.from("packet").toString("base64"),
    ActiveRevision: { ID: "rev-1" },
  },
};

function mockFetch(): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.includes("/drive/volumes") && method === "GET") {
      return jsonResponse({
        Volumes: [
          {
            VolumeID: "vol-1",
            Share: { ShareID: "share-1", LinkID: "root" },
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
    if (url.includes("/links/root")) {
      return jsonResponse({ Link: rootLink });
    }
    if (url.includes("/folders/root/children")) {
      return jsonResponse({ Links: [childFile] });
    }
    if (url.includes("/links/file-1") && !url.includes("/revisions/")) {
      return jsonResponse({ Link: childFile });
    }
    if (url.includes("/revisions/rev-1") && !url.includes("verification")) {
      return jsonResponse({
        Revision: {
          Blocks: [
            {
              Index: 1,
              BareURL: "https://storage.example/block",
              Token: "tok",
              EncSignature: "sig",
            },
          ],
        },
      });
    }
    if (url.includes("storage.example/block")) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
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

    return jsonResponse({ Code: 1000 }, 404);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ETag: "etag",
    },
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
    return {
      status: response.status,
      data,
      raw,
      etag: response.headers.get("ETag"),
    };
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

describe("drive service with mocked API", () => {
  afterAll(() => {
    mock.restore();
  });

  test("lists decrypted children", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, context } = await service.open({ password: "pw" });
    const items = await service.list(client, context, "/");
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("visible.txt");
    expect(items[0]?.linkId).toBe("file-1");
  });

  test("dry-run upload returns plan", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, context } = await service.open({ password: "pw" });
    const plan = await service.upload(
      client,
      context,
      "/",
      "note.txt",
      new Uint8Array([9, 9]),
      { dryRun: true, sizeHint: 2 },
    );
    expect(plan).toMatchObject({
      action: "items.upload",
      detail: { dest: "/", name: "note.txt", size: 2 },
    });
  });

  test("dry-run folder create returns plan", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, context } = await service.open({ password: "pw" });
    const plan = await service.createFolder(
      client,
      context,
      "/NewFolder",
      true,
    );
    expect(plan).toMatchObject({
      action: "folder.create",
      detail: { path: "/NewFolder" },
    });
  });

  test("download returns decrypted bytes", async () => {
    const service = new DriveService({ fetchImpl: mockFetch() });
    const { client, context } = await service.open({ password: "pw" });
    const resolved = await service.resolvePath(client, context, "/visible.txt");
    expect(resolved.linkId).toBe("file-1");
    const data = await service.download(client, context, "/visible.txt", false);
    expect(data).toEqual(new Uint8Array([1, 2, 3]));
  });
});
