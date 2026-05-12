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

To cut a release, run from `main` with a clean working tree:

```bash
scripts/release.sh <action> <version>
# e.g.
scripts/release.sh preview 0.1.0
```

The script promotes `## [Unreleased]` in `<action>/CHANGELOG.md`, commits the bump, tags `<action>/v<version>`, force-updates the floating `<action>/v<major>` tag for `>=1.0.0`, pushes tags, and creates a GitHub Release.

> Requires GNU `sed`. On macOS: `brew install gnu-sed` and run via `gsed`, or run the script in a Linux container.

## License

[MIT](./LICENSE) © Duku AI Ltd
