# proton-cli

Unofficial unified Proton command-line client (**VPN + Authenticator**) with one install and shared sign-in UX.

> **Not an official Proton product.** Not affiliated with Proton AG.

**Mail** is planned via Proton Mail API with unified `proton signin` (dual-mint like VPN/Authenticator). It is not shipped yet.

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

## Requirements

- Bun ≥ 1.1
- Proton account in [Single Password Mode](https://proton.me/support/single-password)
- TOTP if you use 2FA (FIDO2/security keys are not supported). Shared sign-in mints **two** API sessions — each needs its **own fresh TOTP** (codes are single-use; the same code cannot be reused for VPN then Authenticator)
- **VPN — WireGuard tools** (install tries this via Homebrew / winget; or `proton vpn setup`)
  - **macOS:** Homebrew → `wireguard-tools` (sudo for connect/disconnect)
  - **Windows:** WireGuard app via winget (Administrator terminal for connect/disconnect)
- **Authenticator — CAPTCHA (macOS):** native WKWebView helper, built on `postinstall` when possible (`bun run build:captcha` to retry; needs Xcode CLT)
- Optional: [Proton Pass CLI](https://protonpass.github.io/pass-cli/) (`pass-cli`) for credential injection

Close the Proton VPN desktop app before connecting so tunnels do not conflict.

On macOS, VPN connect/disconnect may ask for your **Mac login password** (sudo), not your Proton password.

CAPTCHA (if Proton requires it on sign-in): solve it in the **native WKWebView window**, not Safari/`verify.proton.me`.

## Commands

Run `proton` with no args (TTY) for the interactive menu (VPN / Authenticator / sign-in).

Global options: `--json`, `-y` / `--yes`, `--sudo` (WireGuard on macOS).

### Shared

```bash
proton                            # interactive menu (TTY)
proton signin
proton signin --pass "pass://Vault/Item"   # recommended with 2FA (fresh TOTP per product)
proton signin --products vpn          # or auth / all
proton signin --partial-ok
proton status --json
proton signout
proton update --check
proton update
```

With 2FA, `proton signin` / TUI **Sign in** will ask for **TOTP for VPN**, then a **new** code for Authenticator. One code cannot cover both.

### VPN (`proton vpn …`)

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
```

| Flag | Meaning |
|------|---------|
| `--country <code>` | Exit country (e.g. `NL`) |
| `--city <name>` | City name |
| `--p2p` | P2P servers |
| `--securecore` | Secure Core |
| `--tor` | Tor over VPN |
| `--free-only` | Free-tier only |

Country / feature availability depends on your Proton plan.

### Authenticator (`proton auth …`)

```bash
proton auth sync
proton auth list
proton auth code github
proton auth status --output json
```

Product-only `proton vpn signin` / `proton auth signin` exist; prefer shared `proton signin`.

## Proton Pass (optional)

If you use [Proton Pass CLI](https://protonpass.github.io/pass-cli/) (`pass-cli`):

```bash
pass-cli login   # once, if needed
proton signin --pass "pass://Personal/Proton"
# or:
export PROTON_PASS="pass://Personal/Proton"
proton signin
```

Also supported:

```bash
export PROTON_PASSWORD='pass://Personal/Proton/password'
export PROTON_TOTP='pass://Personal/Proton/totp'   # optional
pass-cli run -- proton signin
```

`Vault/Item` works too (`pass://` prefix optional). Env aliases: `PROTON_PASS`, `PROTONVPN_PASS`, `PROTONAUTH_PASS`, `PROTON_USERNAME`, `PROTON_PASSWORD`, `PROTON_TOTP`. Interactive prompts remain the default when Pass is unset. Never log resolved secrets. With 2FA, `--pass` is ideal because Pass can supply a **new** TOTP for each product mint.

## Agents / scripting

```bash
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
| `PROTON_AGENT=1` | Root `proton` agent-friendly (no accidental TUI) |
| `PROTONVPN_AGENT=1` | VPN agent mode (JSON-friendly; `sudo -n` only unless `--sudo`) |
| `PROTONAUTH_AGENT=1` / `CI=1` | Auth agent mode (default JSON; no CAPTCHA window / TUI) |

VPN exit codes: `0` ok · `1` error · `2` usage · `3` not signed in · `4` privilege needed.

CAPTCHA never opens a window in agent mode (`captcha_required` — sign in interactively once, then reuse the session).

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

Future Mail will follow the same dual-mint pattern via Proton Mail API (not shipped yet).

## Agent skill

End-user usage skill for agents: [`skills/proton-cli/SKILL.md`](./skills/proton-cli/SKILL.md).

## License

GPL-3.0-or-later
