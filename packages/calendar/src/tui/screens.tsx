import { Alert, Select, Spinner, StatusMessage } from "@inkjs/ui";
import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState, type ReactNode } from "react";
import { loadSession } from "../proton/auth.ts";
import { Brand } from "../ui/brand.tsx";
import { renderPrompt } from "../ui/render.tsx";

export type TuiIntent =
  | { type: "quit" }
  | { type: "signout" }
  | { type: "calendars" }
  | { type: "events" }
  | { type: "status" };

interface HomeSnapshot {
  username: string | null;
  signedIn: boolean;
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
  return {
    username: session?.username ?? null,
    signedIn: Boolean(session),
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

      const signedIn = Boolean(snap?.signedIn);
      const options = [
        { label: "List calendars", value: "calendars" },
        { label: "List events", value: "events" },
        { label: "Status", value: "status" },
        ...(signedIn ? [{ label: "Sign out", value: "signout" }] : []),
        { label: "Back", value: "quit" },
      ];

      return (
        <Box flexDirection="column">
          <Brand subtitle="Calendar · ↑↓ enter · Esc/q back" />
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
            </Box>
          ) : null}
          {!loading ? (
            <Select
              visibleOptionCount={8}
              options={options}
              onChange={(value) => {
                switch (value) {
                  case "calendars":
                    resolve({ type: "calendars" });
                    break;
                  case "events":
                    resolve({ type: "events" });
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
          <Footer text="Sign in from the proton menu · Esc/q back · CLI: `proton calendar …`" />
        </Box>
      );
    }

    return <Home />;
  });
}
