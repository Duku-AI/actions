# Duku Environment GitHub Action

Records the build a commit produced against one of your environments, then
kicks off a Duku exploration against it and exits. **Async by design**: the
exploration runs asynchronously in the Platform — the GitHub job does not wait
for it to complete.

Use this action on `push`, `schedule` or `workflow_dispatch` events to record
releases on long-lived environments (staging, prod canary, customer-specific
deploys). The environment must already be declared in Viewport → Product
settings → Environments; the action names it.

> Pull requests are the [`preview`](../preview) action's. From `vNEXT` this
> action fails a run whose event carries a pull request (`pull_request`,
> `pull_request_target`, a comment on a pull request, or a `workflow_run` a
> pull request run started), naming the preview action.
>
> For an Android app, pass the APK you built as `apk-path` — see
> [Android builds](#android-builds).

From `1.0.0` (listed under Unreleased in the [CHANGELOG](./CHANGELOG.md), shown
below as `vNEXT`), the action records a web build through the
[antidote CLI](../../apps/cli/duku/README.md)
(`npx --yes @getantidote/cli@2 record-release`), as Antidote's GitLab component
does. So for a web build the runner needs:

- **Node 22.4 or newer, with `npx`**: the CLI's minimum (`engines` in its
  `package.json`). Unless the runner's own Node is that new, add this step
  before the action:

  ```yaml
  - uses: actions/setup-node@v4
    with:
      node-version: 22
  ```

- **Linux or macOS.** The action does not run on Windows runners: it stops
  before calling the CLI and says so.

## Usage

```yaml
- uses: duku-ai/actions/environment@environment/v0.5.0
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
`input` (only the `release-label` input; when it is empty, a run with a
verified commit or branch is named by its short SHA, and any other run fails
before anything is recorded). A derived source that yields nothing — no git
metadata, a missing file, an empty version — falls back to the short SHA with a
warning, never a failure. If you do have your own
scheme, pass it as `release-label` and it wins over the derived value:

```yaml
    release-label: ${{ github.event.release.tag_name }}
```

One commit is one release: when the platform already holds this commit under a
different label, the stored label wins and the step logs a warning naming the
rename path in Viewport — a re-sent label never silently overwrites history.

A SHA is only recorded when the event vouches for one — `push` does. On `schedule` and `workflow_dispatch` the build is recorded
without one rather than with a guessed one, since `GITHUB_SHA` there describes
the workflow's ref and not necessarily what is deployed. Without an explicit
`release-label`, repeat triggers on the same commit collapse onto the same
build, so a nightly sweep against a branch that has already been pushed reuses
that push's build rather than minting a SHA-less duplicate. With one, the label
is the build — see below.

### Sign in with a service identity (no stored secret)

From `vNEXT`, the action can sign in with the job's GitHub OIDC token instead
of an API key. An org admin creates a service identity in Viewport → Settings →
Service identities, with a trust rule for
`https://token.actions.githubusercontent.com` and your repository:

```yaml
permissions:
  contents: read
  id-token: write          # the job's OIDC token, exchanged for an Antidote session

- uses: duku-ai/actions/environment@environment/vNEXT
  with:
    service-identity: svc_...
    product-id: ${{ vars.DUKU_PRODUCT_ID }}
    environment: staging
```

Set `api-key` or `service-identity`, not both. An Android build (`apk-path`)
still needs `api-key`.

## Nightly runs against a release you name

When what's deployed isn't the commit your workflow runs on — the app
redeploys many times a day, a separate job resets test data first, or the
workflow lives in a different repo from the app — trigger the action from your
own job and pass the deployed build as `release-label`:

```yaml
on:
  workflow_dispatch:
    inputs:
      release:
        required: true

jobs:
  explore:
    runs-on: ubuntu-latest
    steps:
      - uses: duku-ai/actions/environment@environment/v0.5.0
        with:
          api-key: ${{ secrets.PLATFORM_API_KEY }}
          product-id: ${{ vars.DUKU_PRODUCT_ID }}
          environment: staging
          release-label: ${{ inputs.release }}
          release-label-from: input
```

```sh
gh workflow run duku-nightly.yml -f release=2026.09.24-build.812
```

On `schedule` / `workflow_dispatch` an explicit `release-label` is what
identifies the build: each new label is a new release in Viewport, and the
same label again re-runs against the release it already names, including one
a push recorded. Nothing needs to change in the repository between runs.
`release-label-from: input` makes a run with no label fail before anything is
recorded, instead of falling back to this repository's `git describe`. The full
workflow, including a `repository_dispatch` trigger for CIs without the `gh` CLI, is in
[`examples/environment-nightly.yml`](./examples/environment-nightly.yml).

## Recording the deployed commit on a manual run

A `workflow_dispatch` or `schedule` run records no commit, because
`GITHUB_SHA` there is whatever the workflow ran on, not what is deployed. When
you know what is deployed, pass it as `commit` (a tag, branch or SHA):

