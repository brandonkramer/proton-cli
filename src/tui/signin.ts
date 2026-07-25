import {
  authenticateAuthenticator,
  clearAuthenticatorState,
} from "@bkramer/proton-authenticator";
import { authenticateCalendar, clearCalendarState } from "@bkramer/proton-calendar";
import { authenticateContacts, clearContactsState } from "@bkramer/proton-contacts";
import {
  dualMintSignIn,
  PRODUCTS,
  resolveFreshPassTotp,
  resolvePassLogin,
  resolvePassRef,
  saveAccount,
  type ProductId,
  type SignInCredentials,
} from "@bkramer/proton-core";
import { authenticateMail, clearMailState } from "@bkramer/proton-mail";
import { authenticateSettings, clearSettingsState } from "@bkramer/proton-settings";
import { authenticateDrive, clearDriveState } from "@bkramer/proton-drive";
import { authenticateVpn, clearVpnSession } from "@bkramer/proton-vpn";
import { showMessage } from "./message.tsx";
import {
  inkPromptPassword,
  inkPromptText,
  inkPromptTotp,
} from "./prompts.tsx";
import { runTask } from "./task.tsx";

function productLabel(product: ProductId): string {
  switch (product) {
    case "vpn":
      return "VPN";
    case "authenticator":
      return "Authenticator";
    case "drive":
      return "Drive";
    case "calendar":
      return "Calendar";
    case "contacts":
      return "Contacts";
    case "settings":
      return "Settings";
    case "mail":
      return "Mail";
  }
}

async function collectBaseCredentials(): Promise<{
  credentials: SignInCredentials;
  passRef?: string;
}> {
  const passRef = await resolvePassRef();
  if (passRef) {
    const login = await runTask({
      title: "Sign in",
      steps: [{ id: "pass", label: "Reading credentials from Proton Pass" }],
      note: passRef,
      run: async (ui) => {
        ui.updateStep("pass", { status: "running" });
        const fields = await resolvePassLogin(passRef);
        ui.updateStep("pass", {
          status: "done",
          detail: fields.username,
        });
        return fields;
      },
    });
    return {
      passRef,
      credentials: {
        username: login.username,
        password: login.password,
      },
    };
  }

  const username = await inkPromptText("Username / email");
  const password = await inkPromptPassword("Password");
  return { credentials: { username, password } };
}

async function mintProduct(
  product: ProductId,
  credentials: SignInCredentials,
  passRef?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await runTask({
      title: "Sign in",
      steps: [
        {
          id: product,
          label: `Signing in to ${productLabel(product)}`,
        },
      ],
      note: "Contacting Proton API…",
      run: async (ui) => {
        ui.updateStep(product, { status: "running" });
        const result = await dualMintSignIn({
          credentials: {
            ...credentials,
            refreshTotp: async (previous?: string) => {
              if (passRef) {
                ui.setNote("Unlocking 2FA — fetching fresh TOTP from Pass…");
                const fromPass = await resolveFreshPassTotp(passRef, {
                  avoidCode: previous ?? credentials.totp,
                });
                if (fromPass) return fromPass;
              }
              return (
                (await inkPromptTotp(
                  `TOTP for ${productLabel(product)}`,
                  "Enter a fresh authenticator code to finish sign-in",
                )) || undefined
              );
            },
          },
          products: [product],
          authenticators: {
            vpn: authenticateVpn,
            authenticator: authenticateAuthenticator,
            drive: authenticateDrive,
            calendar: authenticateCalendar,
            contacts: authenticateContacts,
            settings: authenticateSettings,
            mail: authenticateMail,
          },
          clearers: {
            vpn: clearVpnSession,
            authenticator: clearAuthenticatorState,
            drive: clearDriveState,
            calendar: clearCalendarState,
            contacts: clearContactsState,
            settings: clearSettingsState,
            mail: clearMailState,
          },
          partialOk: false,
        });
        if (result.failed.length) {
          const err = result.failed[0]?.error ?? "unknown error";
          ui.updateStep(product, { status: "error", detail: err });
          throw new Error(err);
        }
        ui.updateStep(product, { status: "done" });
        await Bun.sleep(350);
      },
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Interactive shared sign-in (dual-mint) for the parent TUI. */
export async function runParentSignin(): Promise<void> {
  const { credentials, passRef } = await collectBaseCredentials();
  const succeeded: ProductId[] = [];
  const failed: Array<{ product: ProductId; error: string }> = [];

  for (const product of PRODUCTS) {
    // Do not attach TOTP to /auth — CAPTCHA + TwoFactorCode on the same
    // password request often fails post-HV with 8002. Fetch TOTP only when
    // upgrading a twofactor-limited session (see refreshTotp in mintProduct).
    const outcome = await mintProduct(product, credentials, passRef);
    if (outcome.ok) {
      succeeded.push(product);
    } else {
      // Keep earlier successes — CAPTCHA / HV on one API host must not wipe
      // sessions already minted for other products. Continue so remaining
      // products can still sign in.
      failed.push({ product, error: outcome.error });
    }
  }

  if (succeeded.length > 0) {
    await saveAccount(credentials.username, succeeded);
  }

  if (failed.length && succeeded.length === 0) {
    await showMessage({
      variant: "error",
      title: "Sign-in failed",
      body: failed.map((f) => `${f.product}: ${f.error}`).join("\n"),
      holdMs: 1800,
    });
    return;
  }

  if (failed.length) {
    await showMessage({
      variant: "warning",
      title: "Sign-in partial",
      body:
        `Kept: ${succeeded.join(", ")}\n` +
        `Failed: ${failed.map((f) => `${f.product}: ${f.error}`).join("; ")}\n` +
        `Retry failed products later (e.g. proton signin --products drive --partial-ok).`,
      holdMs: 2200,
    });
    return;
  }

  await showMessage({
    variant: "success",
    title: "Signed in",
    body: `Sessions minted for ${succeeded.join(", ")}.`,
    holdMs: 900,
  });
}
