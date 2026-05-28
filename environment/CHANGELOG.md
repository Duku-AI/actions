# Changelog

All notable changes to the `environment` action will be documented in this file.

## [Unreleased]

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
