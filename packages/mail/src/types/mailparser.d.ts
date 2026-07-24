declare module "mailparser" {
  export interface AddressObject {
    value?: Array<{ name?: string; address?: string }>;
    html?: string;
    text?: string;
  }

  export interface ParsedMail {
    subject?: string;
    from?: AddressObject;
    to?: AddressObject;
    cc?: AddressObject;
    date?: Date;
    text?: string;
    html?: string | false | Buffer;
    messageId?: string;
    inReplyTo?: string;
    references?: string | string[];
  }

  export function simpleParser(source: Buffer | NodeJS.ReadableStream): Promise<ParsedMail>;
}
