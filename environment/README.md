# Duku Environment GitHub Action

Records the build a commit produced against one of your environments, then
kicks off a Duku exploration and a test run against it and exits. **Async by
design**: both phases run asynchronously in the Platform — the GitHub job does
not wait for either to complete.

Use this action on `push`, `schedule`, `workflow_dispatch`, or `pull_request`
events to run against long-lived environments (staging, prod canary,
customer-specific deploys). The environment must already be declared in
Viewport → Product settings → Environments; the action names it.

> For PR-preview workflows where each PR gets its own ephemeral endpoint, use
> the [`preview`](../preview) action instead.

## Usage

```yaml
- uses: duku-ai/actions/environment@environment/v0.4.0
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    product-id: ${{ vars.DUKU_PRODUCT_ID }}
    environment: staging
```

Each trigger records the commit as a build on `staging` and runs against
whatever that endpoint currently serves. Because runs carry the build they came
from, Viewport can group findings by release and compare one build against the
one before it. Omit `environment` to run against the product's default
environment instead — for a single-environment product that is the whole setup.

Identity comes from what your pipeline already has — the endpoint, the branch,
and the commit SHA. There is no version scheme to adopt: by default the build's
release name is derived from git (`git describe --tags --always --dirty`, e.g.
`v0.1.1-2-g321798b`) — honest, unique per commit, and sortable. Unlike a
version read from a file at build time, it names the commit being recorded,
not whatever version the previous release commit bumped to.

```yaml
    release-label-from: git-describe   # the default; see below for the rest
```

`release-label-from` accepts `git-describe` (default), `git-tag` (exact tag
pointing at HEAD, sorted-first when several do), `package-json` (the `version`
field of `package-json-path`, default `package.json`, stored verbatim), or
`input` (only the `release-label` input, which may be empty). A source that
yields nothing — no git metadata, a missing file, an empty version — falls
back to the short SHA with a warning, never a failure. If you do have your own
scheme, pass it as `release-label` and it wins over the derived value:

```yaml
    release-label: ${{ github.event.release.tag_name }}
```

One commit is one release: when the platform already holds this commit under a
different label, the stored label wins and the step logs a warning naming the
rename path in Viewport — a re-sent label never silently overwrites history.

A SHA is only recorded when the event vouches for one — `push` and
`pull_request` do. On `schedule` and `workflow_dispatch` the build is recorded
without one rather than with a guessed one, since `GITHUB_SHA` there describes
the workflow's ref and not necessarily what is deployed. Repeat triggers on the
same commit collapse onto the same build, so a nightly sweep against a branch
that has already been pushed reuses that push's build rather than minting a
SHA-less duplicate.

## Linking PR previews to what landed

A squash or a rebase mints a new commit, so the build a PR's preview
explorations observed and the build that shipped share no SHA — nothing joins
them. On a **`push`** event, with a `github-token` that has
`pull-requests: read`, the action asks GitHub which PRs the pushed commits came
from and records the link (a *landing*) on the Platform: `<PR head> landed as
<pushed commit>`. Viewport can then show what a shipped build was tested as
before it merged.

```yaml
on:
  push:
    branches: [main]

jobs:
  duku:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read     # resolve which PRs the pushed commits came from
    steps:
      - uses: duku-ai/actions/environment@environment/v0.4.0
        with:
          api-key: ${{ secrets.PLATFORM_API_KEY }}
          product-id: ${{ vars.DUKU_PRODUCT_ID }}
          environment: staging
          github-token: ${{ github.token }}
```

Squash, merge-commit and rebase merges all work, with no strategy to configure:
GitHub associates each of the resulting commits with the PR it came from. A
fast-forward push of the PR branch itself records nothing — the candidate *is*
the landed build.

Best effort by design. No token, a repo that withholds the commit-PR index, a
network failure, a push carrying more than 20 commits — each logs a warning and
the run continues. The link is a convenience for reading history, never a
precondition for the exploration or the tests, and it is never written on a
`pull_request` event, where nothing has landed yet.

## Choosing what runs

Both run types fire by default. Set either to `false` to trigger only the
other:

