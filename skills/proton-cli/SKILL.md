---
name: proton-cli
description: >-
  Use the unofficial unified Proton CLI (proton / @bkramer/proton-cli): install,
  shared sign-in (Pass-aware dual-mint), VPN connect/disconnect, Authenticator
  sync/codes, status/signout, and agent scripting with --json. Use when the user
  wants to run proton, protonvpn, or protonauth from the unified package.
---

# proton (@bkramer/proton-cli)

Unofficial unified Proton CLI (**VPN + Authenticator**) with shared sign-in UX. Not an official Proton product.

Requires **Bun** ≥ 1.1 at runtime (even if installed via npm).

## Install

```bash
bun add -g @bkramer/proton-cli
# or
npm install -g @bkramer/proton-cli
```

From GitHub:

```bash
bun install -g github:brandonkramer/proton-cli
```

Bins: `proton`, `protonvpn`, `protonauth` (legacy wrappers → `proton vpn` / `proton auth`).

## Quick start

```bash
proton signin --pass pass://Vault/Proton   # once → vpn + authenticator sessions
proton vpn connect --country US
proton auth sync
proton auth code github
proton status --json
proton signout
```

Legacy:

```bash
protonvpn status --json
protonauth list
```

## Shared sign-in

VPN and Authenticator use **different API hosts**, so tokens are not shared. `proton signin` still collects credentials once and mints a session per product under `~/.config/proton-cli/`.

```bash
proton signin
proton signin --pass "pass://Personal/Proton"
proton signin --products vpn
proton signin --products auth
proton signin --partial-ok          # keep successes if one product fails
export PROTON_PASS="pass://Personal/Proton"
export PROTON_USERNAME=…            # or PROTON_PASSWORD / PROTON_TOTP
proton status
proton signout
```

Account should be in [Single Password Mode](https://proton.me/support/single-password). TOTP 2FA is supported; FIDO2/security keys are not.

## VPN (`proton vpn …`)

Needs system WireGuard tools (`proton vpn setup` can help). Close the Proton VPN desktop app before connecting.

```bash
proton vpn setup
proton vpn signin                   # product-only (prefer proton signin)
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

On macOS, connect/disconnect may need sudo. In agent mode use `--sudo` only when an interactive password prompt is OK; otherwise `sudo -n` / elevated shell.

## Authenticator (`proton auth …`)

```bash
proton auth sync
proton auth list
proton auth code github
proton auth status --output json
proton auth tui
```

CAPTCHA (if required) needs a human on macOS; agents should reuse an existing session after interactive `proton signin` / `proton auth signin`.

## Agent / scripting

```bash
proton status --json
proton vpn status --json
proton vpn connect --json --country US
proton auth status --output json
proton auth code github --output json
```

| Flag / env | Meaning |
|---|---|
| `--json` / `PROTONVPN_JSON=1` | JSON on stdout for supported commands |
| `-y` / `--yes` | Non-interactive confirms |
| `--sudo` | Allow interactive macOS sudo for WireGuard |
| `CI=true` / `PROTON_AGENT=1` | Agent-friendly (no accidental TUI) |

Prefer subcommands over the TUI. No-args `proton` on a non-TTY exits with usage.

## Update

```bash
proton update --check
proton update
# or
bun add -g @bkramer/proton-cli@latest
```

## Config layout

```text
~/.config/proton-cli/
  account.json
  sessions/vpn.json
  sessions/authenticator.json
  vpn/                 # WireGuard conf, caches
  authenticator/       # local entry cache
```

Never log passwords, TOTP codes, or resolved `pass://` secrets.
