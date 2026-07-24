export {
  connectSmtpFromStore,
  createSmtpTransport,
  resolveFromAddress,
  sendViaTransport,
  smtpTransportOptions,
  withSmtpSession,
} from "./client.ts";
export {
  buildForwardMail,
  buildReplyMail,
  buildSendMail,
  toNodemailerOptions,
  type OutgoingAttachment,
  type OutgoingMailPreview,
  type SendInput,
} from "./compose.ts";
export {
  deliverForward,
  deliverMail,
  deliverReply,
  deliverSend,
  type DeliverMailOptions,
  type DeliverMailResult,
} from "./send.ts";
