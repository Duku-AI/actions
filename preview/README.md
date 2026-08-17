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
preview URL from GitHub, starts an exploration, and exits in seconds.
The Platform posts a sticky "running" PR comment via the
[Duku AI GitHub App](https://github.com/apps/duku-ai) and updates it in
place with the final results once the exploration finishes — install
the App on the repo for the comments to land.

**Check run (merge gating).** On PR paths the Platform also manages a
GitHub **check run** named `Duku Exploration (<product name>)` on the PR
head commit: created `in_progress` when the exploration starts, concluded
`success` when the batch completes, `failure` when it fails, and
`timed_out` if it never reaches a terminal state within the Platform-side
deadline (2 hours by default, measured from exploration start). The check
reflects whether the exploration **ran to completion**, not whether it
found zero issues — the issues seen on the PR (new-vs-pre-existing, with
the ignored count disclosed) are listed in the check output just like the
PR comment, and a batch that completes with issues observed still
concludes `success`. The check is written server-side by
the Duku AI GitHub App; the action itself never *writes* to the Checks
API (the `checks: read` permission below is only for the preview-URL
resolver). See [Required check](#required-check) to gate merges on it.

Set `start-run: false` to skip the exploration and only register the
build with Duku.

On `push`, `schedule`, and `workflow_dispatch` triggers the action starts
an exploration and exits — no sticky comment is posted, because there is
no PR to comment on.

To post the PR comments from a **non-`pull_request`** trigger (e.g. a
deploy step that runs downstream of a PR event on `push` /
`deployment_status` / `workflow_run` / `repository_dispatch`), pass the
PR explicitly with `repository` + `pr-number`. The action then runs the
same PR flow as a native `pull_request` event — including the check run,
so a deploy-triggered exploration satisfies the required check too. One
caveat on that path: the Platform resolves the PR **head SHA at kickoff
time**, so if the PR advanced between the deploy and the kickoff, the
check lands on the newer head while the exploration ran against the
older deploy. Combine with `exploration-url` to supply the
already-resolved preview URL — when it is set, no `github-token` is
required (the token is only used to resolve the preview URL from GitHub
APIs).

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
| `run-status` | Kickoff status of the exploration. On PR runs: `triggered` — terminal status is posted to the PR comment by the Duku AI GitHub App. |
| `exploration-batch-id` | ID of the exploration (PR runs only). |
| `comment-id` | Always empty on PR events since 0.1.1 — the sticky comment is posted server-side by the Duku AI GitHub App, not by the action. |

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

The **workflow token needs no additional scopes for the check run** — it
is created and concluded server-side by the Duku AI GitHub App, which
needs **Checks: Read & write** on its installation (new), in addition to
the pull-request access the comment flow already uses. If your org
installed the App before this permission existed, GitHub prompts an org
admin to approve the update (Org Settings → GitHub Apps → Duku AI →
Review request). Until approval the Platform warns and skips check-run
writes, retrying for up to 7 days — approve mid-flight and recent
explorations get their checks retroactively.

## Repository configuration

Add the following in your repo (Settings → Secrets and variables → Actions):

| Name | Kind | Purpose |
|------|------|---------|
| `PLATFORM_API_KEY` | Secret | Duku Platform API key. |
| `PLATFORM_PRODUCT_ID` | Variable | Duku product ID (not sensitive). |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Secret (optional) | Vercel Deployment Protection bypass for protected previews. |

## Required check

To block merges until the exploration finishes, mark the check as
required in branch protection. The check run replaces CI jobs that poll
`batch(id) { status }`.

1. Install the [Duku AI GitHub App](https://github.com/apps/duku-ai) on
   the repo and have an org admin **approve the App's Checks permission**
   (see [Permissions](#permissions)). Do this first — a required check
   that the App cannot write blocks every merge.
2. Run the workflow once on any PR and note the exact check name:
   `Duku Exploration (<product name>)`. (A product with an empty name
   falls back to an internal target id — set the product name first so
   the check name is stable.)
3. Repo Settings → Branches → your protection rule → **Require status
   checks to pass** → add that name.
4. Delete the CI job that polls `batch(id) { status }`.

**Only require the check if the workflow genuinely runs on every PR you
gate.** A PR where no exploration starts leaves the required check as
"Expected — waiting" forever. Watch for: `paths:`/`branches:` filters or
`if:` conditions skipping the job, `start-run: false`, draft PRs your
workflow skips, and fork PRs (no secrets on `pull_request` from forks,
so the action cannot authenticate). If a PR wedges, the unblocks are
re-running the workflow, an admin merge, or removing the check from the
protection rule.

Semantics worth knowing:

- **Run the action once per product per commit.** The check name is
  keyed on your Duku product, not the PR or batch, so it is stable
  across PRs — but a second kickoff for the same product on the same
  commit creates a new run of the same name and resets the visible
  check to `in_progress` until it concludes.
- **Renaming the product renames the check** — update the branch
  protection rule after a rename, or merges block on a check that will
  never report again.
- **Wedged explorations conclude `timed_out` after the deadline and block
  the merge by design** (fail closed): an unfinished exploration must not
  satisfy a required check. Re-run the workflow — a fresh exploration
  supersedes the timed-out check. (Force-failing the stuck batch flips
  the check to `failure`; it tidies the batch but does not unblock the
  merge.) If the batch does finish later, the check re-converges to the
  real result automatically.
- **A force-push while an exploration is running** leaves the new head's
  check as "Expected — waiting" until the action runs again on the new
  commit (standard required-check semantics). A force-push in the window
  between the workflow starting and the Platform creating the check
  (normally seconds, but up to ~15 minutes when the first create attempt
  fails and the reconciler retries) can land the check on the new head
  with results from the old code — re-run the workflow after
  force-pushes to be safe.

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

**Sticky "running" PR comment missing.** Since 0.1.1 the comment is
posted server-side by the Duku AI GitHub App, not by the action:

- Verify the [Duku AI GitHub App](https://github.com/apps/duku-ai) is
  installed on the repo.
- Check the action logs confirm the exploration actually started (the
  comment is only posted for a started exploration with PR context).

**Terminal results never appear in the PR comment.** The Platform
updates the comment via the Duku AI GitHub App after exploration
finishes:

- Verify the [Duku AI GitHub App](https://github.com/apps/duku-ai) is
  installed on the repo.
- Check exploration status in Viewport — if it's still running, the
  comment will update once it terminates.

**Required check stuck on "Expected — waiting for status".** GitHub
shows this when the check name is required but no run exists on the head
commit. Causes, roughly in order of likelihood: the workflow didn't run
on this commit (skipped by `paths:`/`branches:`/`if:` filters, a draft
PR, a fork PR without secrets, or a force-push — re-run it);
`start-run: false` (no exploration means no check, ever); the App isn't
installed on the repo, or its Checks permission hasn't been approved by
an org admin yet; or the check name in branch protection no longer
matches (product renamed). Timing: the check normally appears within
seconds of the workflow run; if the first create attempt failed it can
take ~15 minutes for the Platform's reconciler to create it, and after
7 days it stops retrying entirely (old PRs need a workflow re-run).

**Check concluded `timed_out`.** The exploration didn't reach a terminal
state within the Platform's deadline. Blocking the merge here is
deliberate. Re-run the workflow — a fresh exploration supersedes the
timed-out check. If the batch finishes later, the check flips to the
real result on its own. (Force-failing the stuck batch marks it
`failure`, which still blocks; it's cleanup, not an unblock.)

**Check briefly shows `failure`, then flips to `success`.** A dispatch
handshake timing out can mark the batch failed while runs actually
proceed; when the runs finish, the Platform corrects the batch and
re-concludes the check automatically, and the merge unblocks without
intervention. (A CI job reading `batch(id) { status }` stops at the
first `failed` and never sees the correction.)

**Duplicate check runs on one commit.** Concurrent create paths (the
kickoff hook racing a reconciler retry) can rarely create an extra run;
the Platform tracks and concludes the newest one, which is the one
branch protection evaluates. The older run stays visible in the PR's
Checks tab as a permanent `in_progress` leftover — ignored by branch
protection, safe to ignore yourself.
