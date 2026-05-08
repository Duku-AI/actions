# Platform Integration GitHub Action

A reusable GitHub Action that creates simulation targets in the Platform API for your builds.

## Features

- **Simple integration**: Single step in your workflow
- **Auto-populated context**: Build references, URLs, and versions automatically extracted from GitHub
- **PR results comment (via GitHub App)**: Platform posts a PR comment summarizing errors after exploration completes (as **Duku AI**, not `github-actions[bot]`)
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

## Outputs

| Name | Description |
|------|-------------|
| `target-id` | ID of the created target |
| `target-name` | Name of the created target |
| `target-version` | Version of the created target |
| `run-id` | ID of the started exploration job (if `start-run` is true) |
| `run-status` | Status of the started exploration job (if `start-run` is true) |

## Environment Variables

This action does **not** require `GITHUB_TOKEN` to post results comments.

If you enable preview URL resolution (e.g. `preview-url-source=auto`), the action reads GitHub data for the PR using the workflow-provided `GITHUB_TOKEN`.

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
  pull-requests: read       # PR context
  issues: read              # PR comments (GitHub API models PRs as issues)
  deployments: read         # GitHub Deployments (preview URL resolution)
  checks: read              # Check Runs (preview URL resolution)
  statuses: read            # Commit Statuses (preview URL resolution)
```

Platform posts the final results comment using the **Duku AI GitHub App**, not `GITHUB_TOKEN`.

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

If the **results** PR comment is not appearing:

- Verify the repo has installed the **Duku AI GitHub App**: `https://github.com/apps/duku-ai`
- Verify the Platform backend is configured with:
  - `GITHUB_APP_ID`
  - `GITHUB_APP_PRIVATE_KEY`
  - `PLATFORM_DASHBOARD_URL` (for the Run Details link)
- Verify the exploration was started from a PR context (Platform stores `github_repository` and `github_pr_number` on the batch)

## Documentation

For detailed setup instructions, see:
- [GitHub Actions Integration Guide](../../../docs/github-runner-setup.md)
- [Platform API Documentation](../../../apps/api/platform/README.md)

## End-to-end flow (technical)

1. **Action runs in the client repo**
   - Upserts a `simulation_target` in Platform (one per PR/commit via a stable build key)
   - Optionally sets `target.metadata.vercelAutomationBypassSecret`
   - Optionally starts an exploration (`startExploration`) and passes PR metadata (repo + PR number)

2. **Platform creates a batch + runs**
   - Stores PR metadata on `simulation_batch` (`github_repository`, `github_pr_number`, …)
   - Dispatches execution to Simulation Dispatcher

3. **Simulation Dispatcher executes runs**
   - Allocates workers, calls Discovery Orchestrator, which calls Chrome Worker
   - Chrome Worker captures errors into Platform (`simulation_error`)

4. **Completion**
   - Simulation Dispatcher marks the batch `completed`/`failed` by calling Platform `updateSimulationBatch`
   - Platform then posts a PR comment **as the Duku AI GitHub App** summarizing `uniqueErrors` and linking to the run detail page.
