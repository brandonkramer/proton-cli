import { handleCommandError } from "../util/command.ts";
import {
  actionGetAccount,
  actionGetMail,
  actionListWritableKeys,
  actionSignout,
  actionStatus,
  actionUpdateSetting,
} from "./actions.ts";
import { showHome, type TuiIntent } from "./screens.tsx";

async function handleIntent(intent: TuiIntent): Promise<"home" | "quit"> {
  switch (intent.type) {
    case "quit":
      return "quit";
    case "signout":
      await actionSignout();
      return "home";
    case "get":
      await actionGetAccount();
      return "home";
    case "mail":
      await actionGetMail();
      return "home";
    case "list-keys":
      await actionListWritableKeys();
      return "home";
    case "set":
      await actionUpdateSetting();
      return "home";
    case "status":
      await actionStatus();
      return "home";
    default:
      return "home";
  }
}

export async function launchTui(): Promise<void> {
  let next: TuiIntent | "home" | "quit" = "home";

  while (next !== "quit") {
    try {
      if (next === "home") {
        next = await showHome();
        continue;
      }
      next = await handleIntent(next);
    } catch (error) {
      await handleCommandError(error);
      next = "home";
    }
  }
}
