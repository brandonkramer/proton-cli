# proton-cli

Unofficial unified Proton command-line client (**VPN + Authenticator + Contacts + Calendar + Drive + Settings + Mail**) with one install and shared sign-in UX.

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

## Requirements

- Bun ≥ 1.1
- Proton account in [Single Password Mode](https://proton.me/support/single-password)
- TOTP if you use 2FA (FIDO2/security keys are not supported). Shared sign-in mints **all selected products** (default: all seven) — each product needs its **own fresh TOTP** (codes are single-use; one code cannot cover multiple mints)
- **VPN — WireGuard tools** (install tries this via Homebrew / winget; or `proton vpn setup`)
  - **macOS:** Homebrew → `wireguard-tools` (sudo for connect/disconnect)
  - **Windows:** WireGuard app via winget (Administrator terminal for connect/disconnect)
- **Authenticator — CAPTCHA (macOS):** native WKWebView helper, built on `postinstall` when possible (`bun run build:captcha` to retry; needs Xcode CLT)
- Optional: [Proton Pass CLI](https://protonpass.github.io/pass-cli/) (`pass-cli`) for credential injection

Close the Proton VPN desktop app before connecting so tunnels do not conflict.

On macOS, VPN connect/disconnect may ask for your **Mac login password** (sudo), not your Proton password.

CAPTCHA (if Proton requires it on sign-in): solve it in the **native WKWebView window**, not Safari/`verify.proton.me`.

## Commands

Run `proton` with no args (TTY) for the interactive menu (VPN / Authenticator / Contacts / Calendar / Drive / Settings / Mail / sign-in).

Global options: `--json`, `-y` / `--yes`, `--sudo` (WireGuard on macOS).

### Shared

```bash
proton                            # interactive menu (TTY)
proton signin
proton signin --pass "pass://Vault/Item"   # recommended with 2FA (fresh TOTP per product)
proton signin --products vpn          # or auth / ctc / all
proton signin --partial-ok
proton status --json
proton signout
proton update --check
proton update
```

With 2FA, `proton signin` / TUI **Sign in** prompts for a **fresh TOTP per product** being minted (VPN, Authenticator, Contacts, Calendar, Drive, Settings, Mail). One code cannot cover multiple products — use `--pass` so Pass can supply a new code for each mint.

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

E2EE TOTP/Steam seed sync and codes (Authenticator Key; client-side encrypt/decrypt).

```bash
proton auth sync
proton auth list
proton auth code github
proton auth status --output json
```

Product-only `proton vpn signin` / `proton auth signin` exist; prefer shared `proton signin`.

### Contacts (`proton contacts …`)

E2EE contact cards, groups, and pinned keys.

```bash
proton contacts list
proton contacts get alice
proton contacts create --name "Alice" --email alice@example.com
proton contacts groups list
proton contacts pin-key contact-id ./key.asc
```

Bare `proton` (TTY) opens a nested Contacts menu (list / groups / status). Prefer `proton contacts … --json` for scripting.

### Calendar (`proton calendar …`)

E2EE calendars and events.

```bash
proton calendar calendars list
proton calendar calendars create --name "Work" --color "#8080FF"
proton calendar events list --calendar primary
proton calendar events create --title "Standup" --start 2026-07-24T09:00 --duration 30m
proton calendar events respond EVENT_REF --status accept
```

Bare `proton` (TTY) opens a nested Calendar menu (list calendars / list events / status). Prefer `proton calendar … --json` for scripting. Encrypted event operations need account password via `--password`, `--pass`, or `PROTON_PASSWORD`.

### Drive (`proton drive …`)

E2EE files, folders, sharing, trash, and photos.

```bash
proton drive status
proton drive items list
proton drive items upload ./file.txt /
proton drive folders create /Projects
proton drive share link /file.txt
proton drive trash list
proton drive photos list
```

Bare `proton` (TTY) opens a nested Drive menu (list items / list trash / status). Prefer `proton drive … --json` for scripting. Encrypted operations need account password via `--password`, `--pass`, or `PROTON_PASSWORD`.

### Settings (`proton settings …`)

Account and mail preference settings via Proton’s account/mail API (not Bridge IMAP/SMTP).

```bash
proton settings get
proton settings mail
proton settings set
proton settings set view-mode 1
proton settings set hide-remote-images 1 --dry-run
proton settings get --json
```

Sign in with `proton signin --products settings|set|all`. Writable keys include `view-mode`, `draft-type`, `hide-remote-images`, and others listed by bare `proton settings set`.

Bare `proton` (TTY) opens a nested Settings menu (account / mail / list keys / update). Prefer `proton settings … --json` for scripting.

### Mail (`proton mail …`)

E2EE list/read/search/send/organize via Proton Mail REST API (not Bridge IMAP/SMTP).

```bash
proton mail status
proton mail list
proton mail list --label sent --unread
proton mail read MESSAGE_ID
proton mail search "invoice"
proton mail send --to alice@example.com --subject "Hi" --body "Hello"
proton mail organize read MESSAGE_ID
proton mail organize trash MESSAGE_ID
proton mail labels list
proton mail addresses list
```

Bare `proton` (TTY) opens a nested Mail menu (list inbox / search / status). Prefer `proton mail … --json` for scripting. Read/send/decrypt need account password via `--pass`, `--password`, or `PROTON_PASSWORD`.

Sign in with `proton signin --products mail|all`.

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
| `PROTONCONTACTS_JSON=1` / `PROTONCONTACTS_AGENT=1` | Contacts agent mode (JSON; no TUI) |
| `PROTONCALENDAR_JSON=1` / `PROTONCALENDAR_AGENT=1` | Calendar agent mode (JSON; no TUI) |
| `PROTON_DRIVE_JSON=1` / `PROTON_DRIVE_AGENT=1` | Drive agent mode (JSON; no TUI) |
| `PROTONSETTINGS_JSON=1` / `PROTONSETTINGS_AGENT=1` | Settings agent mode (JSON; no TUI) |
| `PROTONMAIL_JSON=1` / `PROTONMAIL_AGENT=1` | Mail agent mode (JSON; no TUI) |

VPN exit codes: `0` ok · `1` error · `2` usage · `3` not signed in · `4` privilege needed.

CAPTCHA never opens a window in agent mode (`captcha_required` — sign in interactively once, then reuse the session).

## Monorepo

| Path | Package | Owns |
|---|---|---|
| `packages/core` | `@bkramer/proton-core` | Shared config, dual-mint sessions, Pass helpers |
| `packages/vpn` | `@bkramer/proton-vpn` | WireGuard + vpn-api (`proton vpn …`) |
| `packages/authenticator` | `@bkramer/proton-authenticator` | E2EE TOTP/Steam sync (`proton auth …`) |
| `packages/contacts` | `@bkramer/proton-contacts` | E2EE contacts/groups (`proton contacts …`) |
| `packages/calendar` | `@bkramer/proton-calendar` | E2EE calendars/events (`proton calendar …`) |
| `packages/drive` | `@bkramer/proton-drive` | E2EE Drive files/folders/photos (`proton drive …`) |
| `packages/settings` | `@bkramer/proton-settings` | Account/mail API preferences (`proton settings …`) |
| `packages/mail` | `@bkramer/proton-mail` | E2EE Mail list/read/search/send (`proton mail …`) |
| `src/` | root bins | `proton` router + legacy wrappers |

Config root: `~/.config/proton-cli/` with per-product sessions under `sessions/`.

## Shared session model

Each product uses **different API hosts and app-version headers**, so tokens are not shared across products. `proton signin` still feels like one login: credentials are collected once, then each product mints and stores its own session.

## Agent skill

End-user usage skill for agents: [`skills/proton-cli/SKILL.md`](./skills/proton-cli/SKILL.md).

## License

GPL-3.0-or-later
