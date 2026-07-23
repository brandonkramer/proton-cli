import {
  launchAuthTui,
  signOutAuthenticator,
} from "@bkramer/proton-authenticator";
import { clearAllSessions } from "@bkramer/proton-core";
import { launchVpnTui, signOutVpn } from "@bkramer/proton-vpn";
import { showMessage } from "./message.tsx";
import { showParentHome, type ParentIntent } from "./screens.tsx";
import { runParentSignin } from "./signin.ts";

async function handleIntent(
  intent: ParentIntent,
): Promise<ParentIntent | "home" | "quit"> {
  switch (intent.type) {
    case "quit":
      return "quit";
    case "vpn":
      await launchVpnTui();
      return "home";
    case "auth":
      await launchAuthTui();
      return "home";
    case "signin":
      await runParentSignin();
      return "home";
    case "signout":
      await signOutVpn();
      await signOutAuthenticator();
      await clearAllSessions();
      await showMessage({
        variant: "success",
        title: "Signed out",
        body: "VPN and Authenticator sessions cleared.",
        holdMs: 800,
      });
      return "home";
    default:
      return "home";
  }
}

/** Unified interactive menu opened by bare `proton` on a TTY. */
export async function launchParentTui(): Promise<void> {
  let next: ParentIntent | "home" | "quit" = "home";

  while (next !== "quit") {
    try {
      if (next === "home") {
        next = await showParentHome();
        continue;
      }
      next = await handleIntent(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await showMessage({
        variant: "error",
        title: "Error",
        body: message,
        holdMs: 1400,
      });
      next = "home";
    }
  }
}
