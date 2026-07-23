# proton-cli

Unofficial unified Proton command-line client (**VPN + Authenticator**) with one install and shared sign-in UX.

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

## Install

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
bun add -g @bkramer/proton-cli
```

Or from GitHub:

```bash
bun install -g github:brandonkramer/proton-cli
```

> npm name is **`@bkramer/proton-cli`** (unscoped `proton-cli` is taken on the registry). Bins are still `proton` / `protonvpn` / `protonauth`.

### From a clone

```bash
git clone https://github.com/brandonkramer/proton-cli.git
cd proton-cli
bun install
bun link
```

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

## Release

GitHub Actions workflow **Release** (`workflow_dispatch` with a semver version) bumps `package.json`, tags `v*`, creates a GitHub Release, and publishes `@bkramer/proton-cli` to npm via Trusted Publisher (environment `npm`).

```bash
gh workflow run Release -f version=0.1.1
```

## License

GPL-3.0-or-later
