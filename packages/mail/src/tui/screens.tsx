import { Alert, Select, Spinner, StatusMessage } from "@inkjs/ui";
import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState, type ReactNode } from "react";
import { Brand } from "../ui/brand.tsx";
import { renderPrompt } from "../ui/render.tsx";
import { loadHomeSnapshot } from "./actions.ts";

export type TuiIntent =
  | { type: "quit" }
  | { type: "setup" }
  | { type: "doctor" }
  | { type: "status" }
  | { type: "inbox" }
  | { type: "send-info" };

function Footer({ text }: { text: string }): ReactNode {
  return (
    <Box marginTop={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}

export async function showHome(): Promise<TuiIntent> {
  return renderPrompt<TuiIntent>(({ resolve }) => {
    function Home(): ReactNode {
      const { exit } = useApp();
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [snap, setSnap] = useState<Awaited<
        ReturnType<typeof loadHomeSnapshot>
      > | null>(null);

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

      const options = [
        { label: "Setup", value: "setup" },
        { label: "Doctor", value: "doctor" },
        { label: "Status", value: "status" },
        { label: "Inbox", value: "inbox" },
        { label: "Send (CLI)", value: "send-info" },
        { label: "Back", value: "quit" },
      ];

      return (
        <Box flexDirection="column">
          <Brand subtitle="Mail · ↑↓ enter · Esc/q back" />
          {loading ? <Spinner label="Loading status" /> : null}
          {error ? (
            <Alert variant="error" title="Error">
              {error}
            </Alert>
          ) : null}
          {!loading && snap ? (
            <Box flexDirection="column" marginBottom={1}>
              <StatusMessage variant={snap.ok ? "success" : "warning"}>
                {snap.ok
                  ? `Ready · ${snap.username ?? "configured"}`
                  : snap.configured
                    ? "Configured — password or Bridge missing"
                    : "Not configured — run Setup or `proton mail setup`"}
              </StatusMessage>
              <StatusMessage variant={snap.password.configured ? "success" : "warning"}>
                Password:{" "}
                {snap.password.configured
                  ? snap.password.source
                  : "missing (PROTONMAIL_PASSWORD / Pass / file)"}
              </StatusMessage>
            </Box>
          ) : null}
          {!loading ? (
            <Select
              visibleOptionCount={8}
              options={options}
              onChange={(value) => {
                switch (value) {
                  case "setup":
                    resolve({ type: "setup" });
                    break;
                  case "doctor":
                    resolve({ type: "doctor" });
                    break;
                  case "status":
                    resolve({ type: "status" });
                    break;
                  case "inbox":
                    resolve({ type: "inbox" });
                    break;
                  case "send-info":
                    resolve({ type: "send-info" });
                    break;
                  default:
                    resolve({ type: "quit" });
                }
                exit();
              }}
            />
          ) : null}
          <Footer text="Bridge password ≠ account password · Esc/q back" />
        </Box>
      );
    }

    return <Home />;
  });
}
