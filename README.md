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
bun add -g proton-unified-cli
```

Or from GitHub:

```bash
bun install -g github:brandonkramer/proton-cli
```

> npm name is **`proton-unified-cli`** because plain `proton-cli` is taken on the registry. Bins are still `proton` / `protonvpn` / `protonauth`.

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
| `packages/core` | `@proton-cli/core` | Shared config, dual-mint sessions, Pass helpers |
| `packages/vpn` | `@proton-cli/vpn` | WireGuard + vpn-api (`proton vpn …`) |
| `packages/authenticator` | `@proton-cli/authenticator` | TOTP sync (`proton auth …`) |
| `src/` | root bins | `proton` router + legacy wrappers |

Config root: `~/.config/proton-cli/` with per-product sessions under `sessions/`.

## Shared session model

Proton VPN and Authenticator use **different API hosts and app-version headers**, so tokens are not shared across products. `proton signin` still feels like one login: credentials are collected once, then each product mints and stores its own session.

## Migration

Coming from `proton-vpn-cli` / `proton-authenticator-cli`? See [MIGRATION.md](./MIGRATION.md).

## Release

GitHub Actions workflow **Release** (`workflow_dispatch` with a semver version) bumps `package.json`, tags `v*`, creates a GitHub Release, and publishes `proton-unified-cli` to npm via Trusted Publisher (environment `npm`).

```bash
gh workflow run Release -f version=0.1.1
```

One-time npm Trusted Publisher setup: [docs/PUBLISH.md](./docs/PUBLISH.md).

## License

GPL-3.0-or-later