```yaml
permissions:
  contents: read

steps:
  - uses: duku-ai/actions/environment@environment/vNEXT
    with:
      api-key: ${{ secrets.PLATFORM_API_KEY }}
      product-id: ${{ vars.DUKU_PRODUCT_ID }}
      environment: staging
      release-label: ${{ inputs.release }}
      commit: ${{ inputs.release }}   # e.g. the tag you deployed
      github-token: ${{ github.token }}
```

The action asks GitHub for that commit in this repository and records the
full SHA as the build's commit, so the release shows it and `wait-for-deployment`
has something to match. If GitHub can't find it, the step fails before anything
is recorded.

- Prefer a tag or a full SHA. A branch name records the branch's tip when the
  action runs, which may have moved on since you deployed.
- A bare SHA must be on the default branch: GitHub also serves commits that
  only exist in a fork, and that is how the action tells them apart. For a
  commit off the default branch (a release branch, a cherry-pick), pass the tag
  or branch that holds it.
- Pass `release-label` too. With `commit`, the label is never derived:
  `release-label-from` reads the checked-out commit, not `commit`, and a
  commit's label can't be changed from CI once recorded.
- `commit` is refused on `push`, where GitHub already names the commit.
- A release recorded earlier under the same label without a commit stays a
  separate release: a label alone can span commits (a `package.json` version
  does), so Duku never attaches a commit to it after the fact. Start passing
  `commit` before the first run of a label, not partway through.

## Linking PR previews to what landed

A squash or a rebase mints a new commit, so the build a PR's preview
explorations observed and the build that shipped share no SHA — nothing joins
them. On a **`push`** event, Antidote asks GitHub which pull requests the pushed
commit belongs to and records the link (a *landing*): `<PR head> landed as
<pushed commit>`. Viewport can then show what a shipped build was tested as
before it merged.

From `vNEXT` Antidote reads this through the
[Antidote Bot GitHub App](https://github.com/apps/antidote-bot), so the workflow needs no
token for it: install the App on the repository and link it to your
organisation. Without that the step succeeds and warns that landings were not
recorded, saying whether the App is not installed or not linked, and where an
org admin fixes it. Only the pushed commit is looked up, so a push of several
commits records the landing of the last one.

Best effort by design: a failed lookup is a warning and the run continues.

## Choosing what runs

The exploration runs by default. Set `run-exploration: false` to record the
build without one.

```yaml
    run-exploration: false  # record the build, skip the exploration
```

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
- The wait needs a verified commit SHA, which a `push` event, or `commit` on
  another trigger, vouches for. Without one there is nothing to match
  against, so the wait is skipped with an info line rather than failed.
- On timeout the step fails with an error naming the URL, the commit and the
  header it looked for. Transient HTTP errors (and error statuses) are
  retried, never fatal, until the timeout.

## Android builds

An Android product has no URL to explore: its build is the APK. Build it as
you already do, then point `apk-path` at it — one `.apk` file, or a directory
holding exactly one (patterns are not expanded):

```yaml
- uses: duku-ai/actions/environment@environment/vNEXT
  with:
    api-key: ${{ secrets.PLATFORM_API_KEY }}
    product-id: ${{ vars.DUKU_ANDROID_PRODUCT_ID }}
    apk-path: app/build/outputs/apk/release
```

The action uploads the APK straight to Duku's storage (re-running a job with
the same bytes skips the upload), waits until Duku has checked it — at most 15
minutes — records it as this commit's build and starts an exploration on it.
The exploration runs on emulators with the product's default device.

- **Release name.** The APK's version, `versionName (versionCode)`, e.g.
  `1.4.2 (42)`. An explicit `release-label` still wins; `release-label-from`
  is not read.
- **Where the build lands.** The `environment` you name, else the product's
  default environment.
- **Refused builds.** Duku refuses an app bundle (`.aab`), split APKs, a build
  over 1 GB, an unsigned or badly signed APK, one with no launchable activity,
  and a package other than the one the product already tests. The step fails
  with Duku's reason, and nothing is recorded or explored.
- **Warnings.** Things worth knowing that never block a build — debuggable,
  test-only, 32-bit-only, over 300 MB, or needing a newer Android than the
  default device — are shown on the step and set as the `build-warnings`
  output. So is the capture hint: a build that does not trust Duku's network
  capture certificate still runs, but runs record only the hosts it connects
  to, not its HTTP requests and errors. To have them captured, upload a debug
  build that bundles the certificate in `res/raw` and trusts it in
  `<debug-overrides>` of its network security config (Viewport → Product
  settings → App has the certificate and the config).
- **Exploration status.** An Android exploration has no run id: `run-status`
  reads `started` and `run-id` stays empty. Follow it in Viewport.
- **Not with Android.** `apk-path` cannot be combined with
  `wait-for-deployment` — the build is live as soon as Duku has checked it.

## Async by design

