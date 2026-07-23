import { saveSession } from "../config/store.ts";
import {
  authInfoRequiresTotp,
  ensureFullScope,
  getAuthInfo,
  loginWithPassword,
  normalizeUsername,
  sessionNeedsTotpUpgrade,
  tryExistingSession,
} from "../proton/auth.ts";
import { formatSyncSummary, syncEntries } from "../sync/sync.ts";
import { inkPromptPassword } from "../ui/prompts.tsx";
import { runTask } from "../ui/task.tsx";
import {
  resolveLoginIdentity,
  resolveTotpCode,
  resolveUsernameInteractive,
} from "../util/password.ts";

export interface SigninOptions {
  usernameArg?: string;
  /** Proton Pass item ref (`pass://Vault/Item` or `Vault/Item`). */
  passRef?: string;
  /** Run an initial sync after ensuring the Authenticator Key. */
  sync?: boolean;
}

/** Interactive sign-in used by the TUI and `protonauth signin`. */
export async function runInteractiveSignin(
  options: SigninOptions = {},
): Promise<void> {
  const identity = await resolveLoginIdentity({
    usernameArg: options.usernameArg,
    passRef: options.passRef,
  });
  const passRef = identity.passRef;

  const reused = await runTask({
    title: "Sign in",
    steps: [{ id: "session", label: "Checking saved session" }],
    run: async (ui) => {
      ui.updateStep("session", { status: "running" });
      const existing = await tryExistingSession(identity.username);
      if (existing) {
        ui.updateStep("session", {
          status: "done",
          detail: existing.username,
        });
        ui.setResult({
          variant: "success",
          title: "Already signed in",
          body: `Using cached session for ${existing.username}`,
        });
        return existing;
      }
      ui.updateStep("session", {
        status: "done",
        detail: "credentials needed",
      });
      return null;
    },
  });

  let password = identity.password;
  let username: string;

  if (reused) {
    username = reused.username;
    // Still need password to unlock Authenticator Key / optional sync.
    if (options.sync !== false) {
      password =
        password ??
        (await inkPromptPassword("Proton password", {
          hint: "Needed to unlock User Keys and sync Authenticator entries.",
        }));
      await runTask({
        title: "Sync",
        steps: [
          { id: "unlock", label: "Unlocking keys" },
          { id: "sync", label: "Syncing entries" },
        ],
        run: async (ui) => {
          ui.updateStep("unlock", { status: "running" });
          ui.updateStep("unlock", { status: "done" });
          ui.updateStep("sync", { status: "running" });
          const result = await syncEntries(password!);
          ui.updateStep("sync", {
            status: "done",
            detail: `${result.pulled}/${result.remoteTotal}`,
          });
          ui.setResult({
            variant:
              result.remoteTotal === 0 || result.skipped > 0
                ? "warning"
                : "success",
            title: "Synced",
            body: formatSyncSummary(result),
          });
          return result;
        },
      });
    }
    return;
  }

  username = normalizeUsername(
    await resolveUsernameInteractive(identity.username),
  );
  password =
    password ??
    (await inkPromptPassword("Proton password", {
      hint: "This is your Proton account password (Single Password Mode).",
    }));

  const needsLoginTotp = await runTask({
    title: "Sign in",
    steps: [{ id: "info", label: "Fetching auth challenge" }],
    note: `Account: ${username}`,
    run: async (ui) => {
      ui.updateStep("info", { status: "running" });
      const info = await getAuthInfo(username);
      const required = authInfoRequiresTotp(info);
      ui.updateStep("info", {
        status: "done",
        detail: required ? "2FA required" : "ready",
      });
      return required;
    },
  });

  const totp = await resolveTotpCode({ passRef, required: needsLoginTotp });

  let session = await runTask({
    title: "Sign in",
    steps: [
      { id: "auth", label: "Authenticating with Proton" },
      { id: "captcha", label: "CAPTCHA (if required)" },
      { id: "scope", label: "Checking session scope" },
      { id: "save", label: "Saving session" },
    ],
    note: `Account: ${username}`,
    run: async (ui) => {
      ui.updateStep("auth", { status: "running" });
      const next = await loginWithPassword({
        username,
        password: password!,
        totp,
        onHumanVerification: () => {
          ui.updateStep("auth", {
            status: "skipped",
            detail: "waiting on CAPTCHA",
          });
          ui.updateStep("captcha", {
            status: "running",
            detail: "solve in the floating native window",
          });
          ui.setNote(
            "Use the floating CAPTCHA window (not Safari / verify.proton.me).",
          );
        },
      });
      ui.updateStep("captcha", {
        status: "done",
        detail: "ok / not needed",
      });
      ui.updateStep("auth", { status: "done" });

      ui.updateStep("scope", { status: "running" });
      if (sessionNeedsTotpUpgrade(next)) {
        ui.updateStep("scope", {
          status: "skipped",
          detail: "needs 2FA upgrade",
        });
        ui.updateStep("save", { status: "skipped", detail: "waiting" });
        return next;
      }

      ui.updateStep("scope", { status: "done" });
      ui.updateStep("save", { status: "running" });
      await saveSession(next, username);
      ui.updateStep("save", { status: "done" });
      ui.setResult({
        variant: "success",
        title: "Signed in",
        body: `Authenticated as ${username}`,
      });
      return next;
    },
  });

  if (sessionNeedsTotpUpgrade(session)) {
    const upgradeCode = await resolveTotpCode({ passRef, required: true });
    session = await runTask({
      title: "Sign in",
      steps: [
        { id: "scope", label: "Upgrading session with 2FA" },
        { id: "save", label: "Saving session" },
      ],
      run: async (ui) => {
        ui.updateStep("scope", { status: "running" });
        const upgraded = await ensureFullScope(session, upgradeCode!);
        ui.updateStep("scope", { status: "done" });
        ui.updateStep("save", { status: "running" });
        await saveSession(upgraded, username);
        ui.updateStep("save", { status: "done" });
        ui.setResult({
          variant: "success",
          title: "Signed in",
          body: `Authenticated as ${username}`,
        });
        return upgraded;
      },
    });
  }

  if (options.sync !== false) {
    await runTask({
      title: "Sync",
      steps: [
        { id: "key", label: "Ensuring Authenticator Key" },
        { id: "sync", label: "Syncing entries" },
      ],
      run: async (ui) => {
        ui.updateStep("key", { status: "running" });
        ui.updateStep("key", { status: "done" });
        ui.updateStep("sync", { status: "running" });
        const result = await syncEntries(password!);
        ui.updateStep("sync", {
          status: "done",
          detail: `${result.pulled}/${result.remoteTotal}`,
        });
        ui.setResult({
          variant:
            result.remoteTotal === 0 || result.skipped > 0
              ? "warning"
              : "success",
          title: "Ready",
          body: `Signed in as ${username}\n${formatSyncSummary(result)}`,
        });
        return result;
      },
    });
  }
}
