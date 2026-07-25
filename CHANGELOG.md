# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Mail TUI **List sent** and `proton mail sent` (shortcut for `list --label sent`); sent list shows recipients

### Changed
- README: document `proton account`, mail attach/compose/contacts picker, and mail-api session sharing

## [0.4.0] - 2026-07-25

### Added
- `proton account [pass://Vault/Item]` saves a default Proton Pass login ref for sign-in TOTP and password unlock (persists across `signout`; also `--clear` / show)
- Mail TUI Compose (to/subject/body) plus Reply / Reply all / Forward after reading a message
- Mail TUI Compose: pick To from Contacts or type email; optional local file attachments
- Mail live send supports `--attach` (encrypt + multipart upload to draft, then send packages)

### Fixed
- Multi-product sign-in waits for a new Pass TOTP per product (Proton rejects reusing the same code) and no longer inserts fixed 8s delays (only backs off on 2028)
- Multi-product sign-in shares one session across Contacts/Settings/Mail (same `mail-api` host) and retries on API 2028 “too many recent logins”
- Sign-in no longer sends TOTP on `/auth` (password + CAPTCHA only); 2FA uses `/auth/v4/2fa` after login — fixes post-CAPTCHA 8002 on Authenticator/Drive/etc.
- After CAPTCHA, complete password login first, then unlock 2FA with a fresh Pass TOTP via `/auth/v4/2fa` (avoids burning codes / HV token expiry)
- After CAPTCHA, TUI sign-in refreshes TOTP from Pass (waits for next 30s window if needed) instead of prompting
- Pass refs with duplicate item titles prefer the login that has TOTP (and save a stable share/item ID ref)
- Sign-in prompts for TOTP when the configured Pass item has no totp field (instead of failing with "2FA code required")
- Mail send create-draft no longer sends `AttachmentKeyPackets: {}` (Proton 2001 Invalid input); uses `[]` and omits Parent/Action for new mail
- Contacts client tests match `mail-api.proton.me` host (mocks no longer hardcode contacts-api)
- Mail locked-scope unlock uses `PUT /core/v4/users/unlock` (not `/users/password`, which returned 2001)
- External (non-Proton) sends use clear packages with Signature=0 (plain text in Gmail) while still signing the package body blob for Proton
- Parent TUI multi-product sign-in keeps successful sessions when a later product fails (e.g. Drive CAPTCHA) and continues minting the rest
- SRP/CryptoProxy init no longer hits "endpoint not initialized" when Bun nested a second `@protontech/crypto` under `packages/*/node_modules`
- Drive/VPN/Calendar/Contacts/Settings/Mail open the shared macOS CAPTCHA helper on human verification (same as Authenticator), instead of only pointing at account.proton.me
- Calendar/Contacts/Settings/Mail app-version headers use allowlisted web-* client ids; Contacts API host corrected to mail-api.proton.me
- After CAPTCHA, prompt for a fresh TOTP before retrying SRP (stale codes were misreported as wrong password)
- Mail TUI/CLI prompts for the account password when unlocking keys to read/decrypt (no longer requires pre-set `$PROTON_PASSWORD`)
- Mail TUI/`proton mail read` convert `text/html` bodies to plain text for the terminal (`--raw` keeps HTML; `--json` unchanged)
- Mail unlocks password scope (SRP re-auth) before `/keys/salts` so reading encrypted messages works on locked sessions

## [0.3.0] - 2026-07-24

### Added
- **Mail** (`proton mail …`): E2EE list/read/search/send/organize via Proton Mail REST API; nested TUI from parent menu; dual-mint via `proton signin --products mail|all`
- Parent TUI Mail entry (list inbox / search / status)
- **Settings** (`proton settings …`): account/mail API get/set; nested TUI from parent menu; dual-mint via `proton signin --products settings|set|all`
- Parent TUI Settings entry (account / mail / list keys / update)
- **Drive** (`proton drive …`): E2EE files/folders/share/trash/photos; nested TUI from parent menu; dual-mint via `proton signin --products drive|all`
- Parent TUI Drive entry (list items / list trash / status)
- **Calendar** (`proton calendar …`): E2EE calendars/events CRUD, invitation respond; nested TUI from parent menu; dual-mint via `proton signin --products cal|all`
- Parent TUI Calendar entry (list calendars / list events / status)
- **Contacts** (`proton contacts …`): E2EE CRUD, groups, pin-key; nested TUI from parent menu; dual-mint via `proton signin --products ctc|all`
- Parent TUI Contacts entry (list / groups / status)

