# AGENTS.md — proton-cli monorepo

Unofficial unified Proton CLI. Bun workspaces under `packages/`.

- **GitHub:** `brandonkramer/proton-cli`
- **npm:** `@bkramer/proton-cli` (unscoped `proton-cli` is taken on the registry)
- **Bins:** `proton`, `protonvpn`, `protonauth`

## Layout

| Path | Package | Owns |
|---|---|---|
| `packages/core` | `@bkramer/proton-core` | Shared config root, multi-product sessions, dual-mint sign-in, agent/errors helpers |
| `packages/vpn` | `@bkramer/proton-vpn` | VPN API + WireGuard commands (`proton vpn …`) |
| `packages/authenticator` | `@bkramer/proton-authenticator` | Authenticator sync/codes (`proton auth …`) |
| `src/` | root bins | `proton` router, `protonvpn` / `protonauth` wrappers |

## Rules

- VPN must not import authenticator (or vice versa). Shared code goes in `core`.
- Sessions are **per product** (`sessions/vpn.json`, `sessions/authenticator.json`). Do not reuse tokens across API hosts unless research upgrades `INV-SESSION-001`.
- `proton signin` collects credentials once and dual-mints product sessions (Approach A).
- Prefer `bun` for install/test/typecheck. Do not use npm/yarn locally.
- Never log secrets or `pass://` resolved values.

## Checks

```bash
bun install
bun run typecheck
bun test
bun run src/index.ts --help
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — user-facing capability
- `fix:` — bug fix
- `chore:` — release, tooling, deps, non-user plumbing
- `docs:` — documentation only
- `refactor:` — behavior-preserving restructure
- `test:` — tests only

Format: `<type>: <imperative summary>` (optional body explaining why). Examples: `feat: add dual-mint sign-in`, `chore: release v0.1.0`.

Do not commit secrets, session files, or resolved Pass material.

## Sibling sources

Initial ports come from:

- `/Users/brandonk/dev/proton-cli/proton-vpn-cli`
- `/Users/brandonk/dev/proton-cli/proton-authenticator-cli`
