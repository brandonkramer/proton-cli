# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
