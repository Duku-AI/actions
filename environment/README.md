# Duku Environment GitHub Action

Kicks off a Duku exploration against a pre-created environment target, triggers
a full test-case run, and exits. **Async by design**: both exploration and test
phases run asynchronously in the Platform — the GitHub job does not wait for
either to complete.

Use this action on `push`, `schedule`, or `workflow_dispatch` events to fire
explorations + test runs at stable, long-lived environment targets (e.g.
staging, prod canary, customer-specific deploys). The target must already exist
in Viewport; the action references it by `target-id`.

> For PR-preview workflows where each PR gets its own ephemeral target,
> use the [`preview`](../preview) action instead.

## Async by design

Explorations and test batches regularly take 5–40 minutes each. Rather than
burn GitHub Actions minutes polling, the action:

1. Fetches the target's `buildUrl`.
2. Calls `startExploration`.
3. Calls `runAllTestCases`.
4. **Exits.**

Terminal results appear in Viewport. If you happen to invoke this action on a
`pull_request` event with the **Duku AI GitHub App** installed
(<https://github.com/apps/duku-ai>), the Platform also posts terminal results
to the PR comment.

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
| `url` | No | _target `buildUrl`_ | Override the URL to explore. |
| `api-url` | No | `https://platform.duku.ai/graphql` | Platform API GraphQL endpoint. |
| `auth-url` | No | _derived from `api-url`_ | Keycloak override (swap `platform.` → `auth.` in the api-url host). |
| `github-installation-id` | No | — | Optional Duku GitHub App installation ID. The server auto-discovers this when the App is installed. |
| `github-token` | No | `${{ github.token }}` | Used only on `pull_request` events to post a sticky "running" PR comment. Not used on push/schedule/workflow_dispatch. |
| `test-runs-per-path` | No | _platform default_ | Override `runsPerPath` on `runAllTestCases`. |
| `test-paths-per-goal` | No | _platform default_ | Override `pathsPerGoal` on `runAllTestCases`. |

## Outputs

| Name | Description |
|------|-------------|
| `run-id` | ID of the exploration batch. |
| `run-status` | Kickoff status: `triggered` (running asynchronously — see Viewport for terminal status). |
| `test-run-id` | ID of the test-run (intent) batch. Empty when the target has no test cases configured. |
| `test-run-status` | Kickoff status of the test-run batch: `triggered`, or `skipped` (target has no test cases configured). |
| `comment-id` | ID of the sticky PR comment posted by the action (only set when invoked on a `pull_request` event with a `github-token`). |

## Examples

- [`examples/environment-push.yml`](./examples/environment-push.yml) — minimal `push`-trigger workflow
- See [`docs/github-runner-setup.md`](../../docs/github-runner-setup.md) for
  a side-by-side comparison with the [`preview`](../preview) action.

## Status

This action is **pre-release** (`0.x`). It kicks off exploration + tests
asynchronously. `fail-on` thresholds and Check Run integration come in later
releases — until then, gate merges on the platform-side comment / Viewport.

See [`CHANGELOG.md`](./CHANGELOG.md) for the version history.
