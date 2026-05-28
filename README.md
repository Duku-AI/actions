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
- uses: duku-ai/actions/preview@preview/v0.1.0

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
