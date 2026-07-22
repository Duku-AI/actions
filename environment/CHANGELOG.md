# Changelog

All notable changes to the `environment` action will be documented in this file.

## [Unreleased]

## [0.3.1] - 2026-07-21

- **Per-target "running" PR comment.** When multiple targets run against
  the same PR, each now gets its own sticky "running" comment instead of
  overwriting a single shared one, so every target's status is visible at
  once.

## [0.3.0] - 2026-06-22

- **Explicit `repository` / `pr-number` inputs.** Non-`pull_request`
  triggers can now pass the PR explicitly so the action attaches PR
  metadata and posts the sticky comment (with a `github-token`), matching
  the native `pull_request` behaviour.

## [0.2.0] - 2026-06-22

- **First-class PR trigger against a fixed environment.** Running on a
  `pull_request` event no longer logs a warning steering you to the
  `preview` action — it's now a supported mode for gating a PR against a
  permanent environment target (e.g. PRs into `prod` exploring a fixed
  dev deploy). PR metadata and the sticky comment behaviour are unchanged.

## [0.1.1] - 2026-06-03

- The "running" PR comment now links to the new viewport target route
  (`/p/{subjectId}/t/{targetId}/exploration`) instead of the legacy
  `/dashboard/targets/{targetId}` path.

## [0.1.0] - 2026-05-22

Initial public release.

- **Async by design.** Kicks off both exploration and test-case
  batches against a pre-created environment target and exits immediately.
  Terminal results live in Viewport (and in the PR comment if invoked on
  a `pull_request` event with the Duku AI GitHub App installed on the repo).
- Designed for `push`, `schedule`, and `workflow_dispatch` workflows
  targeting long-lived environments (staging, prod canary,
  customer-specific deploys).
- Inputs: `api-key` and `target-id` (required); optional `url` override,
  `github-token` (PR events only — posts a sticky "running" PR comment),
  and `test-runs-per-path` / `test-paths-per-goal` to override platform
  test-run defaults.
- Outputs: `run-id` / `run-status` for the exploration kickoff,
  `test-run-id` / `test-run-status` for the test-case batch kickoff,
  and `comment-id` on PR events.

### Requirements

- The **Duku AI GitHub App** must be installed on the repo for the
  terminal-results comment to be posted on PR events:
  <https://github.com/apps/duku-ai>. Without the App, only the action's
  "running" comment is posted.
