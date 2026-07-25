import { describe, expect, test } from "bun:test";
import { guessMimeType } from "../src/crypto/attachments.ts";
import {
  PACKAGE_TYPE,
  SIGNATURE_TYPE,
  enrichPackagesWithAttachments,
  type SendPackage,
} from "../src/crypto/send.ts";

describe("guessMimeType", () => {
  test("maps common extensions", () => {
    expect(guessMimeType("a.PDF")).toBe("application/pdf");
    expect(guessMimeType("x.png")).toBe("image/png");
    expect(guessMimeType("noext")).toBe("application/octet-stream");
  });
});

describe("enrichPackagesWithAttachments", () => {
  test("adds AttachmentKeyPackets for PM and AttachmentKeys for clear", async () => {
    const pack: SendPackage = {
      Addresses: {
        "bob@proton.me": {
          Type: PACKAGE_TYPE.SEND_PM,
          Signature: SIGNATURE_TYPE.DETACHED,
          BodyKeyPacket: "body",
        },
        "ext@gmail.com": {
          Type: PACKAGE_TYPE.SEND_CLEAR,
          Signature: SIGNATURE_TYPE.NONE,
        },
      },
      MIMEType: "text/plain",
      Type: PACKAGE_TYPE.SEND_PM | PACKAGE_TYPE.SEND_CLEAR,
      Body: "Ym9keQ==",
      BodyKey: { Key: "clearbody", Algorithm: "aes256" },
    };

    await enrichPackagesWithAttachments({
      packages: [pack],
      attachments: [
        {
          id: "att-1",
          sessionKey: {
            data: new Uint8Array([1, 2, 3, 4]),
            algorithm: "aes256",
          },
        },
      ],
      recipients: [
        { email: "bob@proton.me", publicKeys: [{ kind: "bob" }] },
        { email: "ext@gmail.com", publicKeys: [] },
      ],
      cryptoProxy: {
        encryptSessionKey: async () => new Uint8Array([9, 9]),
      } as never,
    });

    expect(pack.Addresses["bob@proton.me"]?.AttachmentKeyPackets?.["att-1"]).toBeTruthy();
    expect(pack.AttachmentKeys?.["att-1"]).toEqual({
      Key: btoa(String.fromCharCode(1, 2, 3, 4)),
      Algorithm: "aes256",
    });
    expect(
      pack.Addresses["ext@gmail.com"]?.AttachmentKeyPackets,
    ).toBeUndefined();
  });
});
