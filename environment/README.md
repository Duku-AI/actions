# Duku Environment GitHub Action

Triggers a Duku exploration against a pre-created environment target.

Use this action on `push`, `schedule`, or `workflow_dispatch` events to fire
explorations at stable, long-lived environment targets (e.g. staging, prod
canary, customer-specific deploys). The target must already exist in Viewport;
the action references it by `target-id`.

> For PR-preview workflows where each PR gets its own ephemeral target,
> use the [`preview`](../preview) action instead.

## Usage

```yaml
- uses: duku-ai/actions/environment@environment/v0.1.0
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    target-id: ${{ vars.DUKU_STAGING_TARGET_ID }}
```

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `api-key` | Yes | — | Platform API key (base64 `clientId:clientSecret`). Generate in Viewport → Settings → API Keys. |
| `target-id` | Yes | — | Pre-created environment target ID (from Viewport). |
| `url` | No | _target subject baseUrl_ | Override the URL to explore. If unset, uses the target's subject `baseUrl`. |
| `api-url` | No | `https://platform.duku.ai/graphql` | Platform API GraphQL endpoint. |
| `auth-url` | No | _derived from `api-url`_ | Keycloak override (defaults to swapping `platform.` → `auth.` in the api-url host). |
| `github-installation-id` | No | — | GitHub App installation ID for Check Runs and PR error reporting. |

## Outputs

| Name | Description |
|------|-------------|
| `run-id` | ID of the started exploration. |
| `run-status` | Status returned by `startExploration`. |

## Examples

- [`examples/environment-push.yml`](./examples/environment-push.yml) — minimal `push`-trigger workflow
- See [`docs/github-runner-setup.md`](../../docs/github-runner-setup.md) for
  a side-by-side comparison with the [`preview`](../preview) action and a full
  workflow template covering `push`, `schedule`, and `workflow_dispatch`.

## Status

This action is **pre-release** (`0.x`). It triggers an exploration and exits —
result polling, `fail-on`, and Check Runs come in later releases.

See [`CHANGELOG.md`](./CHANGELOG.md) for the version history.
