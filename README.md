# Duku Actions

Reusable GitHub Actions published by [Duku AI](https://duku.ai) for integrating Duku into customer CI pipelines.

## Available actions

| Action | Status | Description |
|---|---|---|
| [`preview/`](./preview) | _pre-release_ | Reports a deployed preview URL to the Duku platform for evaluation. |
| [`environment/`](./environment) | _pre-release_ | Triggers an exploration against a pre-created environment target on push / schedule / workflow_dispatch. |

## Pinning

Customers should pin to an immutable version tag (recommended) or to the floating major tag (available once `v1.0.0` is cut):

```yaml
# Pin to a specific release (recommended for reproducibility)
- uses: duku-ai/actions/preview@preview/v0.2.0

# Pin to the floating major (auto-updates within v1.x.y; available post-1.0)
- uses: duku-ai/actions/preview@preview/v1
```

## Source of truth

This repo is **read-only**. Each action's `action.yml`, bundled `dist/`, and docs are mirrored from the private `Duku-AI/chrome-worker` monorepo under `actions-repo/`, pushed here on every monorepo `main` commit that touches that directory. The TypeScript sources, `package.json`, and build config live only in chrome-worker. Hand-edits to this repo will be overwritten on the next sync.

## Releases (maintainers)

Each action is versioned independently with a `<action>/v<semver>` tag scheme:

- Immutable tags: `preview/v0.1.0`, `preview/v1.2.3`
- Floating major: `preview/v1` (only updated for stable `>=1.x` releases — `0.x` is pre-release and gets no floating tag)

Releases are **fully automated** off the `version` field in each action's
`package.json` in chrome-worker. There is no manual `release.sh` here.

### Step 0: never tag ahead of prod

An action is released the moment its version bump lands on main — the
`actions-repo-sync` workflow tags `<action>/v<version>` within a minute, and
customers pinning that tag get it immediately. Prod platform-api is deployed
manually and sporadically, so **a version bump for behaviour that depends on a
platform change must not land until that change is deployed to prod.** Build the
bump as the last commit of the stack and land it after the deploy.

The actions degrade rather than fail when prod is behind, so this is about
customers getting the behaviour the CHANGELOG promises, not about breakage.

To check what prod actually has, unauthenticated (validation runs before auth,
so no credentials are needed):

```
curl -sS https://platform.duku.ai/graphql -H 'content-type: application/json' \
  -d '{"query":"query{subject(id:\"probe\"){enabledFeatures}}"}'
```

`GRAPHQL_VALIDATION_FAILED` naming `enabledFeatures` means prod is older than the
action — do not land the bump. An auth error means the field exists, so prod is
current enough. `.github/workflows/actions-schema-probe.yml` in chrome-worker
runs this same check weekly, so the answer usually arrives before you ask.

Prod's deployed tag is the SSM parameter owned by
`infrastructure/terraform/modules/versioning/06_main.tf`. The manual deploy
writes it out of band: `platform_version = "latest"` in terraform only seeds the
parameter and then `ignore_changes` its value, so terraform is not the answer to
"what is deployed".

To cut a release for, e.g., `preview`:

1. In chrome-worker, on a single commit:
   - Bump `actions-repo/preview/package.json` `"version"` to the next semver.
   - Promote `## [Unreleased]` → `## [<version>] - <date>` in
     `actions-repo/preview/CHANGELOG.md` (the section body becomes the
     GitHub Release notes).
   - `chore(action/preview): release <version>`.
2. `sl pr submit` → review → `#land`.

After the land, the `actions-repo-sync` workflow runs:

1. Mirrors action artifacts (`action.yml`, `dist/`, `README.md`,
   `examples/`, `CHANGELOG.md`) into this repo.
2. For each action, compares its chrome-worker `package.json` version
   against the existing tags here. For every version not yet tagged it
   creates an annotated tag `<action>/v<version>`, force-updates the
   floating `<action>/v<major>` for `>=1.0.0`, and publishes a GitHub
   Release with notes extracted from the matching `## [<version>]`
   section of `CHANGELOG.md`.

A pre-merge CI check in chrome-worker refuses to land a PR that lowers
any action's `package.json` version below the latest published tag.

## License

[MIT](./LICENSE) © Duku AI Ltd
