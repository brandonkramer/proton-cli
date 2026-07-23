# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-24

### Added
- Unified `proton` CLI monorepo with `vpn` and `auth` namespaces
- Shared `proton signin` dual-mint sessions (Pass-aware) and `proton signout` / `status`
- Legacy bins `protonvpn` and `protonauth` forwarding to namespaced commands
- `proton update` / `update --check` for self-upgrades of `proton-unified-cli`
- CI + Release workflows; migration guide from standalone CLIs
- Publish as **`proton-unified-cli`** (npm); GitHub repo `brandonkramer/proton-cli`

[Unreleased]: https://github.com/brandonkramer/proton-cli/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/brandonkramer/proton-cli/releases/tag/v0.1.0
