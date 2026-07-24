import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { CryptoProxyLike } from "../src/crypto.ts";
import type { KeySalt, ProtonUser, ProtonUserKey } from "../src/unlock.ts";

const mockImportPrivateKey = mock(
  async (_opts: { armoredKey: string; passphrase: string | null }) =>
    ({ kind: "private" }),
);
const mockImportPublicKey = mock(async (_opts: { armoredKey: string }) => ({
  kind: "public",
}));
const mockComputeKeyPassword = mock(
  async (password: string, salt: string) => `${password}:${salt}`,
);

mock.module("../src/crypto.ts", () => ({
  getCryptoProxy: async (): Promise<CryptoProxyLike> => ({
    setEndpoint: () => {},
    importPrivateKey: mockImportPrivateKey,
    importPublicKey: mockImportPublicKey,
    encryptMessage: async () => ({ message: new Uint8Array() }),
    decryptMessage: async () => ({ data: new Uint8Array() }),
  }),
  ensureCryptoProxy: async (): Promise<void> => {},
}));

mock.module("@protontech/crypto/srp", () => ({
  computeKeyPassword: mockComputeKeyPassword,
}));

const { computeKeyPassword, unlockUserKeys, unlockUserKeysWithFetch } =
  await import("../src/unlock.ts");

function userKey(id: string, privateKey = `armored-${id}`): ProtonUserKey {
  return { ID: id, Version: 3, PrivateKey: privateKey };
}

function testUser(keys: ProtonUserKey[]): ProtonUser {
  return { ID: "user-1", Name: "alice", Keys: keys };
}

describe("unlock", () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockImportPrivateKey.mockClear();
    mockImportPublicKey.mockClear();
    mockComputeKeyPassword.mockClear();
  });

  test("computeKeyPassword delegates to SRP module", async () => {
    await expect(computeKeyPassword("secret", "salt-b64")).resolves.toBe(
      "secret:salt-b64",
    );
    expect(mockComputeKeyPassword).toHaveBeenCalledWith("secret", "salt-b64");
  });

  test("unlockUserKeys uses raw password when KeySalt is missing", async () => {
    const user = testUser([userKey("primary")]);
    const salts: KeySalt[] = [{ ID: "primary", KeySalt: null }];

    const keys = await unlockUserKeys(user, "account-pass", salts);

    expect(keys).toHaveLength(1);
    expect(keys[0]?.ID).toBe("primary");
    expect(mockImportPrivateKey).toHaveBeenCalledWith({
      armoredKey: "armored-primary",
      passphrase: "account-pass",
    });
    expect(mockComputeKeyPassword).not.toHaveBeenCalled();
  });

  test("unlockUserKeys derives passphrase from KeySalt", async () => {
    const user = testUser([userKey("primary")]);
    const salts: KeySalt[] = [{ ID: "primary", KeySalt: "bcrypt-salt" }];

    await unlockUserKeys(user, "account-pass", salts);

    expect(mockComputeKeyPassword).toHaveBeenCalledWith(
      "account-pass",
      "bcrypt-salt",
    );
    expect(mockImportPrivateKey).toHaveBeenCalledWith({
      armoredKey: "armored-primary",
      passphrase: "account-pass:bcrypt-salt",
    });
  });

  test("unlockUserKeys rejects organization-managed keys", async () => {
    await expect(
      unlockUserKeys(
        { ...testUser([userKey("primary")]), OrganizationPrivateKey: "org-key" },
        "pass",
        [],
      ),
    ).rejects.toThrow(/Organization-managed keys/);
  });

  test("unlockUserKeysWithFetch loads user and salts", async () => {
    const user = testUser([userKey("primary")]);
    const fetchUser = mock(async () => user);
    const fetchKeySalts = mock(async (): Promise<KeySalt[]> => [
      { ID: "primary", KeySalt: null },
    ]);

    const keys = await unlockUserKeysWithFetch({
      password: "account-pass",
      fetchUser,
      fetchKeySalts,
    });

    expect(fetchUser).toHaveBeenCalledTimes(1);
    expect(fetchKeySalts).toHaveBeenCalledTimes(1);
    expect(keys[0]?.ID).toBe("primary");
  });
});
