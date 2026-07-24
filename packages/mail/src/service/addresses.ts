import { listAddresses } from "../proton/client.ts";
import type { ProtonAddress } from "../crypto/unlock.ts";
import type { Session } from "../proton/types.ts";

export interface AddressSummary {
  id: string;
  email: string;
  keyCount: number;
}

export interface AddressesServiceOptions {
  session: Session;
  fetchImpl?: typeof fetch;
}

function mapAddress(address: ProtonAddress): AddressSummary {
  return {
    id: address.ID,
    email: address.Email,
    keyCount: address.Keys?.length ?? 0,
  };
}

export async function listAccountAddresses(
  options: AddressesServiceOptions,
): Promise<AddressSummary[]> {
  const addresses = await listAddresses({
    session: options.session,
    fetchImpl: options.fetchImpl,
  });
  return addresses.map(mapAddress);
}
