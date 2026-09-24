# Changelog

All notable changes to the `environment` action will be documented in this file.

## [Unreleased]

## [0.4.0] - 2026-09-17

- **Dispatch warnings from the platform are now logged.** `startExploration`
  can return server-side notes about the accepted request (e.g. a clamped
  field); the action previously dropped them and now logs each as a warning —
  a behaviour change if you scrape step logs. A Platform old enough not to have
  the field is asked again without it (nothing is shown for that run, logged at
  info instead).

- **Every request identifies the action and its version.** Requests now carry a
  `user-agent` of `duku-actions/{action}/{version}`. It lets Duku see which
  action versions are still in use — which is what decides when a compatibility
  fallback can be retired — without asking anyone. No new inputs, no behaviour
  change, nothing about your repository is sent.

- **`product-id` + `environment` mode says so when the feature is off for your
  organisation.** Declaring endpoints is an entitlement, and a Platform that has
  it deployed can still have it switched off for you — in which case your
  product keeps only the `default` endpoint it was provisioned with and no other
  name can ever resolve. Naming one used to fail with "add one in Viewport →
  Product settings → Environments", which is a dead end: that panel is hidden
  while the feature is off. The action now names the real fix (ask Duku to
  enable it) and the one thing that works meanwhile, the deprecated `target-id`.
  `default` is not an escape hatch — minting a build against *any* endpoint is
  an app-version write, so the Platform refuses that too, and the action now
  reports that refusal in the same words instead of a raw GraphQL error. When
  the feature *is* on, both messages are unreachable and behaviour is
  unchanged.

- **`product-id` + `environment` mode says so when the Platform is too old.**
  Environments only exist on a Platform that has the app-version axis deployed,
  and there is no pre-axis equivalent of naming an endpoint — so the action now
  fails with the two ways forward (upgrade the Platform, or use the deprecated
  `target-id`) instead of a raw GraphQL error about an unknown field.
  `target-id` mode is unaffected: it touches nothing the axis added.
- **New opt-in `wait-for-deployment`: poll the environment URL until it serves
  the expected commit before exploring.** On a fresh push the endpoint still
  serves the previous build, so the exploration used to test the old deploy
  under the new commit's label. With `wait-for-deployment: true` the action
  polls `${environmentUrl}<wait-commit-path>` (default `/`) until the
  `wait-commit-header` response header (default `x-commit-sha`) names the
  expected commit — full SHA or 7-char short form, case-insensitive — then
  dispatches. `wait-for-deployment-timeout-seconds` (default `300`) and
  `wait-for-deployment-interval-seconds` (default `10`) tune the poll; both
  must be positive integers. Deliberately provider-neutral (no GitHub
  Deployments API, no host integration — any host, any CI), and it also
  catches a deploy that reported success but serves stale content. Off by
  default, so existing workflows are unchanged; on runs with no verified SHA
  (`schedule` / `workflow_dispatch`) the wait is skipped with an info line,
  and on timeout the step fails naming the URL, commit and header. The app
  must expose its commit as the header (see the README for Next.js / Express
  / Vercel snippets).

- **Release labels are derived from git by default.** New `release-label-from`
  input: `git-describe` (default, `git describe --tags --always --dirty`, e.g.
  `v0.1.1-2-g321798b`), `git-tag` (exact tag on HEAD), `package-json` (the
  `version` field of `package-json-path`, default `package.json`, stored
  verbatim), or `input` (the previous behaviour: only `release-label`, which
  may be empty). A source that yields nothing falls back to the short SHA with
  a warning, never a failure — and an explicit `release-label` always wins over
  the derived value. Reading the version from a file at build time named the
  *previous* release on every feature commit, and broke the first time the repo
  layout moved; the commit's own git metadata cannot do either.
- **A re-sent label that loses to the stored one now warns.** One commit is one
  release, so when the platform already holds this SHA under a different label
  the stored label wins — the step logs a warning (and the platform logs
  server-side) naming the rename path in Viewport instead of dropping the label
  in silence.

- **`environment` is optional — an empty value runs against the product's
  default environment.** A single-environment product needs only `product-id`.
  The fallback reads the endpoint flagged default in Viewport (new products are
  born with a `production` endpoint); when no endpoint is default the step fails
  naming the declared environments instead of guessing.
- **`exploration-url` is the canonical URL override; `url` is a deprecated
  alias.** Both are only valid with `target-id`. Setting both to different
  values fails the step; using `url` logs a deprecation warning.
- **New `target-id` and `release-id` outputs.** `target-id` names the build the
  run was attributed to; `release-id` names the release (app version) the build
  landed as. `release-id` is empty in `target-id` mode, which mints no release.

- **`product-id` + `environment` inputs.** Point the action at an endpoint you
  declared in Viewport instead of a pre-created target, and every trigger mints
  a build for that commit against it — so runs, issues and tests are attributed
  to a release and two builds can be compared. The optional `release-label`
  input records a human-readable name (`1.4.2`) alongside the commit SHA.
- **`target-id` is deprecated.** It still works, unchanged, and still produces
  unversioned runs. It cannot be combined with `product-id` / `environment`.
- **`url` is rejected alongside `environment`.** The endpoint owns its URL and
  the server resolves it from the deployment, so an override would have been
  silently discarded.

- **`run-exploration` / `run-tests` inputs.** One workflow no longer has to
  fire both run types: set either to `false` to trigger just the other. Both
  default to `true`, so an existing workflow is unchanged. Setting both to
  `false` fails the step rather than kicking off nothing.

- **On push, the action records which PR heads landed as the pushed commits.**
  A squash or rebase mints a new SHA, so a PR's preview builds and the build
  that shipped shared nothing to join on. With a `github-token` carrying
  `pull-requests: read`, the action resolves the PRs each pushed commit came
  from and records the link. Best effort: no token, a refused lookup or a
  failed write logs a warning and the run continues. See the README's
  [Linking PR previews to what landed](./README.md#linking-pr-previews-to-what-landed).

- **The sticky PR comment is keyed on the product and the endpoint.** It used to
  be keyed on the target id, and targets are now per-commit — so every push
  posted a new comment instead of updating the one already there. A product's
  builds on one endpoint (`pr-53`, `staging`) now share a single comment,
  updated in place, while two products on the same PR stay independent. A
  target with no deployment still keys on the target id. One caveat on upgrade:
  an existing `v1` comment is left alone, so the first run after upgrading adds
  one more comment and every run after that updates it.

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
