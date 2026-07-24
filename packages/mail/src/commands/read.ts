import type { Command } from "commander";
import { requireMailRuntime } from "../context.ts";
import { getAndDecryptMessage } from "../service/messages.ts";
import { emitOk, isDryRun, wantsJson } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";
import { resolveAccountPassword } from "../util/password.ts";

export async function runMailRead(
  messageId: string,
  options: { passRef?: string; password?: string },
): Promise<void> {
  if (isDryRun()) {
    emitOk({
      dryRun: true,
      action: "read",
      messageId,
    });
    return;
  }

  const runtime = await requireMailRuntime({
    passRef: options.passRef,
    unlockKeys: true,
  });
  const password = await resolveAccountPassword({ passRef: options.passRef });

  const message = await getAndDecryptMessage({
    session: runtime.session,
    messageId,
    password,
    addressKeys: runtime.addressKeys,
  });

  if (wantsJson()) {
    emitOk({
      action: "read",
      message,
    });
    return;
  }

  process.stdout.write(`Subject: ${message.subject}\n`);
  const from = message.senderName
    ? `${message.senderName} <${message.senderEmail}>`
    : message.senderEmail;
  process.stdout.write(`From:    ${from}\n`);
  if (message.to.length > 0) {
    process.stdout.write(`To:      ${message.to.join(", ")}\n`);
  }
  if (message.cc.length > 0) {
    process.stdout.write(`Cc:      ${message.cc.join(", ")}\n`);
  }
  process.stdout.write(`Time:    ${new Date(message.time * 1000).toISOString()}\n`);
  process.stdout.write(`ID:      ${message.id}\n`);
  process.stdout.write("\n");
  process.stdout.write(`${message.body}\n`);
}

export function registerRead(mail: Command): void {
  mail
    .command("read")
    .description("Read and decrypt a message by ID")
    .argument("<id>", "Message ID")
    .option("--password <password>", "Account password (or PROTON_PASSWORD)")
    .option("--dry-run", "Print planned read without calling the API")
    .action(async function (
      this: Command,
      messageId: string,
      options: { password?: string },
    ) {
      try {
        const globals = this.parent?.optsWithGlobals() as { pass?: string } | undefined;
        if (options.password) {
          process.env.PROTON_PASSWORD = options.password;
        }
        await runMailRead(messageId, { passRef: globals?.pass });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
