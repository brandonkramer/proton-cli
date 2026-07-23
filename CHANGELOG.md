# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Unified `proton` CLI monorepo with `vpn` and `auth` namespaces
- Shared `proton signin` dual-mint sessions (Pass-aware) and `proton signout` / `status`
- Legacy bins `protonvpn` and `protonauth` forwarding to namespaced commands
- `proton update` / `update --check` for self-upgrades of `proton-cli`

## [0.1.0] - 2026-07-23

### Added
- Initial Bun workspace scaffold (`@proton-cli/core`, `vpn`, `authenticator`)