### Removed
- **Bridge Mail preview** (`protonmail` bin): replaced by unified Mail via Proton Mail API + dual-mint sign-in

### Fixed
- Mail send fails closed when recipient key lookup errors (no silent clear-text downgrade)
- Product sessions retain refresh tokens past access-token expiry; Drive/Settings/Calendar refresh on require
- Contacts/Calendar/Drive verify signatures on read/download; Mail exposes verification status
- Contacts/Calendar updates preserve unrelated cards/metadata; vCard/iCal text escaping
- Destructive deletes require `--yes`; Mail `PROTONMAIL_READ_ONLY` blocks organize/label writes
- VPN brings down the previous tunnel before replacing WireGuard config
- Authenticator sync keeps local ciphertext when remote decrypt fails; ambiguous OTP matches rejected non-interactively

### Changed
- Document Authenticator as E2EE TOTP/Steam seed sync (alongside Contacts/Calendar/Drive/Mail)
- README, AGENTS.md, and agent skill document Mail alongside other products
- Shared sign-in defaults to all shipped products (seven API mints)

## [0.2.0] - 2026-07-24

### Added
- Unified parent TUI on bare `proton` (TTY); VPN and Authenticator menus nest from it
- Sign-in progress spinners for Pass reads and each product mint

### Fixed
- Dual-mint sign-in no longer fails with CryptoProxy `already initialised` (shared init in `@bkramer/proton-core`)
- Dual-mint requests a fresh TOTP per product (codes are single-use per API host)
- Postinstall / error hints use `@bkramer/proton-cli` and `proton vpn` / `proton auth` (not legacy package names)

### Changed
- Removed `proton vpn tui` / `proton auth tui`; product menus no longer offer Sign in (use parent menu)
- Authenticator TUI layout matches VPN/parent (StatusMessage, plain Select)
- README and skill document WireGuard/CAPTCHA requirements, connect flags, exit codes, agent envs, Pass/`pass-cli`, and dual-mint TOTP rules
- Root `bun run build:captcha` script for retrying the macOS CAPTCHA helper build

## [0.1.1] - 2026-07-24

### Fixed
- Ship full GPL-3.0 license text (was a short stub)
- OpenPGP postinstall patch finds Bun’s nested `.bun/@protontech+openpgp@*` store (not only classic `node_modules/openpgp`)

### Changed
- Authenticator HTTP User-Agent uses `@bkramer/proton-cli/<version>`
- npm package renamed to `@bkramer/proton-cli` (was briefly `proton-unified-cli`)
- Workspace packages renamed to `@bkramer/proton-core`, `@bkramer/proton-vpn`, `@bkramer/proton-authenticator`

## [0.1.0] - 2026-07-24

### Added
- Unified `proton` CLI monorepo with `vpn` and `auth` namespaces
- Shared `proton signin` dual-mint sessions (Pass-aware) and `proton signout` / `status`
- Legacy bins `protonvpn` and `protonauth` forwarding to namespaced commands
- `proton update` / `update --check` for self-upgrades of `@bkramer/proton-cli`
- CI + Release workflows; migration guide from standalone CLIs
- Publish as **`@bkramer/proton-cli`** (npm); GitHub repo `brandonkramer/proton-cli`

[Unreleased]: https://github.com/brandonkramer/proton-cli/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/brandonkramer/proton-cli/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/brandonkramer/proton-cli/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/brandonkramer/proton-cli/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/brandonkramer/proton-cli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/brandonkramer/proton-cli/releases/tag/v0.1.0
