# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Settings** (`proton settings …`): account/mail API get/set; nested TUI from parent menu; dual-mint via `proton signin --products settings|set|all`
- Parent TUI Settings entry (account / mail / list keys / update)
- **Drive** (`proton drive …`): E2EE files/folders/share/trash/photos; nested TUI from parent menu; dual-mint via `proton signin --products drive|all`
- Parent TUI Drive entry (list items / list trash / status)
- **Calendar** (`proton calendar …`): E2EE calendars/events CRUD, invitation respond; nested TUI from parent menu; dual-mint via `proton signin --products cal|all`
- Parent TUI Calendar entry (list calendars / list events / status)
- **Contacts** (`proton contacts …`): E2EE CRUD, groups, pin-key; nested TUI from parent menu; dual-mint via `proton signin --products ctc|all`
- Parent TUI Contacts entry (list / groups / status)

### Removed
- **Bridge Mail preview** (`proton mail …`, `protonmail` bin, `packages/mail`): removed pending unified Mail via Proton Mail API + dual-mint sign-in (separate project)

### Changed
- Document Authenticator as E2EE TOTP/Steam seed sync (alongside Contacts/Calendar/Drive)
- README, AGENTS.md, and agent skill reflect VPN + Authenticator only; Mail noted as planned via API

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

[Unreleased]: https://github.com/brandonkramer/proton-cli/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/brandonkramer/proton-cli/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/brandonkramer/proton-cli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/brandonkramer/proton-cli/releases/tag/v0.1.0
