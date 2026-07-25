import { describe, expect, mock, test } from "bun:test";

const getSrp = mock(async () => ({
  clientEphemeral: "ephemeral",
  clientProof: "proof",
  expectedServerProof: "server",
  sharedSession: new Uint8Array(),
}));

mock.module("../src/shims/proton-srp.ts", () => ({ getSrp }));

const { unlockPasswordScope } = await import("../src/crypto/password-scope.ts");

describe("unlockPasswordScope", () => {
  test("POSTs auth/info then PUTs users/password with SRP proofs", async () => {
    const calls: Array<{ path: string; method?: string; body?: unknown }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, method: init?.method, body });

      if (path.includes("/core/v4/auth/info")) {
        return new Response(
          JSON.stringify({
            Code: 1000,
            Version: 4,
            Modulus: "mod",
            ServerEphemeral: "sev",
            Salt: "salt",
            SRPSession: "srp",
          }),
          { status: 200 },
        );
      }
      if (path.includes("/core/v4/users/password")) {
        return new Response(JSON.stringify({ Code: 1000 }), { status: 200 });
      }
      return new Response(JSON.stringify({ Code: 0, Error: "unexpected" }), {
        status: 500,
      });
    }) as typeof fetch;

    await unlockPasswordScope({
      session: {
        Code: 1000,
        AccessToken: "tok",
        RefreshToken: "ref",
        TokenType: "Bearer",
        Scopes: ["full", "locked"],
        UID: "uid",
        UserID: "user",
        ExpiresIn: 3600,
      },
      username: "alice",
      password: "secret",
      fetchImpl,
    });

    expect(getSrp).toHaveBeenCalled();
    expect(calls).toEqual([
      {
        path: "/core/v4/auth/info",
        method: "POST",
        body: { Username: "alice" },
      },
      {
        path: "/core/v4/users/password",
        method: "PUT",
        body: {
          ClientProof: "proof",
          ClientEphemeral: "ephemeral",
          SRPSession: "srp",
        },
      },
    ]);
  });
});
