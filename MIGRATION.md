# Migration guide

Cut over from the standalone CLIs to the unified package.

| Before | After |
|---|---|
| `proton-vpn-cli` (npm) | `@bkramer/proton-cli` |
| `proton-authenticator-cli` (npm) | `@bkramer/proton-cli` |
| GitHub `brandonkramer/proton-vpn-cli` | `brandonkramer/proton-cli` |
| GitHub `brandonkramer/proton-authenticator-cli` | `brandonkramer/proton-cli` |
| `~/.config/proton-vpn-cli/` | `~/.config/proton-cli/vpn/` (+ `sessions/vpn.json`) |
| `~/.config/proton-authenticator-cli/` | `~/.config/proton-cli/authenticator/` (+ `sessions/authenticator.json`) |

> **Why not `proton-cli` on npm?** That name is already taken by an unrelated abandoned package (2017). This project publishes as **`@bkramer/proton-cli`**. The GitHub repo is `brandonkramer/proton-cli`.

## Install

```bash
# remove old globals (optional)
bun remove -g proton-vpn-cli proton-authenticator-cli

# install unified CLI (bins: proton, protonvpn, protonauth)
bun add -g @bkramer/proton-cli

# or from GitHub
bun install -g github:brandonkramer/proton-cli
```

## Commands

```bash
# old                         # new (preferred)
protonvpn connect --country US
proton vpn connect --country US

protonauth code github
proton auth code github

# new: one sign-in for both products
proton signin --pass pass://Vault/Proton
proton status --json
proton signout
```

Legacy bins `protonvpn` and `protonauth` remain and forward to the namespaced commands.

## Config / sessions

1. Sign in again with `proton signin` (recommended). Dual-mint writes:
   - `~/.config/proton-cli/sessions/vpn.json`
   - `~/.config/proton-cli/sessions/authenticator.json`
   - product state under `~/.config/proton-cli/vpn/` and `…/authenticator/`
2. Old config dirs are **not** deleted automatically. You can remove them after verifying the new CLI works:

```bash
rm -rf ~/.config/proton-vpn-cli ~/.config/proton-authenticator-cli
# Windows: %APPDATA%\proton-vpn-cli and %APPDATA%\proton-authenticator-cli
```

Automatic import of old `session.json` files may be added later; until then, re-authenticate.

## Standalone repos

`proton-vpn-cli` and `proton-authenticator-cli` stay available during the transition. New features land in `brandonkramer/proton-cli` first.
