import { clearAllState, loadSession, saveSession } from "../config/store.ts";
import { getSrp } from "../crypto/proxy.ts";
import { CliError, messageForApiCode } from "../util/errors.ts";
import {
  AUTH_2FA_PATH,
  AUTH_INFO_PATH,
  AUTH_PATH,
  AUTH_REFRESH_PATH,
  USERS_PATH,
} from "./constants.ts";
import {
  isHumanVerificationError,
  solveCaptchaInBrowser,
  type HumanVerificationDetails,
  type HumanVerificationResult,
} from "./human-verification.ts";
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

type AuthAttemptResult = {
  status: number;
  data: Session & {
    Details?: Partial<HumanVerificationDetails>;
    Error?: string;
  };
  expectedServerProof: string;
};

async function srpAuthAttempt(options: {
  username: string;
  password: string;
  totp?: string;
  humanVerification?: HumanVerificationResult;
}): Promise<AuthAttemptResult> {
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

  const { status, data } = await protonFetch<AuthAttemptResult["data"]>(AUTH_PATH, {
    method: "POST",
    body,
    humanVerification: options.humanVerification,
  });

  return {
    status,
    data,
    expectedServerProof: proofs.expectedServerProof,
  };
}

export async function loginWithPassword(options: {
  username: string;
  password: string;
  totp?: string;
  /** Called when a browser CAPTCHA challenge is opened. */
  onHumanVerification?: (info: { url: string; webUrl?: string }) => void;
}): Promise<Session> {
  let { status, data, expectedServerProof } = await srpAuthAttempt(options);

  if (isHumanVerificationError(data)) {
    const details = data.Details;
    const hv = await solveCaptchaInBrowser(details, {
      onReady: (url) => {
        options.onHumanVerification?.({
          url,
          webUrl: details.WebUrl,
        });
      },
    });

    // Fresh SRP challenge + solved CAPTCHA token (challenge tokens are one-shot).
    ({ status, data, expectedServerProof } = await srpAuthAttempt({
      ...options,
      humanVerification: hv,
    }));
  }

  if (data.Code === API_CODE_MAILBOX_PASSWORD) {
    throw new CliError(messageForApiCode(API_CODE_MAILBOX_PASSWORD));
  }

  if (status !== 200 || !isSuccessCode(data.Code)) {
    if (isHumanVerificationError(data)) {
      throw new CliError(
        "CAPTCHA was completed but Proton still requires human verification.\n" +
          "Retry signin, or sign in once at https://account.proton.me from this network.",
      );
    }
    throw new CliError(
      messageForApiCode(
        data.Code,
        data.Error ?? `Authentication failed (HTTP ${status}).`,
      ),
    );
  }

  if (data.ServerProof && data.ServerProof !== expectedServerProof) {
    throw new CliError("Server proof verification failed. Aborting login.");
  }

  return data;
}

/** Upgrade a twofactor-limited session with a TOTP code when needed. */
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

export function sessionNeedsTotpUpgrade(session: Session): boolean {
  return hasScope(session, "twofactor") && !hasScope(session, "full");
}

/** Proton SRP expects the local part for many accounts; accept full emails too. */
export function normalizeUsername(raw: string): string {
  const trimmed = raw.trim();
  const at = trimmed.indexOf("@");
  if (at === -1) return trimmed;
  return trimmed.slice(0, at);
}

/** Try cached/refresh session without prompting. */
export async function tryExistingSession(
  usernameArg?: string,
): Promise<{ username: string; session: Session } | null> {
  const existing = await loadSession(
    usernameArg ? normalizeUsername(usernameArg) : undefined,
  );
  if (!existing) return null;

  if (await verifySession(existing.session)) {
    return { username: existing.username, session: existing.session };
  }

  try {
    const refreshed = await refreshSession(existing.session);
    await saveSession(refreshed, existing.username);
    return { username: existing.username, session: refreshed };
  } catch {
    await clearAllState();
    return null;
  }
}

export async function requireSession(): Promise<{
  username: string;
  session: Session;
}> {
  const reused = await tryExistingSession();
  if (reused) return reused;
  throw new CliError(
    'Not signed in. Run "proton signin" or "proton auth signin" first.',
  );
}

export async function signOut(): Promise<void> {
  await clearAllState();
}

export async function persistSession(
  session: Session,
  username: string,
): Promise<void> {
  await saveSession(session, username);
}