```yaml
    run-exploration: true   # discover the app and report new errors
    run-tests: false        # skip the test batch on this trigger
```

A common split is exploration on `push` and tests on `schedule`, so a busy
branch is not re-testing the whole suite on every commit.

## Waiting for the deploy to catch up

On a fresh push to `main` the environment URL still serves the previous
build — the new deploy takes a minute to roll out. Without a wait, the
exploration tests the old code but is labelled with the new commit. Set
`wait-for-deployment: true` and the action polls the environment URL until
it serves the expected commit before dispatching anything:

```yaml
    wait-for-deployment: true
    wait-for-deployment-timeout-seconds: 300  # fail after 5 min (default)
    wait-for-deployment-interval-seconds: 10  # poll every 10 s (default)
    wait-commit-header: x-commit-sha          # response header to read (default)
    wait-commit-path: /                       # path to poll (default; e.g. /api/health)
```

This is provider-neutral on purpose — no GitHub Deployments API, no host
integration, so it works for any host and any CI. It also catches a deploy
that reported success but is still serving stale content.

Your app must expose its deployed commit hash as a response header. The
action accepts the full SHA or its 7-character short form, case-insensitive:

```ts
// Next.js middleware / Express — set the header from the deployed commit:
res.setHeader('x-commit-sha', process.env.COMMIT_SHA ?? 'unknown');
```

```yaml
# Vercel — VERCEL_GIT_COMMIT_SHA is set automatically on every deployment:
# next.config.js: async headers() { return [{ source: '/:path*', headers:
#   [{ key: 'x-commit-sha', value: process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown' }] }] }
```

Notes:

- Off by default — an existing workflow is unchanged.
- The wait needs a verified commit SHA, which `push` and `pull_request`
  events vouch for. On `schedule` / `workflow_dispatch` there is nothing to
  match against, so the wait is skipped with an info line rather than failed.
- On timeout the step fails with an error naming the URL, the commit and the
  header it looked for. Transient HTTP errors (and error statuses) are
  retried, never fatal, until the timeout.

## Running on a PR against a fixed environment

If you ship by merging into a protected branch (e.g. `dev` → `prod`) and want
Duku to run against a **permanent** environment that already holds the code
about to ship, trigger this action on `pull_request` against that branch. With
the **Duku AI GitHub App** installed and a `github-token` available, the running
and terminal results are posted to the PR comment.

```yaml
on:
  pull_request:
    branches: [prod]

jobs:
  duku:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: duku-ai/actions/environment@environment/v0.4.0
        with:
          api-key: ${{ secrets.PLATFORM_API_KEY }}
          product-id: ${{ vars.DUKU_PRODUCT_ID }}
          environment: dev
          github-token: ${{ github.token }}
```

## Async by design

