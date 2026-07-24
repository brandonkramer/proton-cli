import {
  unlockUserKeys,
  type DecryptedUserKey,
  type KeySalt,
  type ProtonUser,
} from "@bkramer/proton-core";
import { CliError, messageForApiCode } from "../util/errors.ts";
import { KEYS_SALTS_PATH, USERS_PATH } from "./constants.ts";
import { protonFetch } from "./http.ts";
import {
  isSuccessCode,
  type KeySaltsResponse,
  type Session,
  type UsersResponse,
} from "./types.ts";

export type { DecryptedUserKey, KeySalt, ProtonUser };

export async function fetchUser(session: Session): Promise<ProtonUser> {
  const { status, data } = await protonFetch<UsersResponse>(USERS_PATH, {
    session,
  });
  if (status !== 200 || !isSuccessCode(data.Code) || !data.User) {
    throw new CliError(
      messageForApiCode(data.Code, data.Error ?? `Failed to fetch user (HTTP ${status}).`),
    );
  }
  return data.User;
}

export async function fetchKeySalts(session: Session): Promise<KeySalt[]> {
  const { status, data } = await protonFetch<KeySaltsResponse>(KEYS_SALTS_PATH, {
    session,
  });
  if (status !== 200 || !isSuccessCode(data.Code) || !data.KeySalts) {
    throw new CliError(
      messageForApiCode(
        data.Code,
        data.Error ?? `Failed to fetch key salts (HTTP ${status}).`,
      ),
    );
  }
  return data.KeySalts;
}

export async function decryptUserKeys(
  user: ProtonUser,
  password: string,
  salts: KeySalt[],
): Promise<DecryptedUserKey[]> {
  try {
    return await unlockUserKeys(user, password, salts);
  } catch (error) {
    if (error instanceof Error) {
      throw new CliError(error.message);
    }
    throw new CliError(String(error));
  }
}
