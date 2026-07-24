import {
  launchAuthTui,
  signOutAuthenticator,
} from "@bkramer/proton-authenticator";
import {
  launchContactsTui,
  signOutContacts,
} from "@bkramer/proton-contacts";
import {
  launchCalendarTui,
  signOutCalendar,
} from "@bkramer/proton-calendar";
import {
  launchDriveTui,
  signOutDrive,
} from "@bkramer/proton-drive";
import {
  launchSettingsTui,
  signOutSettings,
} from "@bkramer/proton-settings";
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
    case "contacts":
      await launchContactsTui();
      return "home";
    case "calendar":
      await launchCalendarTui();
      return "home";
    case "drive":
      await launchDriveTui();
      return "home";
    case "settings":
      await launchSettingsTui();
      return "home";
    case "signin":
      await runParentSignin();
      return "home";
    case "signout":
      await signOutVpn();
      await signOutAuthenticator();
      await signOutContacts();
      await signOutCalendar();
      await signOutDrive();
      await signOutSettings();
      await clearAllSessions();
      await showMessage({
        variant: "success",
        title: "Signed out",
        body: "VPN, Authenticator, Contacts, Calendar, Drive, and Settings sessions cleared.",
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