Explorations and test batches regularly take 5–40 minutes each. Rather than
burn GitHub Actions minutes polling, the action kicks off the runs and exits.
Terminal results appear in Viewport. On a `pull_request` event with the **Duku
AI GitHub App** installed (<https://github.com/apps/duku-ai>), the Platform also
posts terminal results to the PR comment.

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `api-key` | Yes | — | Duku Platform API key. Generate in Viewport → Settings → API Keys. |
| `product-id` | Yes¹ | — | Duku product ID (Viewport → Products). |
| `environment` | No¹ | _product default_ | Name of an environment declared on that product, e.g. `staging`. When empty, the run lands on the product's default environment (new products are born with a `production` endpoint). |
| `release-label` | No | — | Explicit release name for this build, e.g. `1.4.2`. Wins over `release-label-from` when set. |
| `release-label-from` | No | `git-describe` | Where the release name comes from when `release-label` is unset: `git-describe`, `git-tag`, `package-json`, or `input`. Falls back to the short SHA with a warning, never a failure. |
| `package-json-path` | No | `package.json` | Path to package.json, relative to the checkout root. Only read when `release-label-from` is `package-json`. |
| `exploration-url` | No | — | Override the URL to explore. Only valid with `target-id`; an `environment` owns its URL. |
| `url` | No | — | **Deprecated alias for `exploration-url`.** |
| `run-exploration` | No | `true` | Start an exploration run. |
| `run-tests` | No | `true` | Trigger the product's test cases. |
| `wait-for-deployment` | No | `false` | Poll the environment URL until it serves the expected commit before dispatching. Needs the app to expose its commit on `wait-commit-header`. |
| `wait-for-deployment-timeout-seconds` | No | `300` | How long to wait for the expected commit before failing. Must be a positive integer. |
| `wait-for-deployment-interval-seconds` | No | `10` | Delay between deployment polls. Must be a positive integer. |
| `wait-commit-header` | No | `x-commit-sha` | Response header the app exposes its deployed commit hash on (case-insensitive; full SHA or 7-char short form). |
| `wait-commit-path` | No | `/` | Path appended to the environment URL on each poll (e.g. `/api/health`). |
| `repository` | No | — | `owner/repo` to attach PR metadata to on a **non-`pull_request`** trigger (set together with `pr-number`). Lets a downstream push / dispatch job post the PR comment. |
| `pr-number` | No | — | PR number to attach to on a non-`pull_request` trigger (set together with `repository`). |
| `github-token` | No | `${{ github.token }}` | Used on `pull_request` events — or when `repository`+`pr-number` are supplied — to post a sticky "running" PR comment. |
| `test-runs-per-path` | No | _platform default_ | Override the number of test runs per path. |
| `test-paths-per-goal` | No | _platform default_ | Override the number of paths per goal. |
| `target-id` | No | — | **Deprecated.** See below. |

¹ Required unless the deprecated `target-id` is used instead.

Setting both `run-exploration` and `run-tests` to `false` fails the step —
there would be nothing to trigger.

## Outputs

| Name | Description |
|------|-------------|
| `target-id` | ID of the build the run was attributed to (the minted target in `product-id` mode, the given target in `target-id` mode). |
| `release-id` | ID of the release (app version) the build landed as. Empty in `target-id` mode, which mints no release. |
| `run-id` | ID of the exploration. Empty when `run-exploration` is `false`. |
| `run-status` | `triggered` (running asynchronously; terminal status is in Viewport) or `skipped`. |
| `test-run-id` | ID of the test-run batch. Empty when the product has no test cases configured, or `run-tests` is `false`. |
| `test-run-status` | `triggered` or `skipped`. |
| `comment-id` | ID of the sticky PR comment (only set when an exploration ran on a `pull_request` event with a `github-token`). |

## Migrating from `target-id`

`target-id` still works exactly as before, so an existing workflow needs no
change. Its runs are not attributed to a release: they carry no commit, no
branch and no environment, so they cannot be grouped or compared by build.

To migrate:

1. Declare the environment in Viewport → Product settings → Environments, with
   the URL the old target pointed at.
2. Replace `target-id: ${{ vars.DUKU_STAGING_TARGET_ID }}` with `product-id`
   plus `environment:`.
3. Drop any `url:` input — the environment carries the URL now.

The two forms are mutually exclusive; supplying both fails the step.

Two things to check first.

If declaring endpoints is not yet enabled for your organisation, step 1 is not
available — Product settings shows no Environments section, and your product has
only the `default` endpoint it was provisioned with. Naming that one does not
help either: the Platform refuses the build this action mints against any
endpoint while the feature is off. Ask Duku to enable it before migrating; the
action names this whichever endpoint you try.

If your product uses per-target test cases rather than durable tests, they do not
travel to the per-commit builds this action mints, and `test-run-status` will come
back `skipped` with a warning in the log. Ask Duku to enable durable tests for
your organisation before migrating, or keep `target-id` until then.

## Examples

- [`examples/environment-push.yml`](./examples/environment-push.yml) — minimal `push`-trigger workflow
- [`examples/environment-pull-request.yml`](./examples/environment-pull-request.yml) — PR gate against a fixed environment

## Status

This action is **pre-release** (`0.x`). It kicks off exploration + tests
asynchronously. `fail-on` thresholds and Check Run integration come in later
releases — until then, gate merges on the platform-side comment / Viewport.

See [`CHANGELOG.md`](./CHANGELOG.md) for the version history.
