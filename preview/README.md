# Duku Preview GitHub Action

Run a Duku exploration against your preview deployment on every pull
request and get a sticky PR comment with the top errors discovered.

> For long-lived environments (staging, prod canary, customer-specific
> deploys), use the [`environment`](../environment) action instead.

## Status

This action is **pre-release** (`0.x`). The orchestrated PR flow, preview
URL resolution, and Vercel Deployment Protection bypass are stable; the
public input/output surface may still tighten before `1.0`. See
[`CHANGELOG.md`](./CHANGELOG.md) for the version history.

## Usage

### Basic example

```yaml
permissions:
  contents: read
  pull-requests: write   # required to post the sticky PR comment
  deployments: read      # required for preview URL resolution

- uses: duku-ai/actions/preview@preview/v0.1.0
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    product-id: ${{ vars.PLATFORM_PRODUCT_ID }}
```

### With Vercel Deployment Protection

```yaml
- uses: duku-ai/actions/preview@preview/v0.1.0
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    product-id: ${{ vars.PLATFORM_PRODUCT_ID }}
    vercel-automation-bypass-secret: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
```

## Behavior

**Async by design.** On `pull_request` events the action resolves the
preview URL from GitHub, starts an exploration, posts a sticky "running"
PR comment, and exits in seconds. The Platform updates the same comment
in place with the final results once the exploration finishes — install
the [Duku AI GitHub App](https://github.com/apps/duku-ai) on the repo
for that terminal update to land.

Set `start-run: false` to skip the exploration and only register the
build with Duku.

On `push`, `schedule`, and `workflow_dispatch` triggers the action starts
an exploration and exits — no sticky comment is posted, because there is
no PR to comment on.

To post the PR comments from a **non-`pull_request`** trigger (e.g. a
deploy step that runs downstream of a PR event on `push` /
`deployment_status` / `workflow_run` / `repository_dispatch`), pass the
PR explicitly with `repository` + `pr-number`. The action then runs the
same PR flow as a native `pull_request` event. Combine with
`exploration-url` to supply the already-resolved preview URL — when it is
set, no `github-token` is required (the token is only used to resolve the
preview URL from GitHub APIs).

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `api-key` | Yes | — | Duku Platform API key. Generate in Viewport → Settings → API Keys. |
| `product-id` | Yes | — | Duku product ID (from Viewport → Products). |
| `start-run` | No | `true` | Start an exploration after registering the build. Set to `false` to register the build only. |
| `vercel-automation-bypass-secret` | No | *(empty)* | Vercel Deployment Protection bypass secret for protected previews. |
| `repository` | No | — | `owner/repo` to attach PR metadata to on a **non-`pull_request`** trigger (set together with `pr-number`). Runs the PR flow and posts both PR comments. |
| `pr-number` | No | — | PR number to attach to on a non-`pull_request` trigger (set together with `repository`). |
| `exploration-url` | No | _product base URL_ | Override the URL to explore. If unset and on a PR, the preview URL resolvers run; otherwise falls back to the product's base URL. When set, no `github-token` is required. |
| `preview-url-source` | No | `auto` | Preview URL resolver on `pull_request`. One of `auto`, `deployments`, `checks`, `statuses`, `comments`, `none`. |
| `preview-timeout-seconds` | No | `60` | How long to wait for the preview URL to appear (polling-based resolvers like comments). |
| `preview-poll-interval-seconds` | No | `5` | How frequently to poll for the preview URL. |
| `preview-deployment-environment-regex` | No | `preview\|review\|staging\|pr` | Regex matching the GitHub Deployment environment (Deployments resolver). |
| `preview-check-name-regex` | No | *(empty)* | Regex matching a Check Run name. If omitted, checks are skipped in `auto`. |
| `preview-status-context-regex` | No | *(empty)* | Regex matching a commit status context. If omitted, statuses are skipped in `auto`. |
| `preview-comment-author-logins` | No | *(empty)* | Comma-separated bot/user logins to scan in PR comments, e.g. `vercel[bot],netlify[bot]`. If omitted, comments are skipped in `auto`. |
| `preview-url-regex` | No | *(empty)* | Regex to extract the preview URL from provider text (Comments resolver). Defaults to a generic `http(s)` heuristic. |
| `github-token` | No | *(empty)* | Token used to resolve the preview URL from GitHub APIs (Deployments / Checks / Statuses / comments). Falls back to the `GITHUB_TOKEN` env. Not required when `exploration-url` is supplied. |
| `github-installation-id` | No | *(auto)* | Optional Duku AI GitHub App installation ID. The server auto-discovers this when the App is installed. |

## Outputs

| Name | Description |
|------|-------------|
| `target-id` | ID of the build registered with Duku. |
| `target-name` | Human-readable name of the build. |
| `target-version` | Version assigned to the build. |
| `run-id` | ID of the started exploration (when `start-run: true`). On PR runs, same as `exploration-batch-id`. |
| `run-status` | Kickoff status of the exploration. On PR runs: `running` — terminal status is posted to the PR comment by the Duku AI GitHub App. |
| `exploration-batch-id` | ID of the exploration (PR runs only). |
| `comment-id` | ID of the sticky "running" PR comment (PR runs only). |

## Permissions

```yaml
permissions:
  contents: read            # checkout
  pull-requests: write      # post + update the sticky error-summary comment
  deployments: read         # Deployments resolver
  checks: read              # Checks resolver (if used)
  statuses: read            # Statuses resolver (if used)
  issues: read              # PR comments resolver (if used)
```

`pull-requests: write` is required on `pull_request` runs so the action
can post the sticky comment.

## Repository configuration

Add the following in your repo (Settings → Secrets and variables → Actions):

| Name | Kind | Purpose |
|------|------|---------|
| `PLATFORM_API_KEY` | Secret | Duku Platform API key. |
| `PLATFORM_PRODUCT_ID` | Variable | Duku product ID (not sensitive). |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Secret (optional) | Vercel Deployment Protection bypass for protected previews. |

## Vercel preview URL

If your repo uses the Vercel GitHub integration, `preview-url-source: auto`
(the default) picks up the preview deployment via GitHub Deployments
first, falling back to PR comments. To force the comments path, point
the resolver at the Vercel bot:

```yaml
- uses: duku-ai/actions/preview@preview/v0.1.0
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    product-id: ${{ vars.PLATFORM_PRODUCT_ID }}
    preview-url-source: 'comments'
    preview-comment-author-logins: 'vercel[bot]'
```

## Examples

- [`examples/preview-pull-request.yml`](./examples/preview-pull-request.yml) — minimal `pull_request` workflow

## Troubleshooting

**Action not found.** Confirm you're pinning a tag that exists, e.g.
`duku-ai/actions/preview@preview/v0.1.0`. The floating major
(`preview/v1`) is only published once a stable `1.x` release is cut.

**API connection fails.** Verify `api-url` is reachable from GitHub
Actions runners, the `api-key` is current, and check the action logs for
the specific error.

**Sticky "running" PR comment missing.** On `pull_request` runs the
action posts the initial comment itself:

- Confirm the workflow grants `pull-requests: write` (or pass a
  `github-token` with that scope).
- Check the action logs for a 403 when posting the comment.

**Terminal results never appear in the PR comment.** The Platform
updates the comment via the Duku AI GitHub App after exploration
finishes:

- Verify the [Duku AI GitHub App](https://github.com/apps/duku-ai) is
  installed on the repo.
- Check exploration status in Viewport — if it's still running, the
  comment will update once it terminates.
