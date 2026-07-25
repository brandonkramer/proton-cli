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

/** Interactive shared sign-in (dual-mint) for the parent TUI. */
export async function runParentSignin(): Promise<void> {
  const { credentials, passRef } = await collectBaseCredentials();

  const result = await runTask({
    title: "Sign in",
    steps: PRODUCTS.map((product) => ({
      id: product,
      label: `Signing in to ${productLabel(product)}`,
      status: "pending" as const,
    })),
    note: "Password first, then Pass TOTP for 2FA. mail-api sessions are shared.",
    run: async (ui) => {
      // Proton rejects reusing the same TOTP across product logins in one window.
      let lastTotp: string | undefined = credentials.totp;
      return dualMintSignIn({
        credentials: {
          ...credentials,
          refreshTotp: async (previous?: string) => {
            const avoid = previous ?? lastTotp;
            if (passRef) {
              ui.setNote(
                avoid
                  ? "Waiting for next Pass TOTP (previous code already used)…"
                  : "Unlocking 2FA — fetching TOTP from Pass…",
              );
              const fromPass = await resolveFreshPassTotp(passRef, {
                avoidCode: avoid,
              });
              if (fromPass) {
                lastTotp = fromPass;
                return fromPass;
              }
            }
            const typed =
              (await inkPromptTotp(
                "TOTP to finish sign-in",
                "Enter a fresh authenticator code (do not reuse the last one)",
              )) || undefined;
            if (typed) lastTotp = typed;
            return typed;
          },
        },
        products: [...PRODUCTS],
        partialOk: true,
        productGapMs: 0,
        rateLimitRetries: 1,
        rateLimitWaitMs: 45_000,
        onProgress: (event) => {
          switch (event.type) {
            case "start":
              ui.updateStep(event.product, { status: "running" });
              ui.setNote(`Contacting ${productLabel(event.product)} API…`);
              break;
            case "done":
              ui.updateStep(event.product, {
                status: "done",
                detail: event.detail,
              });
              break;
            case "shared":
              ui.updateStep(event.product, {
                status: "done",
                detail: `shared with ${event.from}`,
              });
              break;
            case "error":
              ui.updateStep(event.product, {
                status: "error",
                detail: event.error,
              });
              break;
            case "wait":
              ui.setNote(event.message);
              break;
          }
        },
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
      });
    },
  });

  if (result.failed.length && result.succeeded.length === 0) {
    await showMessage({
      variant: "error",
      title: "Sign-in failed",
      body: result.failed.map((f) => `${f.product}: ${f.error}`).join("\n"),
      holdMs: 1800,
    });
    return;
  }

  if (result.failed.length) {
    const failedList = result.failed.map((f) => f.product).join(",");
    await showMessage({
      variant: "warning",
      title: "Sign-in partial",
      body:
        `Kept: ${result.succeeded.join(", ")}\n` +
        `Failed: ${result.failed.map((f) => `${f.product}: ${f.error}`).join("; ")}\n` +
        `Retry later: proton signin --products ${failedList} --partial-ok`,
      holdMs: 2400,
    });
    return;
  }

  await showMessage({
    variant: "success",
    title: "Signed in",
    body: `Sessions minted for ${result.succeeded.join(", ")}.`,
    holdMs: 900,
  });
}
