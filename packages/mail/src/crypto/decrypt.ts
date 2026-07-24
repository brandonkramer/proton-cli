import { getCryptoProxy } from "./proxy.ts";
import { fetchSenderPublicKeys } from "./sender-keys.ts";
import { addressKeyForId, type UnlockedAddressKey } from "./unlock.ts";
import type { Session } from "../proton/types.ts";
import { CliError } from "../util/errors.ts";

export interface DecryptMessageBodyOptions {
  armoredBody: string;
  addressKeys: Map<string, UnlockedAddressKey>;
  addressId: string;
  senderEmail?: string;
  session?: Session;
  fetchImpl?: typeof fetch;
  /** Injected for tests — defaults to shared proxy. */
  cryptoProxy?: Awaited<ReturnType<typeof getCryptoProxy>>;
  /** Injected for tests — defaults to fetchSenderPublicKeys. */
  loadSenderKeys?: (email: string) => Promise<unknown[]>;
}

export interface DecryptedMessageBody {
  plaintext: string;
  verified: boolean | null;
}

function isArmoredPgpMessage(body: string): boolean {
  return body.includes("-----BEGIN PGP MESSAGE-----");
}

function toUtf8(data: string | Uint8Array): string {
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}

/**
 * Decrypt an armored message Body with the address key for AddressID.
 * Sender signature verify is best-effort via /core/v4/keys/all.
 */
export async function decryptMessageBody(
  options: DecryptMessageBodyOptions,
): Promise<DecryptedMessageBody> {
  const body = options.armoredBody ?? "";
  if (!body || !isArmoredPgpMessage(body)) {
    return { plaintext: body, verified: null };
  }

  const addressKey = addressKeyForId(
    { addressKeys: options.addressKeys },
    options.addressId,
  );

  let verificationKeys: unknown[] = [];
  if (options.senderEmail !== undefined && options.senderEmail !== "") {
    const loader =
      options.loadSenderKeys ??
      ((email: string) =>
        fetchSenderPublicKeys(email, {
          session: options.session,
          fetchImpl: options.fetchImpl,
        }));
    try {
      verificationKeys = await loader(options.senderEmail);
    } catch {
      // Signature verify is best-effort; lookup errors → unverified (null).
      verificationKeys = [];
    }
  }

  const CryptoProxy = options.cryptoProxy ?? (await getCryptoProxy());

  try {
    const result = await CryptoProxy.decryptMessage({
      armoredMessage: body,
      decryptionKeys: [addressKey.privateKey],
      verificationKeys,
      format: "utf8",
    } as never);
    const plaintext = toUtf8(
      (result as { data: string | Uint8Array }).data,
    );
    const verifiedFlag = (result as { verified?: unknown }).verified;
    return {
      plaintext,
      verified:
        verificationKeys.length > 0 ? Boolean(verifiedFlag) : null,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(`Could not decrypt message body: ${detail}`);
  }
}
