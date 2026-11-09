# Duku Preview GitHub Action

Run a Duku exploration against your preview deployment on every pull
request and get a sticky PR comment with the top errors discovered.

> For long-lived environments (staging, prod canary, customer-specific
> deploys), use the [`environment`](../environment) action instead.
>
> This action is for web products only. On an Android product it stops before
> recording anything; test an Android build with the environment action's
> [`apk-path`](../environment#android-builds) instead.

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

- uses: duku-ai/actions/preview@preview/v0.5.0
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    product-id: ${{ vars.PLATFORM_PRODUCT_ID }}
```

### With a protected preview (request headers and secrets)

A preview behind Vercel Deployment Protection, a Cloudflare Access policy or
basic auth turns away a browser that does not send the right header. Give the
action the headers each run sends (`request-headers`) and the secrets those
headers reference (`request-secrets`).

These two inputs need the first release of this action after
`preview/v0.5.0` (listed under Unreleased in the [CHANGELOG](./CHANGELOG.md));
`v0.5.0` does not have them. Until that release is tagged, keep `@preview/v0.5.0`
with `vercel-automation-bypass-secret`.

For Vercel Deployment Protection:

```yaml
# vNEXT: the first release after v0.5.0, see the note above.
- uses: duku-ai/actions/preview@preview/vNEXT
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    product-id: ${{ vars.PLATFORM_PRODUCT_ID }}
    request-headers: |
      x-vercel-protection-bypass: {{secret.vercel_bypass}}
    request-secrets: |
      vercel_bypass=${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
```

For a Cloudflare Access service token:

```yaml
    request-headers: |
      cf-access-client-id: {{secret.cf_client_id}}
      cf-access-client-secret: {{secret.cf_client_secret}}
    request-secrets: |
      cf_client_id=${{ secrets.CF_ACCESS_CLIENT_ID }}
      cf_client_secret=${{ secrets.CF_ACCESS_CLIENT_SECRET }}
```

How the two inputs work:

- `request-headers` takes one `Name: value` per line. A value is stored and
  shown in plain text, so every secret part goes in a `{{secret.<name>}}`
  reference. For `authorization`, `x-vercel-protection-bypass`,
  `cf-access-client-id`, `cf-access-client-secret` and `x-api-key` the
  Platform refuses anything but one reference, optionally after `Basic`,
  `Bearer`, `Key` or `Token` (`authorization: Basic {{secret.staging_basic}}`).
- `request-secrets` takes one `name=value` per line; a name is 1 to 64 of
  `a-z`, `0-9` and `_`, and not `__proto__`. The action masks every value in
  the job log. Duku stores it encrypted on this build and never returns it in
  any read. A line with an empty value fails the step: GitHub leaves
  `${{ secrets.NAME }}` empty when the run cannot read the secret, for example
  on a pull request from a fork or one opened by Dependabot.
- Both are saved on the build the action records for this commit, and each
  run of that build sends the headers only to the origin of the URL it
  explores, so the preview gets them and the third-party sites it loads do not.
- A header may also reference a secret an org admin saved on the product or
  the environment. That secret goes only to the origins saved with it (by
  default the origin of the product's base URL or of the environment's URL);
  on a request to any other origin the header that references it is not sent.
- If the environment has a header or a secret of the same name as one of
  yours, the environment's one is used.

The `vercel-automation-bypass-secret` input still works: Duku turns it into
the secret `vercel_automation_bypass` and the header
`x-vercel-protection-bypass: {{secret.vercel_automation_bypass}}` on the same
build. One thing changes: the header used to be sent only to previews on a
`*.vercel.app` host, but with every request those pages made, third parties
included. It now goes only to the origin of the URL the run explores, whatever
its host, so a Vercel custom domain works too. Do not set the old input
together with `request-headers` or `request-secrets` (the action warns when
you do): move the secret into `request-secrets` and remove the old input.

## Behavior

**Async by design.** On `pull_request` events the action resolves the
preview URL from GitHub, starts Duku's test of the pull request, and exits
in seconds. The Platform posts one PR comment per product via the
[Duku AI GitHub App](https://github.com/apps/duku-ai), listing each mission
the test tried with its result, and updates it in place when the test
finishes and on later pushes — install the App on the repo for the comments
to land.

**Check run (merge gating).** On PR paths the Platform also manages a
GitHub **check run** named `Duku Exploration (<product name>)` on the PR
head commit: created when the test starts, and concluded when it finishes:

- `success` when every mission and flow the test tried worked.
- `neutral` otherwise, including a test that didn't finish within the
  Platform-side deadline (2 hours). `neutral` doesn't block the merge: a
  problem on our side never holds up your PR.

The check output carries the same results as the PR comment. Issues the
comment lists never change the check. The check is written server-side by
the Duku AI GitHub App; the action itself never *writes* to the Checks
API (the `checks: read` permission below is only for the preview-URL
resolver). See [Required check](#required-check) to gate merges on it.

**Preview URL resolution.** `preview-url-source: auto` (the default) tries
the three resolvers keyed on the head commit, in order: GitHub
**Deployments**, then **Check Runs**, then commit **Statuses**. It stops at
the first hit and records which resolver won on the build (`preview-url-source`
output, `deployment.urlSource` in the Platform). `auto` deliberately never
reads PR comments — provider bots advertise a *branch alias*, which moves to
the next push, so exploring it can report a different build's behaviour as
this commit's. Pass `preview-url-source: comments` to opt into that anyway.

Set `run-exploration: false` (`start-run` is a deprecated alias) to skip the
exploration and only register the build with Duku.

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
| `run-exploration` | No | `true` | Start an exploration after registering the build. Set to `false` to register the build only. |
| `start-run` | No | `true` | **Deprecated alias for `run-exploration`.** |
| `release-label` | No | — | Human-readable release name for this build, e.g. `1.4.2`. Recorded alongside the commit SHA and used as the build version. |
| `request-headers` | No | *(empty)* | Headers each run of this build sends to the preview, one `Name: value` per line. Put secret parts in `{{secret.<name>}}` references. See [With a protected preview](#with-a-protected-preview-request-headers-and-secrets). |
| `request-secrets` | No | *(empty)* | Secrets the headers reference, one `name=value` per line. Masked in the job log, stored encrypted, never returned. |
| `vercel-automation-bypass-secret` | No | *(empty)* | Still supported: the Vercel Deployment Protection bypass secret, sent as `x-vercel-protection-bypass` to the origin of the URL the run explores. Do not set it together with `request-headers` or `request-secrets`; new workflows use those. |
| `repository` | No | — | `owner/repo` to attach PR metadata to on a **non-`pull_request`** trigger (set together with `pr-number`). Runs the PR flow and posts both PR comments. |
| `pr-number` | No | — | PR number to attach to on a non-`pull_request` trigger (set together with `repository`). |
| `exploration-url` | No | _product base URL_ | Override the URL to explore. If unset and on a PR, the preview URL resolvers run; otherwise falls back to the product's base URL. When set, no `github-token` is required. |
| `preview-url-source` | No | `auto` | Preview URL resolver on `pull_request`. One of `auto`, `deployments`, `checks`, `statuses`, `comments`, `none`. `auto` runs only the sha-keyed resolvers (deployments → checks → statuses) and never reads PR comments. |
| `preview-timeout-seconds` | No | `60` | How long to wait for the preview URL to appear (polling-based resolvers like comments). |
| `preview-poll-interval-seconds` | No | `5` | How frequently to poll for the preview URL. |
| `preview-deployment-environment-regex` | No | `preview\|review\|staging\|pr` | Regex matching the GitHub Deployment environment (Deployments resolver). |
| `preview-check-name-regex` | No | *(empty)* | Regex matching a Check Run name. If omitted, checks are skipped in `auto`. |
| `preview-status-context-regex` | No | *(empty)* | Regex matching a commit status context. If omitted, statuses are skipped in `auto`. |
| `preview-comment-author-logins` | No | *(empty)* | Comma-separated bot/user logins to scan in PR comments, e.g. `vercel[bot],netlify[bot]`. If omitted, comments are skipped in `auto`. |
| `preview-url-regex` | No | *(empty)* | Regex to extract the preview URL from provider text (Comments resolver). Defaults to a generic `http(s)` heuristic. |
| `wait-for-target-seconds` | No | *(empty)* | Seconds to let the platform wait for the resolved URL to actually **serve** before dispatching. The resolvers above only prove a URL was *published*; a preview that loses the race with its own deploy is still cold when the run fires. Empty dispatches immediately, as before. The platform caps the window and warns in the step log if it shortens your request. |
| `credential-set` | No | *(empty)* | The credential set to log in with, by name or ID, from this product's sets. An unknown set fails the step; it never falls back to the default. Empty uses the product's default login. Ignored when `run-exploration` is false. |
| `github-token` | No | *(empty)* | Token used to resolve the preview URL from GitHub APIs (Deployments / Checks / Statuses / comments). Falls back to the `GITHUB_TOKEN` env. Not required when `exploration-url` is supplied. |
| `github-installation-id` | No | *(auto)* | Optional Duku AI GitHub App installation ID. The server auto-discovers this when the App is installed. |

## Outputs

| Name | Description |
|------|-------------|
| `target-id` | ID of the build registered with Duku. |
| `target-name` | Human-readable name of the build. |
| `target-version` | Version assigned to the build. |
| `run-id` | ID of the started exploration (when `run-exploration: true`). On PR runs, same as `exploration-batch-id`. |
| `run-status` | Kickoff status of the exploration. On PR runs: `triggered` — terminal status is posted to the PR comment by the Duku AI GitHub App. |
| `exploration-batch-id` | ID of the exploration (PR runs only). |
| `comment-id` | Always empty on PR events since 0.1.1 — the sticky comment is posted server-side by the Duku AI GitHub App, not by the action. |
| `preview-url-source` | Which resolver produced the preview URL: `deployments`, `checks`, `statuses`, `comments`, or `override` when `exploration-url` was set. Empty when none resolved. |

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
Review request). Until approval the Platform warns and retries the
check-run writes.

## Repository configuration

Add the following in your repo (Settings → Secrets and variables → Actions):

| Name | Kind | Purpose |
|------|------|---------|
| `PLATFORM_API_KEY` | Secret | Duku Platform API key. |
| `PLATFORM_PRODUCT_ID` | Variable | Duku product ID (not sensitive). |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Secret (optional) | Vercel Deployment Protection bypass for protected previews, passed in `request-secrets`. |

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
`if:` conditions skipping the job, `run-exploration: false`, draft PRs your
workflow skips, and fork PRs (no secrets on `pull_request` from forks,
so the action cannot authenticate). If a PR wedges, the unblocks are
re-running the workflow, an admin merge, or removing the check from the
protection rule.

Semantics worth knowing:

- **The check name is keyed on your Duku product**, not the PR or batch,
  so it is stable across PRs.
- **Renaming the product renames the check** — update the branch
  protection rule after a rename, or merges block on a check that will
  never report again.
- **A test that doesn't finish concludes `neutral`** after the deadline, so
  it doesn't block the merge.
- **A force-push while a test is running** leaves the new head's check as
  "Expected — waiting" until the action runs again on the new commit
  (standard required-check semantics).

## Vercel preview URL

If your repo uses the Vercel GitHub integration, `preview-url-source: auto`
(the default) picks up the preview deployment via GitHub Deployments — the
per-commit URL Vercel publishes for that exact build.

The Vercel bot's PR comment is a different thing. Its **Preview** link is the
*branch alias* (`<project>-git-<branch>-<team>.vercel.app`), which Vercel
re-points at every new deployment on the branch. `auto` will never use it: by
the time an exploration navigates it, the alias may already serve the next
push, and the run would attribute another build's behaviour to this commit.
Opt in explicitly if you want it anyway:

```yaml
- uses: duku-ai/actions/preview@preview/v0.5.0
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
`duku-ai/actions/preview@preview/v0.5.0`. The floating major
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
`run-exploration: false` (no exploration means no check, ever); the App isn't
installed on the repo, or its Checks permission hasn't been approved by
an org admin yet; or the check name in branch protection no longer
matches (product renamed). Timing: the check normally appears within
seconds of the workflow run; if the first create attempt fails, the
Platform retries it a few minutes later.

**Check concluded `neutral`.** A mission or flow the test tried didn't
work, or the test didn't finish within the deadline. It doesn't block the
merge; the check output and the PR comment list each mission's result.
