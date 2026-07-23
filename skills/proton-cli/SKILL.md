---
name: proton-cli
description: >-
  Use the unofficial unified Proton CLI (proton / @bkramer/proton-cli): install,
  shared Pass-aware sign-in (dual-mint), WireGuard VPN connect/disconnect,
  Authenticator TOTP/Steam sync and codes, status/signout, update, and agent
  scripting with --json / pass:// / pass-cli. Use when the user wants to run
  proton, protonvpn, or protonauth, automate Proton VPN or Authenticator from a
  terminal or AI agent, or set up Pass-based sign-in for the unified package.
  Do not invoke for official Proton apps, FIDO2/security-key auth, or general
  networking troubleshooting unrelated to this CLI.
short-description: Unified Proton CLI (VPN + Authenticator)
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

## Requirements

- Proton account in [Single Password Mode](https://proton.me/support/single-password); TOTP 2FA OK; FIDO2 not supported
- **VPN:** WireGuard tools (`proton vpn setup`; macOS Homebrew `wireguard-tools` + sudo; Windows winget WireGuard + Admin). Close the Proton VPN desktop app before connect.
- **Authenticator CAPTCHA (macOS):** native WKWebView helper (`bun run build:captcha` if postinstall skipped; needs Xcode CLT). Solve CAPTCHA in that window, not Safari.
- Optional: [Proton Pass CLI](https://protonpass.github.io/pass-cli/) (`pass-cli`)

## Quick start

```bash
proton                                 # interactive menu (TTY)
proton signin --pass pass://Vault/Proton   # once → vpn + authenticator sessions
proton vpn connect --country US
proton auth sync
proton auth code github
proton status --json
proton signout
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

### Proton Pass

```bash
pass-cli login   # once, if needed
proton signin --pass "pass://Personal/Proton"
# or:
export PROTON_PASS="pass://Personal/Proton"
proton signin
# or field refs:
export PROTON_PASSWORD='pass://Personal/Proton/password'
export PROTON_TOTP='pass://Personal/Proton/totp'
pass-cli run -- proton signin
```

Env aliases: `PROTON_PASS`, `PROTONVPN_PASS`, `PROTONAUTH_PASS`, `PROTON_USERNAME`, `PROTON_PASSWORD`, `PROTON_TOTP`. Never log resolved secrets.

Dual-mint needs a **fresh TOTP per product** (VPN + Authenticator each consume a code). Prefer `--pass`, or enter a new code when prompted for the second product.

## VPN (`proton vpn …`)

```bash
proton vpn setup
proton vpn countries
proton vpn servers --country US
proton vpn connect --country US
proton vpn connect --city "New York"
proton vpn connect US#23
proton vpn connect --p2p
proton vpn connect --securecore
proton vpn connect --tor
proton vpn connect --free-only
proton vpn status --json
proton vpn disconnect
```

| Flag | Meaning |
|------|---------|
| `--country <code>` | Exit country (e.g. `NL`) |
| `--city <name>` | City name |
| `--p2p` | P2P servers |
| `--securecore` | Secure Core |
| `--tor` | Tor over VPN |
| `--free-only` | Free-tier only |

On macOS, connect/disconnect may need sudo. In agent mode use `--sudo` only when an interactive password prompt is OK; otherwise `sudo -n` / elevated shell.

## Authenticator (`proton auth …`)

```bash
proton auth sync
proton auth list
proton auth list --type totp
proton auth code github
proton auth status --output json
```

CAPTCHA (if required) needs a human on macOS; agents should reuse an existing session after interactive `proton signin` / `proton auth signin`.

## Agent / scripting

```bash
export PROTON_AGENT=1
export PROTONVPN_AGENT=1
export PROTONAUTH_AGENT=1
proton status --json
proton vpn status --json
proton vpn connect --json --country US
proton auth status --output json
proton auth code github --output json
```

| Flag / env | Meaning |
|---|---|
| `--json` / `PROTONVPN_JSON=1` | JSON on stdout (VPN / shared) |
| `--output json\|plain\|ink` / `PROTONAUTH_OUTPUT` | Authenticator output format |
| `-y` / `--yes` | Non-interactive confirms |
| `--sudo` | Allow interactive macOS sudo for WireGuard |
| `PROTON_AGENT=1` | Root agent-friendly (no accidental TUI) |
| `PROTONVPN_AGENT=1` | VPN agent mode |
| `PROTONAUTH_AGENT=1` / `CI=1` | Auth agent mode (default JSON; no CAPTCHA window / TUI) |

VPN exit codes: `0` ok · `1` error · `2` usage · `3` not signed in · `4` privilege needed.

Prefer subcommands over the TUI when scripting. Bare `proton` opens the parent menu on a TTY; on non-TTY / agent env it exits with usage. Auth CAPTCHA never opens in agent mode (`captcha_required`).

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
