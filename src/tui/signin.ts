import {
  authenticateAuthenticator,
  clearAuthenticatorState,
} from "@bkramer/proton-authenticator";
import {
  clearAllSessions,
  dualMintSignIn,
  resolvePassLogin,
  resolvePassRefFromEnv,
  resolvePassTotp,
  type ProductId,
  type SignInCredentials,
} from "@bkramer/proton-core";
import { authenticateVpn, clearVpnSession } from "@bkramer/proton-vpn";
import { showMessage } from "./message.tsx";
import {
  inkPromptPassword,
  inkPromptText,
  inkPromptTotp,
} from "./prompts.tsx";
import { runTask } from "./task.tsx";

const PRODUCTS: ProductId[] = ["vpn", "authenticator"];

function productLabel(product: ProductId): string {
  return product === "vpn" ? "VPN" : "Authenticator";
}

async function collectBaseCredentials(): Promise<{
  credentials: SignInCredentials;
  passRef?: string;
}> {
  const passRef = resolvePassRefFromEnv();
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

async function totpForProduct(
  product: ProductId,
  passRef: string | undefined,
): Promise<string | undefined> {
  if (passRef) {
    return runTask({
      title: "Sign in",
      steps: [
        {
          id: "totp",
          label: `Reading TOTP for ${productLabel(product)} from Pass`,
        },
      ],
      run: async (ui) => {
        ui.updateStep("totp", { status: "running" });
        const totp = (await resolvePassTotp(passRef)) ?? undefined;
        ui.updateStep("totp", {
          status: totp ? "done" : "skipped",
          detail: totp ? "ok" : "none",
        });
        return totp;
      },
    });
  }

  const totp = await inkPromptTotp(
    `TOTP for ${productLabel(product)}`,
    "Each product needs its own fresh code (TOTP is single-use per API host)",
  );
  return totp || undefined;
}

async function mintProduct(
  product: ProductId,
  credentials: SignInCredentials,
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
          credentials,
          products: [product],
          authenticators: {
            vpn: authenticateVpn,
            authenticator: authenticateAuthenticator,
          },
          clearers: {
            vpn: clearVpnSession,
            authenticator: clearAuthenticatorState,
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
    // Prompt / Pass TOTP immediately before this product's mint (codes expire).
    const totp = await totpForProduct(product, passRef);
    const outcome = await mintProduct(product, { ...credentials, totp });
    if (outcome.ok) {
      succeeded.push(product);
    } else {
      failed.push({ product, error: outcome.error });
      // Match dual-mint default: roll back earlier successes.
      await clearVpnSession();
      await clearAuthenticatorState();
      await clearAllSessions();
      break;
    }
  }

  if (failed.length) {
    await showMessage({
      variant: "error",
      title: "Sign-in incomplete",
      body: `Succeeded: ${succeeded.join(", ") || "(none)"}\nFailed: ${failed
        .map((f) => `${f.product}: ${f.error}`)
        .join("; ")}`,
      holdMs: 1600,
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
