import { afterEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

const runCalls: { command: string; args: string[] }[] = [];

mock.module("node:child_process", () => {
  return {
    spawn: (command: string, args: string[]) => {
      runCalls.push({ command, args });
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        const joined = args.join(" ");
        if (joined.includes("which") || joined.includes("where")) {
          child.emit("close", 0);
          return;
        }
        if (args.includes("up")) {
          child.stderr.emit(
            "data",
            Buffer.from("wg-quick: `protonvpn' already exists\n"),
          );
          // Use non-1 exit so runWgQuick does not classify this as a sudo password failure.
          child.emit("close", 2);
          return;
        }
        if (args.includes("down")) {
          child.stderr.emit(
            "data",
            Buffer.from("wg-quick: `protonvpn' is not a WireGuard interface\n"),
          );
          child.emit("close", 2);
          return;
        }
        child.emit("close", 0);
      });
      return child;
    },
  };
});

const { bringUp, bringDown } = await import("../src/wireguard/manager.ts");

describe("wireguard reconnect semantics", () => {
  afterEach(() => {
    runCalls.length = 0;
  });

  test("bringUp does not treat already-exists as success", async () => {
    if (process.platform === "win32") return;
    await expect(bringUp("/tmp/protonvpn.conf")).rejects.toThrow(/already exists/i);
  });

  test("bringDown suppresses not-present", async () => {
    if (process.platform === "win32") return;
    await expect(bringDown("/tmp/protonvpn.conf")).resolves.toBeUndefined();
  });
});
