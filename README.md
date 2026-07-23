# proton-cli

Unofficial unified Proton command-line client (VPN + Authenticator) with **one install** and **shared sign-in UX**.

```bash
proton signin --pass pass://Vault/Proton   # credentials once → vpn + authenticator sessions
proton vpn connect --country US
proton auth code github
proton status --json
proton signout
```

Legacy bins still work:

```bash
protonvpn status --json    # → proton vpn status --json
protonauth list            # → proton auth list
```

> **Not an official Proton product.** Not affiliated with Proton AG.

## Install (from this repo)

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
cd /Users/brandonk/dev/proton-cli/cli
bun install
bun link
```

## Monorepo

- `@proton-cli/core` — shared account/session/agent primitives
- `@proton-cli/vpn` — WireGuard VPN product
- `@proton-cli/authenticator` — Authenticator cloud sync + codes

Config root: `~/.config/proton-cli/` with per-product sessions under `sessions/`.

## Shared session model

Proton VPN and Authenticator use **different API hosts and app-version headers**, so a single Bearer token is not assumed to work for both. `proton signin` still feels like one login: credentials are collected once, then each product mints and stores its own session.

## License

GPL-3.0-or-later
