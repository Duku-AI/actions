# Platform Integration GitHub Action

A reusable GitHub Action that creates a Platform target for your build and (optionally) kicks off an exploration. **Async by design**: on `pull_request` events the action returns within seconds — the Platform posts results to the PR comment once the exploration terminates.

## Async by design

Explorations regularly take 5–40 minutes. Rather than burn GitHub Actions minutes while polling, this action:

1. Upserts the target.
2. Resolves the preview URL (if not provided).
3. Calls `startExploration` with PR metadata so the Platform knows where to post results.
4. Posts a single sticky "⏳ Exploration in progress" PR comment.
5. **Exits.**

When the exploration reaches a terminal status, the Platform updates the same sticky comment in place with the top unique errors — posting via the **Duku AI GitHub App**. Install the App on your repo: <https://github.com/apps/duku-ai>.

> Without the App installed, the running comment is posted but the terminal update never lands. The action still exits cleanly.

## Features

- **Async kickoff**: action exits in seconds, regardless of exploration duration
- **Sticky PR comment**: one comment that progresses `running → results` in place
- **Auto-populated context**: build references, URLs, versions extracted from GitHub
- **Preview URL resolution**: pulls from Deployments / Check Runs / Statuses / PR comments (configurable)
- **Outputs**: target ID/name/version + exploration batch ID + comment ID

## Usage

### Basic Example

```yaml
- name: Create Platform Target
  uses: duku-ai/actions/preview@preview/v0.1.0
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    subject-id: ${{ secrets.PLATFORM_SUBJECT_ID }}
```

### Full Example

```yaml
- name: Create Platform Target
  id: create-target
  uses: duku-ai/actions/preview@preview/v0.1.0
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    subject-id: ${{ secrets.PLATFORM_SUBJECT_ID }}
    api-url: https://platform.duku.ai/graphql
    start-run: 'true'
    # Optional: bypass Vercel Deployment Protection on preview deployments
    # vercel-automation-bypass-secret: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
```

Workflow `permissions:` block (required for the sticky comment on PR runs):

```yaml
permissions:
  contents: read
  pull-requests: write
  deployments: read   # for preview URL resolution
  checks: read        # for preview URL resolution
  statuses: read      # for preview URL resolution
```

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `api-key` | Yes | — | Platform API authentication token |
| `subject-id` | Yes | — | Simulation subject ID |
| `api-url` | No | `https://platform.duku.ai/graphql` | Platform API GraphQL endpoint URL |
| `start-run` | No | `false` | Start an exploration after creating the target. Required for the async PR-comment flow. |
| `vercel-automation-bypass-secret` | No | _(empty)_ | Stores `target.metadata.vercelAutomationBypassSecret` for Vercel Deployment Protection bypass |
| `exploration-url` | No | _(empty)_ | Override the URL to explore (defaults to subject `baseUrl`) |
| `preview-url-source` | No | `auto` | When `start-run=true` on a PR and `exploration-url` is not set, resolve the preview URL from GitHub using `auto` / `deployments` / `checks` / `statuses` / `comments` / `none` |
| `preview-timeout-seconds` | No | `60` | How long to wait for the preview URL to appear (polling resolvers) |
| `preview-poll-interval-seconds` | No | `5` | How frequently to poll for the preview URL |
| `preview-deployment-environment-regex` | No | _(empty)_ | Regex to match a GitHub Deployment environment. Defaults to `preview\|review\|staging\|pr` |
| `preview-check-name-regex` | No | _(empty)_ | Regex to match a Check Run name (Checks resolver). If omitted, checks are skipped in `auto`. |
| `preview-status-context-regex` | No | _(empty)_ | Regex to match a commit status context (Statuses resolver). If omitted, statuses are skipped in `auto`. |
| `preview-comment-author-logins` | No | _(empty)_ | Comma-separated bot/user logins to scan in PR comments (Comments resolver), e.g. `vercel[bot],netlify[bot]` |
| `preview-url-regex` | No | _(empty)_ | Regex to extract the preview URL from provider text (Comments resolver) |
| `github-installation-id` | No | — | Optional Duku GitHub App installation ID. The server can auto-discover this when the App is installed; supply it only if you have a custom installation map. |
| `github-token` | No | `${{ github.token }}` | Token used to post the sticky "running" PR comment (requires `pull-requests: write`) |
| `dashboard-url` | No | _(empty)_ | Base URL of the Platform dashboard, used to build batch links in the sticky comment |

