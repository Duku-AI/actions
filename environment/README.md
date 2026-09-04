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
one before it.

Identity comes from what your pipeline already has — the endpoint, the branch,
and the commit SHA. There is no version scheme to adopt. If you do have one,
pass it as `release-label` and it is recorded alongside the SHA:

```yaml
    release-label: ${{ github.event.release.tag_name }}
```

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
| `environment` | Yes¹ | — | Name of an environment declared on that product, e.g. `staging`. |
| `release-label` | No | — | Human-readable release name for this build, e.g. `1.4.2`. |
| `run-exploration` | No | `true` | Start an exploration run. |
| `run-tests` | No | `true` | Trigger the product's test cases. |
| `repository` | No | — | `owner/repo` to attach PR metadata to on a **non-`pull_request`** trigger (set together with `pr-number`). Lets a downstream push / dispatch job post the PR comment. |
| `pr-number` | No | — | PR number to attach to on a non-`pull_request` trigger (set together with `repository`). |
| `github-token` | No | `${{ github.token }}` | Used on `pull_request` events — or when `repository`+`pr-number` are supplied — to post a sticky "running" PR comment. |
| `test-runs-per-path` | No | _platform default_ | Override the number of test runs per path. |
| `test-paths-per-goal` | No | _platform default_ | Override the number of paths per goal. |
| `target-id` | No | — | **Deprecated.** See below. |
| `url` | No | — | Only valid with `target-id`; overrides the target's build URL. An `environment` owns its URL. |

¹ Required unless the deprecated `target-id` is used instead.

Setting both `run-exploration` and `run-tests` to `false` fails the step —
there would be nothing to trigger.

## Outputs

| Name | Description |
|------|-------------|
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

One thing to check first: if your product uses per-target test cases rather
than durable tests, they do not travel to the per-commit builds this action
mints, and `test-run-status` will come back `skipped` with a warning in the
log. Ask Duku to enable durable tests for your organisation before migrating,
or keep `target-id` until then.

## Examples

- [`examples/environment-push.yml`](./examples/environment-push.yml) — minimal `push`-trigger workflow
- [`examples/environment-pull-request.yml`](./examples/environment-pull-request.yml) — PR gate against a fixed environment

## Status

This action is **pre-release** (`0.x`). It kicks off exploration + tests
asynchronously. `fail-on` thresholds and Check Run integration come in later
releases — until then, gate merges on the platform-side comment / Viewport.

See [`CHANGELOG.md`](./CHANGELOG.md) for the version history.
