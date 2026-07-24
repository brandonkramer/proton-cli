export interface MailSettingSpec {
  path: string;
  field: string;
  isInt: boolean;
  description: string;
}

/** Friendly keys mapped to per-setting Proton PUT endpoints. */
export const MAIL_SETTING_SPECS: Readonly<Record<string, MailSettingSpec>> = {
  "page-size": {
    path: "/mail/v4/settings/pagesize",
    field: "PageSize",
    isInt: true,
    description: "messages per page (50, 100, 200)",
  },
  "view-mode": {
    path: "/mail/v4/settings/viewmode",
    field: "ViewMode",
    isInt: true,
    description: "0=conversations, 1=messages",
  },
  sign: {
    path: "/mail/v4/settings/sign",
    field: "Sign",
    isInt: true,
    description: "0=off, 1=sign outgoing",
  },
  "attach-public-key": {
    path: "/mail/v4/settings/attachpublic",
    field: "AttachPublicKey",
    isInt: true,
    description: "0/1",
  },
  "auto-save-contacts": {
    path: "/mail/v4/settings/autocontacts",
    field: "AutoSaveContacts",
    isInt: true,
    description: "0/1",
  },
  "hide-remote-images": {
    path: "/mail/v4/settings/hide-remote-images",
    field: "HideRemoteImages",
    isInt: true,
    description: "0/1",
  },
  "hide-embedded-images": {
    path: "/mail/v4/settings/hide-embedded-images",
    field: "HideEmbeddedImages",
    isInt: true,
    description: "0/1",
  },
  "draft-type": {
    path: "/mail/v4/settings/drafttype",
    field: "MIMEType",
    isInt: false,
    description: "text/html or text/plain",
  },
  "pm-signature": {
    path: "/mail/v4/settings/pmsignature",
    field: "PMSignature",
    isInt: true,
    description: "0=off, 1=on",
  },
  "show-moved": {
    path: "/mail/v4/settings/moved",
    field: "ShowMoved",
    isInt: true,
    description: "0..3",
  },
  shortcuts: {
    path: "/mail/v4/settings/shortcuts",
    field: "Shortcuts",
    isInt: true,
    description: "0/1",
  },
  "sticky-labels": {
    path: "/mail/v4/settings/stickylabels",
    field: "StickyLabels",
    isInt: true,
    description: "0/1",
  },
  "prompt-pin": {
    path: "/mail/v4/settings/promptpin",
    field: "PromptPin",
    isInt: true,
    description: "0/1",
  },
  "enable-folder-color": {
    path: "/mail/v4/settings/enablefoldercolor",
    field: "EnableFolderColor",
    isInt: true,
    description: "0/1",
  },
  "delay-send": {
    path: "/mail/v4/settings/delaysend",
    field: "DelaySendSeconds",
    isInt: true,
    description: "seconds (0-20)",
  },
  "almost-all-mail": {
    path: "/mail/v4/settings/almost-all-mail",
    field: "AlmostAllMail",
    isInt: true,
    description: "0/1",
  },
};

export function listWritableMailKeys(): string[] {
  return Object.keys(MAIL_SETTING_SPECS).sort();
}

export function parseMailSettingValue(
  key: string,
  value: string,
): Record<string, string | number> {
  const spec = MAIL_SETTING_SPECS[key];
  if (!spec) {
    throw new Error(`unknown setting ${JSON.stringify(key)}`);
  }

  if (spec.isInt) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || String(parsed) !== value.trim()) {
      throw new Error(`setting ${JSON.stringify(key)} expects an integer value`);
    }
    validateMailSettingRange(key, parsed);
    return { [spec.field]: parsed };
  }

  return { [spec.field]: value };
}

function validateMailSettingRange(key: string, value: number): void {
  if (key === "view-mode" && value !== 0 && value !== 1) {
    throw new Error(
      `setting ${JSON.stringify(key)} expects 0 (conversations) or 1 (messages)`,
    );
  }
  if (key === "delay-send" && (value < 0 || value > 20)) {
    throw new Error(
      `setting ${JSON.stringify(key)} expects seconds in range 0–20`,
    );
  }
}
