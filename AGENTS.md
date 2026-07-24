# AGENTS.md — proton-cli monorepo

Unofficial unified Proton CLI. Bun workspaces under `packages/`.

- **GitHub:** `brandonkramer/proton-cli`
- **npm:** `@bkramer/proton-cli` (unscoped `proton-cli` is taken on the registry)
- **Bins:** `proton`, `protonvpn`, `protonauth`, `protonmail`
- **Runtime:** Bun ≥ 1.1 · Ink/React TUI · GPL-3.0-or-later (required by `@protontech/crypto`)

End-user skill: [skills/proton-cli/SKILL.md](skills/proton-cli/SKILL.md).

## Layout

| Path | Package | Owns |
|---|---|---|
| `packages/core` | `@bkramer/proton-core` | Shared config root, multi-product sessions, dual-mint sign-in, Pass helpers |
| `packages/vpn` | `@bkramer/proton-vpn` | VPN API + WireGuard commands (`proton vpn …`) |
| `packages/authenticator` | `@bkramer/proton-authenticator` | Authenticator sync/codes (`proton auth …`) |
| `packages/mail` | `@bkramer/proton-mail` | Mail via Bridge IMAP/SMTP (`proton mail …`) |
| `src/` | root bins | `proton` router, `protonvpn` / `protonauth` / `protonmail` wrappers |
| `scripts/` | install helpers | workspace links, OpenPGP patch, postinstall |
| `skills/proton-cli/` | end-user skill | How to install/use `proton` for agents |

User data: `~/.config/proton-cli/` (or `%APPDATA%\proton-cli\`) with `sessions/*.json` and product subdirs.

## Rules

- VPN must not import authenticator (or vice versa). Shared code goes in `core`.
- **Mail** is Bridge-based (IMAP/SMTP), separate from dual-mint sign-in for VPN/Authenticator. `packages/mail` must not import `@bkramer/proton-vpn` or `@bkramer/proton-authenticator`.
- Sessions are **per product** (`sessions/vpn.json`, `sessions/authenticator.json`). Do not reuse tokens across API hosts.
- `proton signin` collects credentials once and dual-mints product sessions.
- `@protontech/crypto` CryptoProxy must be initialized once per process — use `ensureCryptoProxy` / `getCryptoProxy` from `@bkramer/proton-core` (never a second `setEndpoint` in product packages).
- Prefer `bun` for install/test/typecheck. Do not use npm/yarn locally.
- Never log secrets or `pass://` resolved values.

## Checks

```bash
bun install
bun run typecheck
bun test
bun run src/index.ts --help
```

Do **not** run long-lived TUI / `bun run start` unless the user asks.

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

## Implementation notes

### OpenPGP postinstall patch

`@protontech/openpgp` only exports `openpgp/lightweight` under the `browser` condition. [scripts/patch-openpgp.ts](scripts/patch-openpgp.ts) adds Node/`import` resolution. It must find the package under classic hoists **and** Bun’s `node_modules/.bun/@protontech+openpgp@*` store (npm alias `openpgp` → `@protontech/openpgp`).

### VPN API caching

- Logicals (`/vpn/v1/logicals`): 10m memory + disk TTL, `ETag` / `If-None-Match` / `304`, stale fallback on network failure.
- Session verify: lightweight `GET /vpn` (not a full logicals fetch).
- WireGuard keypair reuse until Proton `RefreshTime`; cleared on sign-out / session clear.

### Agent / scripting mode

- Bare `proton` (TTY) opens the parent TUI in `src/tui/`; VPN/Auth/Mail product menus nest from there (`launchVpnTui` / `launchAuthTui` / `launchMailTui`). No `proton vpn tui` / `proton auth tui`.
- Mail nested TUI lives in `packages/mail/src/tui/`; Bridge password via `PROTONMAIL_PASSWORD` / Pass / file — not dual-mint SRP.
- Global: `--json`, `-y/--yes`, `--sudo` (VPN agent helpers in `packages/vpn/src/util/agent.ts`)
- Authenticator uses `--output json|plain|ink` / `PROTONAUTH_*` envs
- Quiet UI skips Ink when JSON, `CI`, agent env, or non-TTY
- WireGuard: `sudo -n` first; interactive sudo only if allowed (`--sudo` or human TTY)

### Optional Proton Pass sign-in

```bash
proton signin --pass "pass://Vault/Item"
# or PROTON_PASS / PROTONVPN_PASS / PROTONAUTH_PASS
```

Uses `pass-cli` when present. Never log resolved secrets.

### Interactive filtering (VPN TUI)

Country/server browsers use `packages/vpn/src/ui/filterable-select.tsx`. Matching covers ISO code, English name (`Intl.DisplayNames`), and cities. Esc clears filter, then goes back.

## Testing conventions

- Prefer dependency injection over `mock.module` for `protonFetch` / HTTP — Bun’s `mock.module` can leak across files (CI Linux file order differs from macOS).
- For `protonFetch` unit tests, pass `fetchImpl` in options.
- Config-path / session tests should set a temp config root (`setConfigRootForTests` / `XDG_CONFIG_HOME`) and clean up.

## Release

```bash
gh workflow run Release -f version=X.Y.Z
```

Keep [CHANGELOG.md](CHANGELOG.md) updated. Prefer the Release workflow over hand-pushed tags.