Explorations regularly take 5–40 minutes each. Rather than
burn GitHub Actions minutes polling, the action kicks off the run and exits.
Terminal results appear in Viewport.

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `api-key` | One of the two | — | Antidote Platform API key. Generate in Viewport → Settings → API Keys. Required with `apk-path`. |
| `service-identity` | One of the two | — | A service identity's id (`svc_…`) to sign in with the job's GitHub OIDC token. The job needs `permissions: id-token: write`. |
| `oidc-audience` | No | _Platform origin_ | The GitHub OIDC token's audience, only with `service-identity`. |
| `product-id` | Yes | — | Antidote product ID (Viewport → Products). |
| `environment` | No | _product default_ | Name of an environment declared on that product, e.g. `staging`. When empty, the run lands on the product's default environment (new products are born with a `production` endpoint). |
| `release-label` | No | — | Explicit release name for this build, e.g. `1.4.2`. Wins over `release-label-from` when set. |
| `release-label-from` | No | `git-describe` | Where the release name comes from when `release-label` is unset: `git-describe`, `git-tag`, `package-json`, or `input`. Falls back to the short SHA with a warning, never a failure. |
| `package-json-path` | No | `package.json` | Path to package.json, relative to the checkout root. Only read when `release-label-from` is `package-json`. |
| `commit` | No | — | The deployed commit as a tag, branch or SHA, for `workflow_dispatch` / `schedule` runs. Looked up in this repository and recorded as the build's commit; fails the step if GitHub can't find it. A bare SHA must be on the default branch. Disables label derivation, so pass `release-label`. Needs `github-token` with `contents: read`. Refused on `push`. |
| `run-exploration` | No | `true` | Start an exploration run. Set `false` to record the build without one. |
| `wait-for-deployment` | No | `false` | Poll the environment URL until it serves the expected commit before anything is recorded. Needs the app to expose its commit on `wait-commit-header`. A timeout fails the step and records nothing. |
| `wait-for-deployment-timeout-seconds` | No | `300` (the CLI's) | How long to wait for the expected commit before failing. Must be a positive integer. |
| `wait-for-deployment-interval-seconds` | No | `10` (the CLI's) | Delay between deployment polls. Must be a positive integer. |
| `wait-commit-header` | No | `x-commit-sha` (the CLI's) | Response header the app exposes its deployed commit hash on (case-insensitive; full SHA or 7-char short form). |
| `wait-commit-path` | No | `/` (the CLI's) | Path appended to the environment URL on each poll (e.g. `/api/health`). |
| `github-token` | No | *(empty)* | Used only to look the `commit` input up. Falls back to the `GITHUB_TOKEN` env. |
| `apk-path` | No | — | Android: one `.apk` file, or a directory holding exactly one. Uploads it, waits until Antidote has checked it, records it as this build and explores it. Needs `api-key`. See [Android builds](#android-builds). |
| `api-url` | No | `https://platform.duku.ai/graphql` | The Antidote Platform URL. Only its origin is used; with `apk-path` the build is uploaded to `<origin>/graphql`. |
| `auth-url` | No | _derived from `api-url`_ | **Deprecated, ignored** with a warning, except with `apk-path`: there it is the Keycloak URL the API key signs in at. |
| `github-installation-id` | No | — | **Deprecated, ignored**, with a warning. |
| `target-id`, `url`, `exploration-url` | No | — | **Removed in v1:** setting one fails the step. See below. |
| `repository`, `pr-number` | No | — | **Removed in v1:** setting one fails the step. Pull requests are the [`preview`](../preview) action's. |

## Outputs

| Name | Description |
|------|-------------|
| `target-id` | ID of the build the run was attributed to. |
| `release-id` | ID of the release (app version) the build landed as. |
| `run-id` | The agentic execution the build started. Empty when nothing was started. |
| `run-status` | `triggered` (an agentic execution started; its results are in Viewport), `started` (Android: discovery started, no run id; see Viewport) or `skipped`. |
| `comment-id` | **Deprecated:** always empty. |
| `build-warnings` | Android only: warnings about the uploaded APK, one per line. Empty without `apk-path`. |

## Migrating from `target-id`

`target-id`, `url` and `exploration-url` were removed in `vNEXT`: setting one
fails the step. A workflow that still uses them can stay pinned to
`environment/v0.5.0` until it migrates:

1. Declare the environment in Viewport → Product settings → Environments, with
   the URL the old target pointed at.
2. Replace `target-id: ${{ vars.DUKU_STAGING_TARGET_ID }}` with `product-id`
   plus `environment:`.
3. Drop any `url:` or `exploration-url:` input — the environment carries the URL now.

## Migrating a pull request job

From `vNEXT` a run whose event carries a pull request fails, and so does
`repository` or `pr-number`: this action records releases on the product's
environments only. Test a pull request with the [`preview`](../preview) action,
against its own preview deployment; a pull request deployed onto one of the
product's environments is not supported. A workflow can stay pinned to
`environment/v0.5.0` until it moves.

## Examples

- [`examples/environment-push.yml`](./examples/environment-push.yml) — minimal `push`-trigger workflow
- [`examples/environment-nightly.yml`](./examples/environment-nightly.yml) — nightly run against a release you name, triggered from your own job
- [`examples/environment-android.yml`](./examples/environment-android.yml) — build an APK and explore it on each push

## Status

This action is **pre-release** (`0.x`). It kicks off an exploration
asynchronously. `fail-on` thresholds and Check Run integration come in later
releases; until then, follow the results in Viewport.

See [`CHANGELOG.md`](./CHANGELOG.md) for the version history.
