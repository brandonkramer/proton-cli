import { Alert, Select, Spinner, StatusMessage } from "@inkjs/ui";
import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState, type ReactNode } from "react";
import { loadLocalEntries, loadSession } from "../config/store.ts";
import { Brand } from "../ui/brand.tsx";
import { renderPrompt } from "../ui/render.tsx";

export type TuiIntent =
  | { type: "quit" }
  | { type: "signout" }
  | { type: "sync" }
  | { type: "list" }
  | { type: "code" }
  | { type: "status" };

interface HomeSnapshot {
  username: string | null;
  entryCount: number;
}

function Footer({ text }: { text: string }): ReactNode {
  return (
    <Box marginTop={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}

async function loadHomeSnapshot(): Promise<HomeSnapshot> {
  const session = await loadSession();
  const local = await loadLocalEntries();
  return {
    username: session?.username ?? null,
    entryCount: local.entries.filter((e) => e.syncState !== "PendingToDelete")
      .length,
  };
}

export async function showHome(): Promise<TuiIntent> {
  return renderPrompt<TuiIntent>(({ resolve }) => {
    function Home(): ReactNode {
      const { exit } = useApp();
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [snap, setSnap] = useState<HomeSnapshot | null>(null);

      useEffect(() => {
        void (async () => {
          try {
            setSnap(await loadHomeSnapshot());
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setLoading(false);
          }
        })();
      }, []);

      useInput((input, key) => {
        if (input === "q" || key.escape) {
          resolve({ type: "quit" });
          exit();
        }
      });

      const signedIn = Boolean(snap?.username);
      const options = [
        { label: "Sync", value: "sync" },
        { label: "List entries", value: "list" },
        { label: "Get code", value: "code" },
        { label: "Status", value: "status" },
        ...(signedIn ? [{ label: "Sign out", value: "signout" }] : []),
        { label: "Back", value: "quit" },
      ];

      return (
        <Box flexDirection="column">
          <Brand subtitle="Authenticator · ↑↓ enter · Esc/q back" />
          {loading ? <Spinner label="Loading status" /> : null}
          {error ? (
            <Alert variant="error" title="Error">
              {error}
            </Alert>
          ) : null}
          {!loading && snap ? (
            <Box flexDirection="column" marginBottom={1}>
              <StatusMessage variant={signedIn ? "success" : "warning"}>
                {signedIn
                  ? `Signed in as ${snap.username}`
                  : "Not signed in — use proton menu Sign in"}
              </StatusMessage>
              <StatusMessage
                variant={snap.entryCount > 0 ? "success" : "warning"}
              >
                {snap.entryCount > 0
                  ? `${snap.entryCount} local entries`
                  : "No local entries — sync after sign-in"}
              </StatusMessage>
            </Box>
          ) : null}
          {!loading ? (
            <Select
              visibleOptionCount={8}
              options={options}
              onChange={(value) => {
                switch (value) {
                  case "sync":
                    resolve({ type: "sync" });
                    break;
                  case "list":
                    resolve({ type: "list" });
                    break;
                  case "code":
                    resolve({ type: "code" });
                    break;
                  case "status":
                    resolve({ type: "status" });
                    break;
                  case "signout":
                    resolve({ type: "signout" });
                    break;
                  default:
                    resolve({ type: "quit" });
                }
                exit();
              }}
            />
          ) : null}
          <Footer text="Sign in from the proton menu · Esc/q back" />
        </Box>
      );
    }

    return <Home />;
  });
}
