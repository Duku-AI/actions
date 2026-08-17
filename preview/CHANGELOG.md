# Changelog

All notable changes to the `preview` action will be documented in this file.

## [Unreleased]

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
