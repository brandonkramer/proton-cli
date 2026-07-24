import { getCalendarCrypto } from "./proxy.ts";

export interface CalendarKeyPayload {
  AddressID: string;
  PrivateKey: string;
  Passphrase: {
    DataPacket: string;
    KeyPacket: string;
  };
  Signature: string;
}

function generatePassphrase(): string {
  const value = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(value).toString("base64");
}

/** Generate calendar key setup payload (WebClients generateCalendarKeyPayload). */
export async function generateCalendarKeyPayload(options: {
  addressId: string;
  privateKey: unknown;
  publicKey: unknown;
}): Promise<CalendarKeyPayload> {
  const CryptoProxy = await getCalendarCrypto();
  const passphrase = generatePassphrase();
  const signingKey = options.privateKey;
  const publicKey = options.publicKey;

  const calendarPrivateKey = await CryptoProxy.generateKey({
    userIDs: [{ name: "Calendar key" }],
  });

  const privateKeyArmored = await CryptoProxy.exportPrivateKey({
    privateKey: calendarPrivateKey,
    passphrase,
  });

  const sessionKey = await CryptoProxy.generateSessionKey({
    recipientKeys: publicKey as never,
  });

  const { message: encryptedData, signature: binarySignature } =
    await CryptoProxy.encryptMessage({
      textData: passphrase,
      sessionKey,
      signingKeys: signingKey as never,
      detached: true,
      format: "binary",
    });

  if (!binarySignature) {
    throw new Error("Missing detached signature from encryptMessage.");
  }

  const encryptedSessionKey = await CryptoProxy.encryptSessionKey({
    ...sessionKey,
    encryptionKeys: publicKey as never,
    format: "binary",
  });

  const signature = await CryptoProxy.getArmoredSignature({ binarySignature });

  return {
    AddressID: options.addressId,
    PrivateKey: privateKeyArmored,
    Passphrase: {
      DataPacket: Buffer.from(encryptedData).toString("base64"),
      KeyPacket: Buffer.from(encryptedSessionKey).toString("base64"),
    },
    Signature: signature,
  };
}
