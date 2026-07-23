import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState, type ReactNode } from "react";
import type { AuthenticatorEntryModel } from "../wasm/service.ts";
import { generateCode } from "../wasm/service.ts";
import { Brand } from "./brand.tsx";
import { renderUntilExit } from "./render.tsx";

function CodeApp({
  model,
  label,
}: {
  model: AuthenticatorEntryModel;
  label: string;
}): ReactNode {
  const { exit } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [remaining, setRemaining] = useState(0);
  const period = model.period || 30;

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const now = Math.floor(Date.now() / 1000);
      const rem = period - (now % period);
      try {
        const codes = await generateCode(model, now);
        if (cancelled) return;
        setCurrent(codes.current_code);
        setNext(codes.next_code);
        setRemaining(rem);
      } catch {
        if (!cancelled) {
          setCurrent("??????");
          setNext("??????");
        }
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), 250);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [model, period]);

  useInput((input, key) => {
    if (key.escape || input === "q") exit();
  });

  return (
    <Box flexDirection="column">
      <Brand subtitle="Code" />
      <Text>
        <Text color="cyan">{label}</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Current{" "}
          <Text bold color="green">
            {current || "……"}
          </Text>{" "}
          <Text dimColor>
            ({remaining}s / {period}s)
          </Text>
        </Text>
        <Text>
          Next <Text dimColor>{next || "……"}</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>q / Esc to close · secrets are not logged</Text>
      </Box>
    </Box>
  );
}

export async function showCodeView(options: {
  model: AuthenticatorEntryModel;
  label: string;
}): Promise<void> {
  await renderUntilExit(
    <CodeApp model={options.model} label={options.label} />,
  );
}
