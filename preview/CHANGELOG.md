# Changelog

All notable changes to the `preview` action will be documented in this file.

## [Unreleased]

- **App-version axis: per-commit build identity.** The action now stamps every
  build with the commit it came from, so observations can be told apart by
  release.
  - The build key is now **per-commit** (`…:pr={n}:sha={full}`), not per-PR —
    one Target per build instead of one mutable Target per PR. Target names gain
    the short SHA so a PR's many builds don't collapse into identical labels.
  - `commitSha` is sent **only from a verified source** (a `pull_request` head,
    a `push` `GITHUB_SHA`, or an octokit PR-head fetch on the explicit
    `repository`/`pr-number` path). On `workflow_run` / `deployment_status` the
    `GITHUB_SHA` describes the *workflow's* ref, not the build, so it is never
    trusted — the Platform mints an honest metadata-only version instead.
  - `lineage` is the head branch ref (fork refs qualified `{head_repo}:{ref}`);
    `parentCommitSha` orders the release DAG. The PR number is display metadata,
    never identity. It comes from the same verified sources `commitSha` does —
    the octokit PR-head fetch on the override path, and `GITHUB_REF_NAME` only
    on `push` — so a `workflow_run` build is no longer filed under the
    workflow's own ref.
  - Each PR's preview endpoint is its own **environment** (named `pr-{n}`,
    fork-qualified).
  - **Upgrade note:** action versions before this release keep PR-scoped build
    keys, so their Targets freeze `version`/`environment` at first-commit values
    (they were silently overwritten every push before, too). Upgrade to get
    per-build history.

- **GitHub check run for PR-triggered explorations.** The Platform now
  manages `Duku Exploration (<product name>)` on the PR head commit —
  created `in_progress` at kickoff, concluded `success`/`failure` with
  the batch, `timed_out` if the batch wedges. See the README's
  [Required check](./README.md#required-check) section to gate merges on
  it, replacing CI jobs that poll `batch(id) { status }`.
  - Server-side change: it activates when the Platform deploys, for
    **every pinned action version** — no action upgrade needed and no
    new workflow-token scopes.
  - Requires an org admin to approve the App's updated permissions
    (Checks: Read & write).

- **`preview-url-source: auto` no longer falls through to PR comments.** It now
  runs only the resolvers keyed on the head commit — Deployments, then Checks,
  then Statuses. A provider bot's PR comment advertises the *branch alias*,
  which moves to the next push, so `auto` could explore (and record) a URL that
  no longer served the commit it was attributing to. Set
  `preview-url-source: comments` to keep the old behaviour explicitly. If
  `preview-comment-author-logins` is configured and `auto` finds nothing, the
  action logs a warning naming that opt-in.
- **The resolved URL and its source are recorded on the build.** The Platform
  stores them on the deployment (`deployment.url` / `deployment.urlSource`), so
  "what was this build served at?" survives the next push — unlike
  `environment.url`, which is the endpoint's current alias. Also exposed as the
  new `preview-url-source` action output (`override` when `exploration-url` was
  supplied).

## [0.2.0] - 2026-06-22

- **Explicit `repository` / `pr-number` inputs.** Non-`pull_request`
  triggers (push / deployment_status / workflow_run / repository_dispatch)
  can now pass the PR explicitly to run the full PR flow and post both PR
  comments, instead of silently skipping the comment.
- The `github-token` is no longer required on the PR path when an
  `exploration-url` is supplied — the token is only used to resolve the
  preview URL from GitHub APIs.

## [0.1.1] - 2026-06-03

- The "running" PR comment now links to the new viewport target route
  (`/p/{subjectId}/t/{targetId}/exploration`) instead of the legacy
  `/dashboard/targets/{targetId}` path.
- The initial "running" PR comment is now posted by the Duku AI GitHub App
  (server-side), matching the author of the terminal-results comment, instead
  of `github-actions[bot]`. The action no longer writes the comment itself; the
  `comment-id` output is always empty on PR events.

## [0.1.0] - 2026-05-22

Initial public release.

- **Async by design.** On a `pull_request` event the action kicks off
  the exploration, posts a single sticky "running" PR comment, and exits
  in seconds. The Platform updates the same comment in place with the
  final results once the exploration terminates — no GitHub Actions
  minutes are consumed for the duration of the exploration.
- Registers a per-PR (or per-SHA on non-PR triggers) build with Duku,
  auto-populating build metadata from the GitHub event.
- Starts an exploration by default. Set `start-run: false` to skip and
  only register the build.
- Resolves the preview URL from GitHub on `pull_request` runs
  (Deployments → Checks → Statuses → PR Comments). The resolver source
  is configurable via `preview-url-source`, with per-resolver regex
  inputs.
- Off-PR triggers (push / schedule / workflow_dispatch) start an
  exploration and exit — no PR comment is posted.
- Optional `vercel-automation-bypass-secret` allows the worker to bypass
  Vercel Deployment Protection on protected preview deployments.
- Example workflow: [`examples/preview-pull-request.yml`](./examples/preview-pull-request.yml).

### Requirements

- The **Duku AI GitHub App** must be installed on the repo for the
  terminal-results comment to be posted: <https://github.com/apps/duku-ai>.
  Without the App only the "running" comment is posted; the action still
  exits cleanly.
