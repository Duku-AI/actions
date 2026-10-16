# Duku for GitLab CI/CD

The `preview` component explores the preview build of every merge request and
reports on it: Duku posts a "running" note on the merge request, replaces it with
the results when the exploration ends, and, unless you turn it off, adds one final
commit status. The status is always `success`, so Duku never holds a merge.

The job runs `duku-ci` from the public `ghcr.io/duku-ai/ci` image and signs in
with a GitLab ID token. There is no secret to create or paste.

## Setup

1. **Connect GitLab in Duku.** In Viewport, open Settings → Integrations →
   Source control & CI/CD → Connect → GitLab, and connect the group (or project)
   your repository lives in. Duku accepts a pipeline's ID token only from a
   project inside a connected group.
2. **Include the component** in `.gitlab-ci.yml`:

   ```yaml
   include:
     - component: gitlab.com/duku-ai/ci/preview@1
       inputs:
         product-id: prod_123
   ```

3. **Tell Duku where the preview is.** Have your deploy job write the preview
   URL to a dotenv report. The `duku-preview` job runs in `.post` by default, so
   it receives the report without further configuration:

   ```yaml
   deploy-preview:
     stage: deploy
     script:
       - ./deploy-preview.sh
       - echo "DUKU_EXPLORATION_URL=https://mr-${CI_MERGE_REQUEST_IID}.preview.example.com" >> deploy.env
     artifacts:
       reports:
         dotenv: deploy.env
     rules:
       - if: $CI_PIPELINE_SOURCE == "merge_request_event"
   ```

   To start Duku as soon as the deploy finishes, instead of after the last
   stage, move the job and list the deploy job in `needs`:

   ```yaml
   duku-preview:
     stage: deploy
     needs: [deploy-preview]
   ```

   Without a preview URL, Duku explores the product's base URL.

## Inputs

| Input | Default | Description |
|---|---|---|
| `product-id` | (required) | Duku product ID, from Viewport → Products. |
| `api-url` | `https://platform.duku.ai` | Duku API origin, without `/graphql` or a trailing slash. It is also the ID token's audience. |
| `exploration-url` | `''` | URL to explore. A `DUKU_EXPLORATION_URL` from an earlier job's dotenv report wins over it. |
| `pipeline` | `merge_request` | `merge_request` reports from merge request pipelines. `branch` reports from branch pipelines that have an open merge request (`CI_OPEN_MERGE_REQUESTS`). |
| `image` | `ghcr.io/duku-ai/ci:0` | The `duku-ci` image. Point it at a mirror if your runners cannot reach ghcr.io. |
| `stage` | `.post` | Stage of the `duku-preview` job. |

Merge requests from forks are skipped with a warning: Duku reports only from
pipelines that run in the target project. The job is `allow_failure: true`, so
a Duku problem shows as a warning on the pipeline and never blocks a merge.

## Outputs

The job publishes a dotenv report, `duku.env`, that jobs in later stages (or
jobs that `need` it) receive as variables:

| Variable | Description |
|---|---|
| `DUKU_TARGET_ID` | The build Duku recorded for this commit. |
| `DUKU_TARGET_NAME` | Its display name. |
| `DUKU_TARGET_VERSION` | Its version. |
| `DUKU_RUN_ID` | The exploration batch. |
| `DUKU_RUN_STATUS` | The exploration's status at kickoff. |

## Environments

To explore a long-lived environment such as staging after each deploy, run
`duku-ci environment` in a job of your own. It records the commit's build on a
Duku environment (declared in Viewport → Product settings → Environments), then
starts an exploration and the product's test cases against it:

```yaml
duku-staging:
  stage: .post
  image: ghcr.io/duku-ai/ci:0
  allow_failure: true
  id_tokens:
    DUKU_ID_TOKEN:
      aud: https://platform.duku.ai
  variables:
    DUKU_PRODUCT_ID: prod_123
    DUKU_ENVIRONMENT: staging
  script:
    - duku-ci environment
  artifacts:
    when: always
    reports:
      dotenv: duku.env
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH && $CI_PIPELINE_SOURCE == "push"
```

| Variable | Default | Description |
|---|---|---|
| `DUKU_PRODUCT_ID` | (required) | Duku product ID. |
| `DUKU_ENVIRONMENT` | the product's default | Name of a declared environment. |
| `DUKU_API_URL` | `https://platform.duku.ai/graphql` | Duku GraphQL endpoint. |
| `DUKU_RELEASE_LABEL` | `''` | Release name for this build, e.g. `1.4.2`. |
| `DUKU_RELEASE_LABEL_FROM` | `git-describe` | Where the release name comes from when `DUKU_RELEASE_LABEL` is unset: `git-describe`, `git-tag`, `package-json` or `input`. |
| `DUKU_PACKAGE_JSON_PATH` | `package.json` | Read when `DUKU_RELEASE_LABEL_FROM` is `package-json`. |
| `DUKU_RUN_EXPLORATION` | `true` | Set `false` to run only the test cases. |
| `DUKU_RUN_TESTS` | `true` | Set `false` to explore only. |
| `DUKU_WAIT_FOR_DEPLOYMENT` | `false` | Poll the environment's URL until it serves this commit before starting. |
| `DUKU_WAIT_COMMIT_HEADER` | `x-commit-sha` | Response header your app exposes its deployed commit on. |
| `DUKU_WAIT_COMMIT_PATH` | `/` | Path polled on the environment's URL. |
| `DUKU_WAIT_FOR_DEPLOYMENT_TIMEOUT_SECONDS` | `300` | How long to wait before failing. |
| `DUKU_WAIT_FOR_DEPLOYMENT_INTERVAL_SECONDS` | `10` | Delay between polls. |

Only push pipelines vouch for their commit and branch; a scheduled or manual
run is recorded under its release label. The dotenv report carries
`DUKU_TARGET_ID`, `DUKU_RELEASE_ID`, `DUKU_RUN_ID`, `DUKU_RUN_STATUS`,
`DUKU_TEST_RUN_ID` and `DUKU_TEST_RUN_STATUS`.

## Self-managed GitLab

Your instance must be reachable from the internet over HTTPS with a valid
certificate, so Duku can verify its ID tokens and post notes.

If your instance cannot use the gitlab.com CI/CD Catalog, include the same file
by URL, pinned to a release tag:

```yaml
include:
  - remote: 'https://gitlab.com/duku-ai/ci/-/raw/<tag>/templates/preview.yml'
    inputs:
      product-id: prod_123
```

## Turning off the final status

The final commit status can be turned off per connection: Settings →
Integrations → Source control & CI/CD, on the GitLab row.
