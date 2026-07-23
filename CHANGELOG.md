# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/brandonkramer/proton-cli/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/brandonkramer/proton-cli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/brandonkramer/proton-cli/releases/tag/v0.1.0
