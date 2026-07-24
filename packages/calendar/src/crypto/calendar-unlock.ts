import { getCalendarCrypto } from "./proxy.ts";
import {
  unlockCalendarKeys,
  type UnlockedCalendarKeys,
} from "./unlock.ts";
import { calendarApi } from "../proton/api.ts";
import type { Session } from "../proton/types.ts";

export interface UnlockedCalendarContext {
  calendarPrivateKey: unknown;
  addressPrivateKey: unknown;
  addressPublicKey: unknown;
  memberId: string;
  email: string;
}

interface UnlockOptions {
  session: Session;
  calendarId: string;
  password: string;
  unlocked?: UnlockedCalendarKeys;
  fetchImpl?: typeof fetch;
}

/** Unlock calendar + address keys for event E2EE (INV-E2EE-001). */
export async function unlockCalendarForEvents(
  options: UnlockOptions,
): Promise<UnlockedCalendarContext> {
  const unlocked =
    options.unlocked ??
    (await unlockCalendarKeys({
      session: options.session,
      password: options.password,
      fetchImpl: options.fetchImpl,
    }));

  const members = await calendarApi<{
    Members: { ID: string; AddressID: string; Email: string }[];
  }>(`/calendar/v1/${options.calendarId}/members`, {
    session: options.session,
    fetchImpl: options.fetchImpl,
  });

  const member = members.Members.find((m) => unlocked.addressKeys.has(m.AddressID));
  if (!member) {
    throw new Error(`No matching address key for calendar ${options.calendarId}`);
  }

  // Prefer the calendar member address key (secondary-address calendars).
  const addr = unlocked.addressKeys.get(member.AddressID);
  if (!addr) {
    throw new Error(`No unlocked address key for member address ${member.AddressID}`);
  }

  const passData = await calendarApi<{
    Passphrase: {
      MemberPassphrases: {
        MemberID: string;
        Passphrase: string;
        Signature: string;
      }[];
    };
  }>(`/calendar/v1/${options.calendarId}/passphrase`, {
    session: options.session,
    fetchImpl: options.fetchImpl,
  });

  const memberPass = passData.Passphrase.MemberPassphrases.find(
    (entry) => entry.MemberID === member.ID,
  );
  if (!memberPass) {
    throw new Error(`No passphrase found for calendar member ${member.ID}`);
  }

  const CryptoProxy = await getCalendarCrypto();
  const { data: calPassBytes } = await CryptoProxy.decryptMessage({
    armoredMessage: memberPass.Passphrase,
    armoredSignature: memberPass.Signature,
    decryptionKeys: [addr.privateKey as never],
    verificationKeys: [addr.publicKey as never],
    format: "binary",
  });
  const calPass =
    calPassBytes instanceof Uint8Array
      ? Buffer.from(calPassBytes).toString("binary")
      : String(calPassBytes);

  const keyData = await calendarApi<{ Keys: { PrivateKey: string }[] }>(
    `/calendar/v1/${options.calendarId}/keys`,
    { session: options.session, fetchImpl: options.fetchImpl },
  );

  let calendarPrivateKey: unknown;
  for (const key of keyData.Keys) {
    try {
      calendarPrivateKey = await CryptoProxy.importPrivateKey({
        armoredKey: key.PrivateKey,
        passphrase: calPass,
      });
      break;
    } catch {
      continue;
    }
  }
  if (!calendarPrivateKey) {
    throw new Error(`Failed to unlock calendar keys for ${options.calendarId}`);
  }

  return {
    calendarPrivateKey,
    addressPrivateKey: addr.privateKey,
    addressPublicKey: addr.publicKey,
    memberId: member.ID,
    email: member.Email,
  };
}
