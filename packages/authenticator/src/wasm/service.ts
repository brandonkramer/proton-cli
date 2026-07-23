import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type {
  AuthenticatorEntryModel,
  WasmAuthenticatorCodeResponse,
} from "@protontech/authenticator-rust-core/worker";

type WasmModule = typeof import("@protontech/authenticator-rust-core/worker");

let wasm: WasmModule | null = null;
let loading: Promise<WasmModule> | null = null;

/**
 * Bun's `import *.wasm` does not instantiate wasm-bindgen modules correctly.
 * Manually instantiate with the glue imports, then use the package exports.
 */
async function initWasm(): Promise<WasmModule> {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve(
    "@protontech/authenticator-rust-core/package.json",
  );
  const workerDir = join(dirname(pkgJson), "worker");
  const gluePath = join(workerDir, "proton_authenticator_web_bg.js");
  const wasmPath = join(workerDir, "proton_authenticator_web_bg.wasm");

  const bg = (await import(gluePath)) as {
    __wbg_set_wasm: (exports: object) => void;
  } & WasmModule;

  const bytes = await Bun.file(wasmPath).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {
    "./proton_authenticator_web_bg.js": bg,
  });
  bg.__wbg_set_wasm(instance.exports);

  // Re-export surface matches `@protontech/authenticator-rust-core/worker`.
  return bg;
}

export async function loadWasm(): Promise<WasmModule> {
  if (wasm) return wasm;
  if (!loading) {
    loading = initWasm()
      .then((mod) => {
        wasm = mod;
        return mod;
      })
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

export async function generateKey(): Promise<Uint8Array> {
  const mod = await loadWasm();
  return mod.generate_key();
}

export async function decryptEntries(
  encrypted: Uint8Array[],
  key: Uint8Array,
): Promise<AuthenticatorEntryModel[]> {
  const mod = await loadWasm();
  return mod.decrypt_entries(encrypted, key);
}

export async function encryptEntries(
  models: AuthenticatorEntryModel[],
  key: Uint8Array,
): Promise<Uint8Array[]> {
  const mod = await loadWasm();
  return mod.encrypt_entries(models, key);
}

export async function generateCode(
  model: AuthenticatorEntryModel,
  timeSeconds: number,
): Promise<WasmAuthenticatorCodeResponse> {
  const mod = await loadWasm();
  return mod.generate_code(model, BigInt(timeSeconds));
}

export async function calculateOperations(
  remote: Parameters<WasmModule["calculate_operations"]>[0],
  local: Parameters<WasmModule["calculate_operations"]>[1],
): Promise<ReturnType<WasmModule["calculate_operations"]>> {
  const mod = await loadWasm();
  return mod.calculate_operations(remote, local);
}

export type { AuthenticatorEntryModel };
