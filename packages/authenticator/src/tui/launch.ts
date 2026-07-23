import { handleCommandError } from "../util/command.ts";
import {
  actionCode,
  actionList,
  actionSignout,
  actionStatus,
  actionSync,
} from "./actions.ts";
import { showHome, type TuiIntent } from "./screens.tsx";

async function handleIntent(intent: TuiIntent): Promise<"home" | "quit"> {
  switch (intent.type) {
    case "quit":
      return "quit";
    case "signout":
      await actionSignout();
      return "home";
    case "sync":
      await actionSync();
      return "home";
    case "list":
      await actionList();
      return "home";
    case "code":
      await actionCode();
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
