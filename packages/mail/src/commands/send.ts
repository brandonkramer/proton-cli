import type { Command } from "commander";
import { requireMailRuntime } from "../context.ts";
import {
  sendMail,
  type ComposeInput,
  type SendPlan,
  type SendResult,
} from "../service/send.ts";
import { emitOk, emitPlain, isDryRun, wantsJson } from "../util/agent.ts";
import { reportCommandError } from "../util/errors.ts";
import { resolveAccountPassword } from "../util/password.ts";
import type { ComposeAction } from "../crypto/mime.ts";

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function printSendResult(result: SendPlan | SendResult): void {
  if ("dryRun" in result && result.dryRun) {
    if (wantsJson()) {
      emitOk({ ...result });
      return;
    }
    emitPlain(
      `dry-run: would ${result.action} subject=${JSON.stringify(result.subject)} to=${result.to.join(",") || "(none)"} (encrypt body, no POST)`,
    );
    return;
  }

  if (wantsJson()) {
    emitOk({ ...result });
    return;
  }
  emitPlain(`Sent ${result.messageId}: ${result.subject}`);
}

async function runCompose(
  action: ComposeAction,
  options: {
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
    html?: boolean;
    attach?: string[];
    messageId?: string;
    passRef?: string;
  },
): Promise<void> {
  const input: ComposeInput = {
    action,
    to: options.to,
    cc: options.cc,
    bcc: options.bcc,
    subject: options.subject,
    body: options.body,
    html: options.html,
    attach: options.attach,
    messageId: options.messageId,
  };

  if (isDryRun()) {
    const result = await sendMail(input, {
      session: {
        Code: 1000,
        AccessToken: "",
        RefreshToken: "",
        TokenType: "Bearer",
        Scopes: [],
        UID: "",
        UserID: "",
        ExpiresIn: 0,
      },
    });
    printSendResult(result);
    return;
  }

  const runtime = await requireMailRuntime({
    passRef: options.passRef,
    unlockKeys: true,
  });
  const password = await resolveAccountPassword({ passRef: options.passRef });

  const result = await sendMail(input, {
    session: runtime.session,
    password,
    addressKeys: runtime.addressKeys,
    addresses: runtime.addresses,
  });
  printSendResult(result);
}

export function registerSend(mail: Command): void {
  mail
    .command("send")
    .description("Encrypt and send a message")
    .requiredOption("--to <email>", "Recipient (repeatable)", collect, [])
    .option("--cc <email>", "Cc recipient (repeatable)", collect, [])
    .option("--bcc <email>", "Bcc recipient (repeatable)", collect, [])
    .requiredOption("--subject <text>", "Subject line")
    .option("--body <text>", "Plain or HTML body", "")
    .option("--html", "Treat body as text/html")
    .option("--attach <path>", "Attachment path (repeatable; dry-run only for now)", collect, [])
    .option("--dry-run", "Plan encrypt+send without any network POST")
    .action(async function (
      this: Command,
      options: {
        to: string[];
        cc: string[];
        bcc: string[];
        subject: string;
        body?: string;
        html?: boolean;
        attach: string[];
      },
    ) {
      try {
        const globals = this.parent?.optsWithGlobals() as { pass?: string } | undefined;
        await runCompose("send", { ...options, passRef: globals?.pass });
      } catch (error) {
        reportCommandError(error);
      }
    });

  mail
    .command("reply")
    .description("Reply to a message (encrypt + send)")
    .argument("<id>", "Message ID to reply to")
    .option("--to <email>", "Override To (repeatable)", collect, [])
    .option("--cc <email>", "Cc recipient (repeatable)", collect, [])
    .option("--bcc <email>", "Bcc recipient (repeatable)", collect, [])
    .option("--subject <text>", "Override subject (default: Re: …)")
    .option("--body <text>", "Reply body prefix", "")
    .option("--all", "Reply-all")
    .option("--html", "Treat body as text/html")
    .option("--dry-run", "Plan encrypt+send without any network POST")
    .action(async function (
      this: Command,
      messageId: string,
      options: {
        to: string[];
        cc: string[];
        bcc: string[];
        subject?: string;
        body?: string;
        all?: boolean;
        html?: boolean;
      },
    ) {
      try {
        const globals = this.parent?.optsWithGlobals() as { pass?: string } | undefined;
        await runCompose(options.all ? "reply-all" : "reply", {
          ...options,
          messageId,
          passRef: globals?.pass,
        });
      } catch (error) {
        reportCommandError(error);
      }
    });

  mail
    .command("forward")
    .description("Forward a message (encrypt + send)")
    .argument("<id>", "Message ID to forward")
    .requiredOption("--to <email>", "Recipient (repeatable)", collect, [])
    .option("--cc <email>", "Cc recipient (repeatable)", collect, [])
    .option("--bcc <email>", "Bcc recipient (repeatable)", collect, [])
    .option("--subject <text>", "Override subject (default: Fwd: …)")
    .option("--body <text>", "Forward body prefix", "")
    .option("--html", "Treat body as text/html")
    .option("--dry-run", "Plan encrypt+send without any network POST")
    .action(async function (
      this: Command,
      messageId: string,
      options: {
        to: string[];
        cc: string[];
        bcc: string[];
        subject?: string;
        body?: string;
        html?: boolean;
      },
    ) {
      try {
        const globals = this.parent?.optsWithGlobals() as { pass?: string } | undefined;
        await runCompose("forward", {
          ...options,
          messageId,
          passRef: globals?.pass,
        });
      } catch (error) {
        reportCommandError(error);
      }
    });
}
