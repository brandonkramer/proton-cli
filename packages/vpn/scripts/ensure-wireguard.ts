/**
 * Best-effort WireGuard install during package postinstall.
 * Never fails the overall install — WireGuard may need Admin/Homebrew.
 */
import {
  ensureWireGuardInstalled,
  formatSetupResult,
} from "../src/setup/wireguard.ts";

const result = await ensureWireGuardInstalled();
console.log(`@bkramer/proton-cli: ${formatSetupResult(result)}`);

if (result.status === "failed") {
  console.log(
    "@bkramer/proton-cli: You can retry later with: proton vpn setup",
  );
}

process.exit(0);