## Outputs

| Name | Description |
|------|-------------|
| `target-id` | ID of the created target |
| `target-name` | Name of the created target |
| `target-version` | Version of the created target |
| `run-id` | ID of the started exploration batch (PR events: same as `exploration-batch-id`) |
| `run-status` | Kickoff status of the exploration: `running` on PR events (final status lands in the PR comment), or the server-reported initial status on non-PR events |
| `exploration-batch-id` | ID of the exploration batch (PR events) |
| `comment-id` | ID of the sticky PR comment posted by the action (PR events) |

## How the comment is posted

The sticky comment uses the marker `<!-- duku-preview-comment:v1 -->` to identify itself. On a PR event:

1. The action writes the "⏳ Exploration in progress" comment via `GITHUB_TOKEN` (workflow needs `pull-requests: write`).
2. When the Simulation Dispatcher marks the batch `completed`/`failed`, the Platform's PR-results reporter finds the marker comment via the **Duku AI GitHub App** installation and PATCHes it with the final run counts and top unique errors.

If the App is not installed on your repo, step 2 silently no-ops — install the App at <https://github.com/apps/duku-ai> to enable it.

## Repository Secrets Setup

Add these secrets to your repository (Settings → Secrets and variables → Actions):

1. **PLATFORM_API_KEY**: Platform API authentication token (Viewport → Settings → API Keys)
2. **PLATFORM_SUBJECT_ID**: Simulation subject ID for your project
3. **VERCEL_AUTOMATION_BYPASS_SECRET** _(optional)_: Vercel bypass secret for protected preview deployments

## Vercel Preview URL (PRs)

If your repo uses the Vercel GitHub integration, point the comments resolver at the Vercel bot to pick up the preview deployment URL:

```yaml
- uses: duku-ai/actions/preview@preview/v0.1.0
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    subject-id: ${{ secrets.PLATFORM_SUBJECT_ID }}
    start-run: 'true'
    preview-url-source: 'comments'
    preview-comment-author-logins: 'vercel[bot]'
```

`preview-url-source: 'auto'` (the default) tries Deployments first and falls back to Comments — usually the right choice.

## Development

```bash
cd actions-repo/preview
npm install
npm run build   # writes dist/index.js — must be committed
npm test
```

## Troubleshooting

### Running comment appears, terminal results never arrive

Install the Duku AI GitHub App on the repo: <https://github.com/apps/duku-ai>. The Platform posts the terminal results via the App, not via the workflow's `GITHUB_TOKEN`. Without the App, only the action's "running" comment is posted.

### `403` posting the running comment

Workflow needs `pull-requests: write`. The action writes the initial sticky comment via `GITHUB_TOKEN`; this scope is required.

### Action not finding the preview URL

- Try `preview-url-source: 'deployments'` and confirm Vercel/Netlify is creating a GitHub Deployment for the PR.
- Or use `preview-url-source: 'comments'` with the relevant bot login (e.g. `vercel[bot]`).
- Or pass `exploration-url` explicitly.

## End-to-end flow

1. Action runs in the client repo, upserts a `simulation_target`, optionally calls `startExploration` with `githubRepository` + `githubPrNumber`.
2. Action posts a sticky "running" PR comment via `GITHUB_TOKEN` and exits.
3. Platform creates a `simulation_batch`, runs explorations through Simulation Dispatcher → Discovery Orchestrator → Chrome Worker.
4. Simulation Dispatcher marks the batch terminal. Platform's PR-results reporter PATCHes the marker comment with the final results, posting via the Duku AI GitHub App.
