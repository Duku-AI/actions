# Platform Integration GitHub Action

A reusable GitHub Action that creates simulation targets in the Platform API for your builds.

## Features

- **Simple integration**: Single step in your workflow
- **Auto-populated context**: Build references, URLs, and versions automatically extracted from GitHub
- **PR error summary (automatic on `pull_request` runs)**: When `start-run: true` runs on a PR, the action polls exploration to completion and posts a sticky PR comment with the top 10 unique errors discovered (posted via the workflow's `GITHUB_TOKEN`, so it requires `pull-requests: write`)
- **GitHub App fallback (non-PR triggers)**: If exploration is started outside a `pull_request` event but with PR metadata supplied, Platform posts the summary comment as the **Duku AI** GitHub App instead
- **Outputs**: Provides target ID, name, and version for use in subsequent workflow steps

## Usage

### Basic Example

```yaml
- name: Create Platform Target
  uses: YOUR-ORG/chrome-worker/.github/actions/platform-integration@main
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    subject-id: ${{ secrets.PLATFORM_SUBJECT_ID }}
```

### Full Example with All Options

```yaml
- name: Create Platform Target
  id: create-target
  uses: YOUR-ORG/chrome-worker/.github/actions/platform-integration@main
  with:
    # Required inputs
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    subject-id: ${{ secrets.PLATFORM_SUBJECT_ID }}

    # Optional inputs
    api-url: https://platform-api.example.com/graphql
    start-run: 'true'

    # Optional: allow chrome automation to bypass Vercel Deployment Protection on preview deployments
    # (stored on target.metadata and used by the worker via x-vercel-protection-bypass)
    # vercel-automation-bypass-secret: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}

# If start-run: true may run on a pull_request, the workflow needs:
#   permissions:
#     pull-requests: write   # action posts a sticky PR comment via GITHUB_TOKEN
#     deployments: read      # for preview URL resolution

- name: Use target outputs
  run: |
    echo "Target ID: ${{ steps.create-target.outputs.target-id }}"
    echo "Target Name: ${{ steps.create-target.outputs.target-name }}"
    echo "Target Version: ${{ steps.create-target.outputs.target-version }}"
```

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `api-key` | Yes | - | Platform API authentication token |
| `subject-id` | Yes | - | Simulation subject ID |
| `api-url` | No | `https://platform.duku.ai/graphql` | Platform API GraphQL endpoint URL |
| `start-run` | No | `false` | Start an exploration run via `startExploration` after creating the target |
| `vercel-automation-bypass-secret` | No | *(empty)* | Stores `target.metadata.vercelAutomationBypassSecret` for Vercel Deployment Protection bypass (worker sends `x-vercel-protection-bypass`) |
| `exploration-url` | No | *(empty)* | Override the URL to explore (defaults to subject `baseUrl`) |
| `preview-url-source` | No | `auto` | When `start-run=true` on a PR and `exploration-url` is not set, resolve the preview URL from GitHub using Deployments/Checks/Statuses/Comments |
| `preview-timeout-seconds` | No | *(empty)* | How long to wait for the preview URL to appear (polling-based resolvers like comments). Defaults to `60` |
| `preview-poll-interval-seconds` | No | *(empty)* | How frequently to poll for the preview URL (polling-based resolvers like comments). Defaults to `5` |
| `preview-deployment-environment-regex` | No | *(empty)* | Regex to match a GitHub Deployment environment (Deployments resolver). Defaults to `preview|review|staging|pr` |
| `preview-check-name-regex` | No | *(empty)* | Regex to match a Check Run name (Checks resolver). If omitted, checks are skipped in `auto` |
| `preview-status-context-regex` | No | *(empty)* | Regex to match a commit status context (Statuses resolver). If omitted, statuses are skipped in `auto` |
| `preview-comment-author-logins` | No | *(empty)* | Comma-separated bot/user logins to scan in PR comments (Comments resolver), e.g. `vercel[bot],netlify[bot]` |
| `preview-url-regex` | No | *(empty)* | Regex to extract the preview URL from provider text (Comments resolver). If omitted, uses a generic `http(s)` URL heuristic |
| `exploration-poll-timeout-seconds` | No | `2400` | Max seconds the action will wait for exploration to reach a terminal status when running on a `pull_request` |
| `exploration-poll-interval-seconds` | No | `15` | Seconds between exploration status polls |
| `github-token` | No | `${{ github.token }}` | Token used to post/update the sticky PR comment (requires `pull-requests: write`) |
| `dashboard-url` | No | *(empty)* | Base URL of the Platform dashboard used to build batch links in the sticky comment |

## Outputs

| Name | Description |
|------|-------------|
| `target-id` | ID of the created target |
| `target-name` | Name of the created target |
| `target-version` | Version of the created target |
| `run-id` | ID of the started exploration job (if `start-run` is true) |
| `run-status` | Status of the started exploration job (if `start-run` is true) |
| `exploration-batch-id` | ID of the exploration batch (when orchestrated on a `pull_request`) |
| `exploration-status` | Terminal status of the exploration batch (when orchestrated on a `pull_request`) |
| `comment-id` | ID of the sticky PR comment (when orchestrated on a `pull_request`) |

## Environment Variables

When `start-run: true` runs on a `pull_request`, the action posts the sticky error-summary comment itself using the workflow's `GITHUB_TOKEN` (or the `github-token` input). The workflow must therefore grant `pull-requests: write` — see [Permissions](#permissions). Preview URL resolution (e.g. `preview-url-source=auto`) also reads GitHub data for the PR via that same token.

Outside of a `pull_request` event the action does not need a GitHub token for commenting — Platform handles non-PR result reporting via the Duku AI GitHub App.

## Repository Secrets Setup

Add these secrets to your repository (Settings → Secrets and variables → Actions):

1. **PLATFORM_API_KEY**: Authentication token for Platform API
2. **PLATFORM_SUBJECT_ID**: Simulation subject ID for your project
3. **PLATFORM_API_URL** (optional): Override default API URL
4. **VERCEL_AUTOMATION_BYPASS_SECRET** (optional): Vercel bypass secret used for protected preview deployments (passed to `vercel-automation-bypass-secret`)

## Permissions

Recommended workflow permissions:

```yaml
permissions:
  contents: read            # checkout
  pull-requests: write      # required for the sticky error-summary comment on PR runs
  issues: read              # PR comments (GitHub API models PRs as issues)
  deployments: read         # GitHub Deployments (preview URL resolution)
  checks: read              # Check Runs (preview URL resolution)
  statuses: read            # Commit Statuses (preview URL resolution)
```

`pull-requests: write` is required because the action posts the error-summary comment itself when `start-run: true` runs on a `pull_request`. Outside of PR triggers (e.g. push/schedule), Platform falls back to posting via the **Duku AI GitHub App** instead, and `pull-requests: read` is sufficient.

## Vercel Preview URL (PRs)

If your repo uses the Vercel GitHub integration, point the comments resolver at the Vercel bot to pick up the preview deployment URL it posts on the PR:

```yaml
- name: Create Platform Target
  uses: YOUR-ORG/chrome-worker/.github/actions/platform-integration@main
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    subject-id: ${{ secrets.PLATFORM_SUBJECT_ID }}
    start-run: 'true'
    preview-url-source: 'comments'
    preview-comment-author-logins: 'vercel[bot]'
    # Optional tuning:
    # preview-timeout-seconds: '60'
    # preview-poll-interval-seconds: '5'
```

`preview-url-source: 'auto'` (the default) also picks up Vercel preview URLs via GitHub Deployments first, falling back to comments — usually the right choice unless your Vercel project doesn't publish a Deployment.

## Preview exploration with PR error report

When `start-run: true` runs on a `pull_request` event, the action automatically drives the full flow: resolves the preview URL, starts exploration, polls until it reaches a terminal status, and posts/updates one sticky PR comment summarising the run with the top 10 unique errors discovered.

```yaml
permissions:
  contents: read
  pull-requests: write   # write needed to post/update the sticky comment
  deployments: read

- name: Preview exploration
  id: preview-run
  uses: YOUR-ORG/chrome-worker/.github/actions/platform-integration@main
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    subject-id: ${{ secrets.PLATFORM_SUBJECT_ID }}
    start-run: 'true'
    # Optional: tune polling
    # exploration-poll-timeout-seconds: '2400'
    # exploration-poll-interval-seconds: '15'
    # Optional: link the batch to your dashboard in the comment
    # dashboard-url: 'https://platform.duku.ai'
```

The action calls `startExploration` without PR metadata (so the server-side reporter does not also post), polls `batch(id)` until exploration is terminal, then renders one combined comment: status badge + run counts + top 10 unique errors (aggregated by `type/level/severity/message/url`). If no errors are discovered the comment reads `🎉 No errors detected.`

Outside of a `pull_request` event the action falls back to fire-and-forget `startExploration` (no polling, no sticky comment).

The orchestrated flow re-exchanges the API key for a fresh access token automatically when the cached token nears expiry, so exploration and test-run phases longer than the Keycloak token TTL (~5min) work without intervention.

## Complete Workflow Template

See [.github/workflows/platform-target.yml.template](../../workflows/platform-target.yml.template) for a complete workflow example.

## Preview URL resolution (generic)

### Auto mode (recommended)

```yaml
- name: Create Platform Target
  uses: YOUR-ORG/chrome-worker/.github/actions/platform-integration@main
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    subject-id: ${{ secrets.PLATFORM_SUBJECT_ID }}
    start-run: 'true'
    preview-url-source: 'auto'   # Deployments → Checks → Statuses → Comments
```

### Comments mode (for providers that comment on PRs)

```yaml
- name: Create Platform Target
  uses: YOUR-ORG/chrome-worker/.github/actions/platform-integration@main
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    subject-id: ${{ secrets.PLATFORM_SUBJECT_ID }}
    start-run: 'true'
    preview-url-source: 'comments'
    preview-comment-author-logins: 'vercel[bot],netlify[bot]'
    # Optional: preview-url-regex: '(https?://\\S+)'
```

## Development

### Building the Action

```bash
cd actions-repo/preview
npm install
npm run build
```

This creates `dist/index.js` which must be committed to the repository.

## Troubleshooting

### Action not found

Ensure you're using the correct repository path and branch:
```yaml
uses: YOUR-ORG/chrome-worker/.github/actions/platform-integration@main
```

### API connection fails

- Verify `api-url` is accessible from GitHub Actions runners
- Check that `api-key` is valid
- Review action logs for specific error messages

### PR comments not appearing

On a `pull_request` run with `start-run: true`, the action posts the sticky error-summary comment itself. If it's missing:

- Confirm the workflow grants `pull-requests: write` (or pass `github-token:` with a token that has that scope)
- Check the action logs for a 403 from `issues.createComment` / `issues.updateComment`
- Confirm `start-run: true` was set and exploration actually reached a terminal status within `exploration-poll-timeout-seconds`

For non-PR triggers (push/schedule with PR metadata supplied), Platform posts the comment via the **Duku AI GitHub App**:

- Verify the repo has installed the **Duku AI GitHub App**: `https://github.com/apps/duku-ai`
- Verify the Platform backend is configured with:
  - `GITHUB_APP_ID`
  - `GITHUB_APP_PRIVATE_KEY`
  - `PLATFORM_DASHBOARD_URL` (for the Run Details link)
- Verify the batch was created with `githubRepository` and `githubPrNumber` set

## Documentation

For detailed setup instructions, see:
- [GitHub Actions Integration Guide](../../../docs/github-runner-setup.md)
- [Platform API Documentation](../../../apps/api/platform/README.md)

## End-to-end flow (technical)

1. **Action runs in the client repo**
   - Upserts a `simulation_target` in Platform (one per PR/commit via a stable build key)
   - Optionally sets `target.metadata.vercelAutomationBypassSecret`
   - Optionally starts an exploration (`startExploration`). On `pull_request` runs the action deliberately omits PR metadata so the server-side reporter does not also post — the action owns the comment lifecycle. Off-PR triggers may still attach PR metadata to delegate posting to Platform.

2. **Platform creates a batch + runs**
   - Stores any supplied PR metadata on `simulation_batch` (`github_repository`, `github_pr_number`, …)
   - Dispatches execution to Simulation Dispatcher

3. **Simulation Dispatcher executes runs**
   - Allocates workers, calls Discovery Orchestrator, which calls Chrome Worker
   - Chrome Worker captures errors into Platform (`simulation_error`)

4. **Completion**
   - Simulation Dispatcher marks the batch `completed`/`failed` by calling Platform `updateSimulationBatch`
   - On `pull_request` runs the **action** posts/updates a single sticky comment via `GITHUB_TOKEN` summarising the top 10 unique errors and linking to the run detail page
   - On non-PR triggers that supplied PR metadata, Platform instead posts the summary comment **as the Duku AI GitHub App**
