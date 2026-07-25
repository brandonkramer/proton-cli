import {
  resolvePassLogin,
  resolvePassRef,
} from "@bkramer/proton-core";

export async function resolveAccountPassword(options: {
  password?: string;
  pass?: string;
}): Promise<string> {
  if (options.password) return options.password;

  const fromEnv = process.env.PROTON_PASSWORD?.trim();
  if (fromEnv) return fromEnv;

  const passRef = await resolvePassRef(options.pass);
  if (passRef) {
    const login = await resolvePassLogin(passRef);
    if (login.password) return login.password;
  }

  throw new Error(
    "Account password required. Use --password, --pass pass://Vault/Item, or `proton account`.",
  );
}
