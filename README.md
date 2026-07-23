# proton-cli

Unofficial unified Proton command-line client (**VPN + Authenticator**) with one install and shared sign-in UX.

```bash
proton signin --pass pass://Vault/Proton   # credentials once → vpn + authenticator sessions
proton vpn connect --country US
proton auth code github
proton status --json
proton signout
```

> **Not an official Proton product.** Not affiliated with Proton AG.

## Install

Requires [Bun](https://bun.sh) ≥ 1.1 at runtime (even when installing via npm).

```bash
bun add -g @bkramer/proton-cli
# or
npm install -g @bkramer/proton-cli
```

From GitHub:

```bash
bun install -g github:brandonkramer/proton-cli
```

### From a clone

```bash
git clone https://github.com/brandonkramer/proton-cli.git
cd proton-cli
bun install
bun link
```

## Commands

Global options: `--json`, `-y` / `--yes`, `--sudo` (WireGuard on macOS).

### Shared

```bash
proton signin
proton signin --pass "pass://Vault/Item"
proton signin --products vpn          # or auth / all
proton signin --partial-ok
proton status --json
proton signout
proton update --check
proton update
```

### VPN (`proton vpn …`)

Needs system WireGuard (`proton vpn setup` can install tools). Close the Proton VPN desktop app before connecting.

```bash
proton vpn setup
proton vpn countries
proton vpn servers --country US
proton vpn connect --country US
proton vpn connect --city "New York"
proton vpn connect US#23
proton vpn connect --p2p
proton vpn status --json
proton vpn disconnect
proton vpn tui
```

### Authenticator (`proton auth …`)

```bash
proton auth sync
proton auth list
proton auth code github
proton auth status --output json
proton auth tui
```

Product-only `proton vpn signin` / `proton auth signin` exist; prefer shared `proton signin`.

## Monorepo

| Path | Package | Owns |
|---|---|---|
| `packages/core` | `@bkramer/proton-core` | Shared config, dual-mint sessions, Pass helpers |
| `packages/vpn` | `@bkramer/proton-vpn` | WireGuard + vpn-api (`proton vpn …`) |
| `packages/authenticator` | `@bkramer/proton-authenticator` | TOTP sync (`proton auth …`) |
| `src/` | root bins | `proton` router + legacy wrappers |

Config root: `~/.config/proton-cli/` with per-product sessions under `sessions/`.

## Shared session model

Proton VPN and Authenticator use **different API hosts and app-version headers**, so tokens are not shared across products. `proton signin` still feels like one login: credentials are collected once, then each product mints and stores its own session.

## Agent skill

End-user usage skill for agents: [`skills/proton-cli/SKILL.md`](./skills/proton-cli/SKILL.md).

## Release

GitHub Actions workflow **Release** (`workflow_dispatch` with a semver version) bumps `package.json`, tags `v*`, creates a GitHub Release, and publishes `@bkramer/proton-cli` to npm via Trusted Publisher (environment `npm`).

```bash
gh workflow run Release -f version=0.1.1
```

## License

GPL-3.0-or-later
