import { handleCommandError } from "../util/command.ts";
import {
  actionDoctor,
  actionInbox,
  actionSendInfo,
  actionSetup,
  actionStatus,
} from "./actions.ts";
import { showHome, type TuiIntent } from "./screens.tsx";

async function handleIntent(intent: TuiIntent): Promise<"home" | "quit"> {
  switch (intent.type) {
    case "quit":
      return "quit";
    case "setup":
      await actionSetup();
      return "home";
    case "doctor":
      await actionDoctor();
      return "home";
    case "status":
      await actionStatus();
      return "home";
    case "inbox":
      await actionInbox();
      return "home";
    case "send-info":
      await actionSendInfo();
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
