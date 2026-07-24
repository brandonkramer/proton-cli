import { resolvePassLogin } from "@bkramer/proton-core";

export async function resolveAccountPassword(options: {
  password?: string;
  pass?: string;
}): Promise<string> {
  if (options.password) return options.password;

  const fromEnv =
    process.env.PROTON_PASSWORD ??
    process.env.PROTON_PASS ??
    process.env.PROTONVPN_PASS;
  if (fromEnv) {
    if (fromEnv.startsWith("pass://") || !fromEnv.includes("@")) {
      const login = await resolvePassLogin(fromEnv);
      if (login.password) return login.password;
    }
    return fromEnv;
  }

  if (options.pass) {
    const login = await resolvePassLogin(options.pass);
    if (login.password) return login.password;
  }

  throw new Error(
    "Account password required. Use --password, --pass pass://Vault/Item, or set PROTON_PASSWORD.",
  );
}
