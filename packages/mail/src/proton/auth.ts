import { clearSession, loadSession, saveSession } from "../config/store.ts";
import { getSrp } from "../shims/proton-srp.ts";
import { CliError, messageForApiCode } from "../util/errors.ts";
import {
  AUTH_2FA_PATH,
  AUTH_INFO_PATH,
  AUTH_PATH,
  AUTH_REFRESH_PATH,
  USERS_PATH,
} from "./constants.ts";
import { protonFetch } from "./http.ts";
import {
  API_CODE_MAILBOX_PASSWORD,
  isSuccessCode,
  type AuthInfoResponse,
  type Session,
} from "./types.ts";

function hasScope(session: Session, scope: string): boolean {
  return session.Scopes?.includes(scope) ?? false;
}

export async function getAuthInfo(username: string): Promise<AuthInfoResponse> {
  const { status, data } = await protonFetch<AuthInfoResponse>(AUTH_INFO_PATH, {
    method: "POST",
    body: { Username: username, Intent: "Proton" },
  });

  if (status !== 200 || !isSuccessCode(data.Code)) {
    throw new CliError(
      messageForApiCode(data.Code, data.Error ?? `auth/info failed (HTTP ${status})`),
    );
  }
  if (!data.Modulus || !data.ServerEphemeral) {
    throw new CliError("Incomplete auth info from Proton API.");
  }
  return data;
}

async function submit2fa(session: Session, code: string): Promise<string[]> {
  const { status, data } = await protonFetch<{
    Code: number;
    Scopes?: string[];
    Error?: string;
  }>(AUTH_2FA_PATH, {
    method: "POST",
    body: { TwoFactorCode: code },
    session,
  });

  if (status !== 200 || !isSuccessCode(data.Code) || !data.Scopes) {
    throw new CliError(
      messageForApiCode(
        data.Code,
        data.Error ?? "2FA verification failed. Use a TOTP authenticator code.",
      ),
    );
  }
  return data.Scopes;
}

export function authInfoRequiresTotp(info: AuthInfoResponse): boolean {
  return info["2FA"]?.Enabled === 1 && info["2FA"]?.TOTP === 1;
}

export async function verifySession(session: Session): Promise<boolean> {
  try {
    const { status, data } = await protonFetch<{ Code: number }>(USERS_PATH, {
      session,
    });
    return status === 200 && isSuccessCode(data.Code);
  } catch {
    return false;
  }
}

export async function refreshSession(session: Session): Promise<Session> {
  const { status, data } = await protonFetch<Session>(AUTH_REFRESH_PATH, {
    method: "POST",
    body: {
      ResponseType: "token",
      GrantType: "refresh_token",
      RefreshToken: session.RefreshToken,
      RedirectURI: "https://proton.me",
    },
    session,
  });

  if (status !== 200 || !isSuccessCode(data.Code)) {
    throw new CliError(
      messageForApiCode(data.Code, data.Error ?? "Session refresh failed."),
    );
  }
  return data;
}

export async function loginWithPassword(options: {
  username: string;
  password: string;
  totp?: string;
}): Promise<Session> {
  const info = await getAuthInfo(options.username);
  if (authInfoRequiresTotp(info) && !options.totp) {
    throw new CliError("2FA code required.");
  }

  const proofs = await getSrp(
    {
      Version: info.Version,
      Modulus: info.Modulus,
      ServerEphemeral: info.ServerEphemeral,
      Salt: info.Salt,
    },
    { username: options.username, password: options.password },
  );

  const body: Record<string, string> = {
    Username: options.username,
    ClientEphemeral: proofs.clientEphemeral,
    ClientProof: proofs.clientProof,
    SRPSession: info.SRPSession,
  };
  if (options.totp) {
    body.TwoFactorCode = options.totp;
  }

  const { status, data } = await protonFetch<Session>(AUTH_PATH, {
    method: "POST",
    body,
  });

  if (data.Code === API_CODE_MAILBOX_PASSWORD) {
    throw new CliError(messageForApiCode(API_CODE_MAILBOX_PASSWORD));
  }

  if (status !== 200 || !isSuccessCode(data.Code)) {
    throw new CliError(
      messageForApiCode(data.Code, data.Error ?? `Authentication failed (HTTP ${status}).`),
    );
  }

  if (data.ServerProof && data.ServerProof !== proofs.expectedServerProof) {
    throw new CliError("Server proof verification failed. Aborting login.");
  }

  return data;
}

export async function ensureFullScope(
  session: Session,
  totp: string,
): Promise<Session> {
  if (!hasScope(session, "twofactor")) {
    return session;
  }
  session.Scopes = await submit2fa(session, totp);
  return session;
}

export function normalizeUsername(raw: string): string {
  const trimmed = raw.trim();
  const at = trimmed.indexOf("@");
  if (at === -1) return trimmed;
  return trimmed.slice(0, at);
}

export async function persistSession(
  session: Session,
  username: string,
): Promise<void> {
  await saveSession(session, username);
}

export async function signOut(): Promise<void> {
  await clearSession();
}

export { loadSession, clearSession };
