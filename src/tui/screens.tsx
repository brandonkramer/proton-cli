import {
  listSavedSessions,
  loadAccount,
  PRODUCTS,
  type ProductId,
} from "@bkramer/proton-core";
import { Alert, Select, Spinner, StatusMessage } from "@inkjs/ui";
import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState, type ReactNode } from "react";
import { Brand } from "./brand.tsx";
import { renderPrompt } from "./render.tsx";

export type ParentIntent =
  | { type: "quit" }
  | { type: "vpn" }
  | { type: "auth" }
  | { type: "contacts" }
  | { type: "calendar" }
  | { type: "drive" }
  | { type: "signin" }
  | { type: "signout" };

interface HomeSnapshot {
  username: string | null;
  products: Record<ProductId, { signedIn: boolean; username?: string }>;
}

async function loadHomeSnapshot(): Promise<HomeSnapshot> {
  const account = await loadAccount();
  const sessions = await listSavedSessions();
  const products = Object.fromEntries(
    PRODUCTS.map((product) => {
      const saved = sessions.find((s) => s.product === product);
      return [
        product,
        saved
          ? { signedIn: true, username: saved.username }
          : { signedIn: false },
      ];
    }),
  ) as HomeSnapshot["products"];

  return {
    username: account?.username ?? sessions[0]?.username ?? null,
    products,
  };
}

export async function showParentHome(): Promise<ParentIntent> {
  return renderPrompt<ParentIntent>(({ resolve }) => {
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

      const anySignedIn = Boolean(
        snap &&
          (snap.products.vpn.signedIn ||
            snap.products.authenticator.signedIn ||
            snap.products.contacts.signedIn ||
            snap.products.calendar.signedIn ||
            snap.products.drive.signedIn),
      );

      const options = [
        { label: "VPN", value: "vpn" },
        { label: "Authenticator", value: "auth" },
        { label: "Contacts", value: "contacts" },
        { label: "Calendar", value: "calendar" },
        { label: "Drive", value: "drive" },
        ...(anySignedIn
          ? [{ label: "Sign out (all products)", value: "signout" }]
          : [{ label: "Sign in (all products)", value: "signin" }]),
        { label: "Quit", value: "quit" },
      ];

      return (
        <Box flexDirection="column">
          <Brand subtitle="Interactive mode · ↑↓ enter · q quit" />
          {loading ? <Spinner label="Loading status" /> : null}
          {error ? (
            <Alert variant="error" title="Error">
              {error}
            </Alert>
          ) : null}
          {!loading && snap ? (
            <Box flexDirection="column" marginBottom={1}>
              <StatusMessage variant={snap.username ? "success" : "warning"}>
                {snap.username
                  ? `Account: ${snap.username}`
                  : "Not signed in"}
              </StatusMessage>
              <StatusMessage
                variant={snap.products.vpn.signedIn ? "success" : "warning"}
              >
                VPN:{" "}
                {snap.products.vpn.signedIn
                  ? `signed in (${snap.products.vpn.username})`
                  : "not signed in"}
              </StatusMessage>
              <StatusMessage
                variant={
                  snap.products.authenticator.signedIn ? "success" : "warning"
                }
              >
                Authenticator:{" "}
                {snap.products.authenticator.signedIn
                  ? `signed in (${snap.products.authenticator.username})`
                  : "not signed in"}
              </StatusMessage>
              <StatusMessage
                variant={snap.products.contacts.signedIn ? "success" : "warning"}
              >
                Contacts:{" "}
                {snap.products.contacts.signedIn
                  ? `signed in (${snap.products.contacts.username})`
                  : "not signed in"}
              </StatusMessage>
              <StatusMessage
                variant={snap.products.calendar.signedIn ? "success" : "warning"}
              >
                Calendar:{" "}
                {snap.products.calendar.signedIn
                  ? `signed in (${snap.products.calendar.username})`
                  : "not signed in"}
              </StatusMessage>
              <StatusMessage
                variant={snap.products.drive.signedIn ? "success" : "warning"}
              >
                Drive:{" "}
                {snap.products.drive.signedIn
                  ? `signed in (${snap.products.drive.username})`
                  : "not signed in"}
              </StatusMessage>
            </Box>
          ) : null}
          {!loading ? (
            <Select
              visibleOptionCount={8}
              options={options}
              onChange={(value) => {
                switch (value) {
                  case "vpn":
                    resolve({ type: "vpn" });
                    break;
                  case "auth":
                    resolve({ type: "auth" });
                    break;
                  case "contacts":
                    resolve({ type: "contacts" });
                    break;
                  case "calendar":
                    resolve({ type: "calendar" });
                    break;
                  case "drive":
                    resolve({ type: "drive" });
                    break;
                  case "signin":
                    resolve({ type: "signin" });
                    break;
                  case "signout":
                    resolve({ type: "signout" });
                    break;
                  case "quit":
                    resolve({ type: "quit" });
                    break;
                  default:
                    resolve({ type: "quit" });
                }
                exit();
              }}
            />
          ) : null}
          <Box marginTop={1}>
            <Text dimColor>
              Tip: use `proton status --json` / `proton vpn …` / `proton auth …` /
              `proton contacts …` / `proton calendar …` / `proton drive …` for scripting
            </Text>
          </Box>
        </Box>
      );
    }

    return <Home />;
  });
}
