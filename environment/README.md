# Duku Environment GitHub Action

Kicks off a Duku exploration against a pre-created environment target,
triggers a full test-case run, and exits. **Async by design**: both
exploration and test phases run asynchronously in the Platform — the
GitHub job does not wait for either to complete.

Use this action on `push`, `schedule`, or `workflow_dispatch` events to
fire explorations + test runs at long-lived environment targets (e.g.
staging, prod canary, customer-specific deploys). The target must
already exist in Viewport; the action references it by `target-id`.

> For PR-preview workflows where each PR gets its own ephemeral target,
> use the [`preview`](../preview) action instead.

## Async by design

Explorations and test batches regularly take 5–40 minutes each. Rather
than burn GitHub Actions minutes polling, the action kicks off the
exploration and test run and exits. Terminal results appear in Viewport.
If you happen to invoke this action on a `pull_request` event with the
**Duku AI GitHub App** installed (<https://github.com/apps/duku-ai>),
the Platform also posts terminal results to the PR comment.

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
| `api-key` | Yes | — | Duku Platform API key. Generate in Viewport → Settings → API Keys. |
| `target-id` | Yes | — | Pre-created environment target ID (from Viewport). |
| `url` | No | _target build URL_ | Override the URL to explore. |
| `github-token` | No | `${{ github.token }}` | Used only on `pull_request` events to post a sticky "running" PR comment. Not used on push / schedule / workflow_dispatch. |
| `test-runs-per-path` | No | _platform default_ | Override the number of test runs per path. |
| `test-paths-per-goal` | No | _platform default_ | Override the number of paths per goal. |

## Outputs

| Name | Description |
|------|-------------|
| `run-id` | ID of the exploration. |
| `run-status` | Kickoff status (`triggered`) — running asynchronously; terminal status is in Viewport. |
| `test-run-id` | ID of the test-run batch. Empty when the target has no test cases configured. |
| `test-run-status` | Kickoff status of the test-run batch (`triggered`, or `skipped` when the target has no test cases). |
| `comment-id` | ID of the sticky PR comment (only set when invoked on a `pull_request` event with a `github-token`). |

## Examples

- [`examples/environment-push.yml`](./examples/environment-push.yml) — minimal `push`-trigger workflow

## Status

This action is **pre-release** (`0.x`). It kicks off exploration + tests
asynchronously. `fail-on` thresholds and Check Run integration come in
later releases — until then, gate merges on the platform-side comment /
Viewport.

See [`CHANGELOG.md`](./CHANGELOG.md) for the version history.
