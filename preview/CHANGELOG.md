# Changelog

All notable changes to the `preview` action will be documented in this file.

## [Unreleased]

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
