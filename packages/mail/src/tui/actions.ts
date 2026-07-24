import { configDir } from "../config/paths.ts";
import { loadSession } from "../proton/auth.ts";
import { signOut } from "../proton/auth.ts";
import { showMessage } from "../ui/message.tsx";
import { showStatus } from "../ui/status-view.tsx";

export async function actionSignout(): Promise<void> {
  await signOut();
  await showMessage({
    variant: "success",
    title: "Signed out",
    body: "Mail session cleared.",
    holdMs: 700,
  });
}

export async function actionStatus(): Promise<void> {
  const session = await loadSession();

  await showStatus({
    signedIn: Boolean(session),
    username: session?.username,
    configDir: configDir(),
  });
}
