# Publishing @bkramer/proton-cli

## Names

| Surface | Value |
|---|---|
| GitHub | https://github.com/brandonkramer/proton-cli |
| npm | `@bkramer/proton-cli` |
| Bins | `proton`, `protonvpn`, `protonauth` |

Unscoped `proton-cli` is taken on npm by an unrelated abandoned package.

## One-time: npm Trusted Publisher

Required for the GitHub Actions Release workflow (OIDC, no long-lived token).

1. Sign in at https://www.npmjs.com as the publish account (must own the `@bkramer` scope, or create it).
2. Create / open package **`@bkramer/proton-cli`**.
3. Add a GitHub Actions trusted publisher:
   - **Organization / user:** `brandonkramer`
   - **Repository:** `proton-cli`
   - **Workflow filename:** `release.yml`
   - **Environment name:** `npm` (must match the workflow `environment: npm`)
4. Ensure the GitHub repo has an **Environment** named `npm`.

Then:

```bash
gh workflow run Release -f version=0.1.1
```

## Manual first publish (OTP)

If Trusted Publisher is not configured yet:

```bash
cd /path/to/proton-cli
npm publish --access public --otp=<code-from-authenticator>
```

## Verify

```bash
npm view @bkramer/proton-cli version
bun add -g @bkramer/proton-cli@latest
proton --version
```
