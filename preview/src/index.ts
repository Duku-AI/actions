import * as core from '@actions/core';
import * as github from '@actions/github';
import { request } from 'undici';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeTargetName(raw: string, opts: { maxLen: number }): string {
  // Ensure a stable, DB-safe, single-line name (simulation_target.name is VARCHAR(255))
  let s = (raw || '').toString();
  s = s.replace(/\r?\n|\r/g, ' ');           // remove newlines
  s = s.replace(/[\u0000-\u001F\u007F]/g, ''); // remove control chars
  s = s.replace(/\s+/g, ' ').trim();        // collapse whitespace
  if (!s) s = 'untitled';
  if (s.length > opts.maxLen) s = s.slice(0, opts.maxLen - 1).trimEnd() + '…';
  return s;
}

function trimTrailingUrlPunctuation(url: string): string {
  // Common trailing punctuation from markdown/text contexts
  return url.replace(/[)\],.]+$/g, '');
}

function parseOptionalRegex(raw: string, label: string, flags = 'i'): RegExp | null {
  const s = (raw || '').trim();
  if (!s) return null;
  try {
    return new RegExp(s, flags);
  } catch {
    throw new Error(`Invalid ${label}: '${s}'. Provide a valid JavaScript regex pattern (without / /).`);
  }
}

function extractFirstHttpUrlFromText(body: string): string | null {
  if (!body) return null;
  const matches = body.match(/https?:\/\/[^\s)<"]+/gi);
  if (!matches?.length) return null;
  return trimTrailingUrlPunctuation(matches[0]);
}

function extractUrlFromText(body: string, urlRegexRaw: string): string | null {
  if (!body) return null;

  const re = parseOptionalRegex(urlRegexRaw, 'preview-url-regex');
  if (re) {
    const match = body.match(re);
    if (!match) return null;
    const candidate = (match[1] || match[0] || '').toString();
    return trimTrailingUrlPunctuation(candidate);
  }

  return extractFirstHttpUrlFromText(body);
}

// Token exchange types and functions
interface TokenExchangeResult {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

interface ApiKeyCredentials {
  clientId: string;
  clientSecret: string;
}

function deriveKeycloakUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  const host = url.hostname.startsWith('platform.')
    ? 'auth.' + url.hostname.slice('platform.'.length)
    : url.hostname;
  return `${url.protocol}//${host}`;
}

function decodeApiKey(apiKey: string): ApiKeyCredentials {
  let decoded: string;
  try {
    decoded = Buffer.from(apiKey, 'base64').toString('utf-8');
  } catch {
    throw new Error('Invalid API key: not valid base64 encoding');
  }

  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) {
    throw new Error('Invalid API key format: expected base64-encoded clientId:clientSecret');
  }

  const clientId = decoded.substring(0, colonIndex);
  const clientSecret = decoded.substring(colonIndex + 1);

  if (!clientId || !clientSecret) {
    throw new Error('Invalid API key: client_id and client_secret cannot be empty');
  }

  return { clientId, clientSecret };
}

async function exchangeApiKeyForToken(opts: {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenExchangeResult> {
  const tokenEndpoint = `${opts.keycloakUrl}/realms/${opts.realm}/protocol/openid-connect/token`;

  core.info(`Exchanging API key for access token...`);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });

  let response;
  try {
    response = await request(tokenEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Token exchange failed: unable to connect to Keycloak at ${opts.keycloakUrl}. ${msg}`);
  }

  const json = await response.body.json() as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (json.error) {
    const errorMsg = json.error_description || json.error;
    if (json.error === 'invalid_client' || json.error === 'unauthorized_client') {
      throw new Error(`API key authentication failed: ${errorMsg}. Verify your API key is valid and not expired.`);
    }
    throw new Error(`Token exchange failed: ${errorMsg}`);
  }

  if (!json.access_token) {
    throw new Error('Token exchange failed: no access_token in response');
  }

  core.info('API key exchanged successfully for access token');

  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in || 300,
    tokenType: json.token_type || 'Bearer',
  };
}

async function resolvePreviewUrlFromDeployments(opts: {
  octokit: ReturnType<typeof github.getOctokit>;
  owner: string;
  repo: string;
  sha: string;
  environmentRegexRaw: string;
}): Promise<string | null> {
  const envRe = parseOptionalRegex(opts.environmentRegexRaw, 'preview-deployment-environment-regex')
    || /preview|review|staging|pr/i;

  const deployments = await (opts.octokit as any).paginate(
    (opts.octokit as any).rest.repos.listDeployments,
    {
      owner: opts.owner,
      repo: opts.repo,
      sha: opts.sha,
      per_page: 100
    }
  ) as Array<{
    id: number;
    environment?: string | null;
    created_at?: string;
  }>;

  // newest → oldest
  for (let i = deployments.length - 1; i >= 0; i--) {
    const d = deployments[i];
    const env = (d.environment || '').toString();
    if (!envRe.test(env)) continue;

    const statuses = await (opts.octokit as any).paginate(
      (opts.octokit as any).rest.repos.listDeploymentStatuses,
      {
        owner: opts.owner,
        repo: opts.repo,
        deployment_id: d.id,
        per_page: 100
      }
    ) as Array<{
      state?: string | null;
      environment_url?: string | null;
      target_url?: string | null;
      created_at?: string;
    }>;

    // newest → oldest
    for (let j = statuses.length - 1; j >= 0; j--) {
      const s = statuses[j];
      const state = (s.state || '').toLowerCase();
      if (state === 'error' || state === 'failure' || state === 'inactive') continue;
      const url = (s.environment_url || s.target_url || '').toString().trim();
      if (url) return trimTrailingUrlPunctuation(url);
    }
  }

  return null;
}

async function resolvePreviewUrlFromCheckRuns(opts: {
  octokit: ReturnType<typeof github.getOctokit>;
  owner: string;
  repo: string;
  sha: string;
  checkNameRegexRaw: string;
}): Promise<string | null> {
  const nameRe = parseOptionalRegex(opts.checkNameRegexRaw, 'preview-check-name-regex');
  if (!nameRe) return null;

  const resp = await (opts.octokit as any).rest.checks.listForRef({
    owner: opts.owner,
    repo: opts.repo,
    ref: opts.sha,
    per_page: 100
  }) as { data?: { check_runs?: Array<any> } };

  const runs = resp?.data?.check_runs || [];
  // newest → oldest
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    const name = (r?.name || '').toString();
    if (!nameRe.test(name)) continue;

    // Heuristic: prefer a non-github details_url, otherwise scan check output for a URL
    const detailsUrl = (r?.details_url || '').toString().trim();
    if (detailsUrl && !detailsUrl.includes('github.com')) return trimTrailingUrlPunctuation(detailsUrl);

    const summary = (r?.output?.summary || '').toString();
    const text = (r?.output?.text || '').toString();
    const urlFromText = extractFirstHttpUrlFromText(`${summary}\n${text}`);
    if (urlFromText) return urlFromText;
  }

  return null;
}

async function resolvePreviewUrlFromStatuses(opts: {
  octokit: ReturnType<typeof github.getOctokit>;
  owner: string;
  repo: string;
  sha: string;
  statusContextRegexRaw: string;
}): Promise<string | null> {
  const ctxRe = parseOptionalRegex(opts.statusContextRegexRaw, 'preview-status-context-regex');
  if (!ctxRe) return null;

  const statuses = await (opts.octokit as any).paginate(
    (opts.octokit as any).rest.repos.listCommitStatusesForRef,
    {
      owner: opts.owner,
      repo: opts.repo,
      ref: opts.sha,
      per_page: 100
    }
  ) as Array<{
    context?: string | null;
    target_url?: string | null;
    state?: string | null;
  }>;

  // newest → oldest
  for (let i = statuses.length - 1; i >= 0; i--) {
    const s = statuses[i];
    const ctx = (s.context || '').toString();
    if (!ctxRe.test(ctx)) continue;
    const url = (s.target_url || '').toString().trim();
    if (url) return trimTrailingUrlPunctuation(url);
  }

  return null;
}

async function resolvePreviewUrlFromPrCommentsGeneric(opts: {
  octokit: ReturnType<typeof github.getOctokit>;
  owner: string;
  repo: string;
  prNumber: number;
  timeoutMs: number;
  pollIntervalMs: number;
  authorLogins: string[];
  urlRegexRaw: string;
}): Promise<string | null> {
  const allow = new Set(opts.authorLogins.map(s => s.toLowerCase()).filter(Boolean));
  if (allow.size === 0) return null;

  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const comments = await (opts.octokit as any).paginate(
      (opts.octokit as any).rest.issues.listComments,
      {
        owner: opts.owner,
        repo: opts.repo,
        issue_number: opts.prNumber,
        per_page: 100
      }
    ) as Array<{
      body?: string | null;
      user?: { login?: string | null } | null;
    }>;

    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      const login = (c.user?.login || '').toLowerCase();
      if (!allow.has(login)) continue;
      const url = extractUrlFromText(c.body || '', opts.urlRegexRaw);
      if (url) return url;
    }

    await sleep(opts.pollIntervalMs);
  }

  return null;
}

type PreviewUrlSource = 'auto' | 'deployments' | 'checks' | 'statuses' | 'comments' | 'none';

async function resolvePreviewUrl(opts: {
  source: PreviewUrlSource;
  octokit: ReturnType<typeof github.getOctokit>;
  owner: string;
  repo: string;
  prNumber: number;
  sha: string;
  timeoutMs: number;
  pollIntervalMs: number;
  deploymentEnvironmentRegexRaw: string;
  checkNameRegexRaw: string;
  statusContextRegexRaw: string;
  commentAuthorLogins: string[];
  commentUrlRegexRaw: string;
}): Promise<string | null> {
  const failOpen = async (label: string, fn: () => Promise<string | null>): Promise<string | null> => {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      core.warning(`Preview URL resolver '${label}' failed (will continue): ${msg}`);
      return null;
    }
  };

  const runGenericComments = async (): Promise<string | null> => {
    return resolvePreviewUrlFromPrCommentsGeneric({
      octokit: opts.octokit,
      owner: opts.owner,
      repo: opts.repo,
      prNumber: opts.prNumber,
      timeoutMs: opts.timeoutMs,
      pollIntervalMs: opts.pollIntervalMs,
      authorLogins: opts.commentAuthorLogins,
      urlRegexRaw: opts.commentUrlRegexRaw
    });
  };

  const runDeployments = async (): Promise<string | null> => {
    return resolvePreviewUrlFromDeployments({
      octokit: opts.octokit,
      owner: opts.owner,
      repo: opts.repo,
      sha: opts.sha,
      environmentRegexRaw: opts.deploymentEnvironmentRegexRaw
    });
  };

  const runChecks = async (): Promise<string | null> => {
    return resolvePreviewUrlFromCheckRuns({
      octokit: opts.octokit,
      owner: opts.owner,
      repo: opts.repo,
      sha: opts.sha,
      checkNameRegexRaw: opts.checkNameRegexRaw
    });
  };

  const runStatuses = async (): Promise<string | null> => {
    return resolvePreviewUrlFromStatuses({
      octokit: opts.octokit,
      owner: opts.owner,
      repo: opts.repo,
      sha: opts.sha,
      statusContextRegexRaw: opts.statusContextRegexRaw
    });
  };

  if (opts.source === 'none') return null;
  if (opts.source === 'deployments') return failOpen('deployments', runDeployments);
  if (opts.source === 'checks') return failOpen('checks', runChecks);
  if (opts.source === 'statuses') return failOpen('statuses', runStatuses);
  if (opts.source === 'comments') return failOpen('comments', runGenericComments);

  // auto
  const d = await failOpen('deployments', runDeployments);
  if (d) return d;
  const c = await failOpen('checks', runChecks);
  if (c) return c;
  const s = await failOpen('statuses', runStatuses);
  if (s) return s;
  return failOpen('comments', runGenericComments);
}

const UPSERT_TARGET_MUTATION = `
  mutation UpsertSimulationTarget($input: UpsertSimulationTargetInput!) {
    upsertSimulationTarget(input: $input) {
      id
      name
      version
      environment
      buildNumber
      buildUrl
      createdAt
    }
  }
`;

const START_EXPLORATION_MUTATION = `
  mutation StartExploration($input: StartExplorationInput!) {
    startExploration(input: $input) {
      id
      status
      createdAt
    }
  }
`;

const GET_SUBJECT_QUERY = `
  query GetSubject($id: ID!) {
    subject(id: $id) {
      id
      baseUrl
    }
  }
`;

async function run(): Promise<void> {
  try {
    // Get inputs
    const apiUrl = core.getInput('api-url', { required: true });
    const apiKey = core.getInput('api-key', { required: true });
    const subjectId = core.getInput('subject-id', { required: true });

    // Exchange API key for access token
    const authUrlOverride = core.getInput('auth-url').trim();
    const keycloakUrl = authUrlOverride || deriveKeycloakUrl(apiUrl);
    const credentials = decodeApiKey(apiKey);
    core.info(`Authenticating as client: ${credentials.clientId}`);

    const tokenResult = await exchangeApiKeyForToken({
      keycloakUrl,
      realm: 'duku',
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
    });
    const accessToken = tokenResult.accessToken;
    const vercelAutomationBypassSecret = core.getInput('vercel-automation-bypass-secret').trim();
    const startRun = core.getInput('start-run') === 'true';
    const explorationUrlOverride = core.getInput('exploration-url').trim();

    const previewUrlSourceRaw = core.getInput('preview-url-source').trim().toLowerCase();
    const previewUrlSource = (['auto', 'deployments', 'checks', 'statuses', 'comments', 'none'].includes(previewUrlSourceRaw)
      ? previewUrlSourceRaw
      : 'auto') as PreviewUrlSource;
    const previewTimeoutSecondsRaw = core.getInput('preview-timeout-seconds').trim();
    const previewPollIntervalSecondsRaw = core.getInput('preview-poll-interval-seconds').trim();
    const previewDeploymentEnvironmentRegex = core.getInput('preview-deployment-environment-regex').trim();
    const previewCheckNameRegex = core.getInput('preview-check-name-regex').trim();
    const previewStatusContextRegex = core.getInput('preview-status-context-regex').trim();
    const previewCommentAuthorLoginsRaw = core.getInput('preview-comment-author-logins').trim();
    const previewUrlRegex = core.getInput('preview-url-regex').trim();

    // Auto-populate build context from GitHub environment
    const runNumber = process.env.GITHUB_RUN_NUMBER;
    // Prefer PR head SHA when available (stable "build identity" for PR reruns)
    const prNumber = github.context.payload.pull_request?.number;
    const prHeadSha = github.context.payload.pull_request?.head?.sha;
    const buildRef = prHeadSha || process.env.GITHUB_SHA || 'unknown';
    const buildUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    const repository = process.env.GITHUB_REPOSITORY || github.context.payload.repository?.full_name || 'unknown/unknown';

    // Stable identity key:
    // - PR events: one target per PR (shared across commits + reruns)
    // - non-PR events: one target per commit SHA
    const buildKey = prNumber
      ? `github:repo=${repository}:pr=${prNumber}`
      : `github:repo=${repository}:sha=${buildRef}`;

    // Deterministic name (avoid "new name each rerun")
    const shortSha = buildRef.slice(0, 7);
    const prTitle = github.context.payload.pull_request?.title;
    const name = prNumber && prTitle
      ? sanitizeTargetName(`${prTitle} [#${prNumber}]`, { maxLen: 255 })
      : (prNumber ? `pr-${prNumber}-${shortSha}` : `sha-${shortSha}`);
    const version = buildRef.slice(0, 7);
    const branchName = github.context.payload.pull_request?.head?.ref ||
                       process.env.GITHUB_REF_NAME ||
                       'unknown';
    const description = `Build from ${branchName} (${buildRef.slice(0, 7)})`;

    const input = {
      subjectId,
      buildKey,
      name,
      description,
      version,
      environment: 'build',
      buildNumber: runNumber ? parseInt(runNumber, 10) : null,
      buildUrl,
      ...(vercelAutomationBypassSecret
        ? { metadata: { vercelAutomationBypassSecret } }
        : {})
    };

    // Upsert target
    core.info(`Upserting target: ${name}`);
    core.info(`Subject ID: ${subjectId}`);
    core.info(`Version: ${version}`);
    core.info(`Environment: build`);
    core.info(`Build key: ${buildKey}`);

    const response = await request(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        query: UPSERT_TARGET_MUTATION,
        variables: { input }
      })
    });

    const json = await response.body.json() as {
      data?: {
        upsertSimulationTarget: {
          id: string;
          name: string;
          version: string;
          environment: string;
          buildNumber: number | null;
          buildUrl: string | null;
          createdAt: string;
        };
      };
      errors?: Array<{ message: string; [key: string]: unknown }>;
    };

    if (json.errors?.length) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    const target = json.data?.upsertSimulationTarget;
    if (!target) {
      throw new Error('No data returned from mutation');
    }

    core.info(`Target created successfully: ${target.id}`);
    core.info(`Name: ${target.name}`);
    core.info(`Version: ${target.version}`);
    core.info(`Environment: ${target.environment}`);
    core.info(`Build Number: ${target.buildNumber || 'N/A'}`);
    core.info(`Created At: ${target.createdAt}`);

    // Set outputs
    core.setOutput('target-id', target.id);
    core.setOutput('target-name', target.name);
    core.setOutput('target-version', target.version);

    // Start exploration if requested
    let exploration: { id: string; status: string; createdAt: string } | null = null;

    if (startRun) {
      core.info('Starting exploration...');

      // First, get the subject's baseUrl
      core.info(`Fetching subject details for: ${subjectId}`);
      const subjectResponse = await request(apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          query: GET_SUBJECT_QUERY,
          variables: { id: subjectId }
        })
      });

      const subjectJson = await subjectResponse.body.json() as {
        data?: {
          subject: {
            id: string;
            baseUrl: string;
          };
        };
        errors?: Array<{ message: string; [key: string]: unknown }>;
      };

      if (subjectJson.errors?.length) {
        throw new Error(`GraphQL errors fetching subject: ${JSON.stringify(subjectJson.errors)}`);
      }

      const subject = subjectJson.data?.subject;
      if (!subject?.baseUrl) {
        throw new Error('Subject not found or missing baseUrl');
      }

      core.info(`Subject base URL: ${subject.baseUrl}`);

      // Extract PR context if running in a PR
      const installationId = core.getInput('github-installation-id');
      const prContext = github.context.payload.pull_request ? {
        githubRepository: github.context.payload.repository?.full_name,
        githubPrNumber: github.context.payload.pull_request.number,
        githubInstallationId: installationId ? parseInt(installationId, 10) : undefined
      } : {};

      if (prContext.githubRepository) {
        core.info(`PR context detected: ${prContext.githubRepository}#${prContext.githubPrNumber}`);
        if (prContext.githubInstallationId) {
          core.info(`GitHub installation ID: ${prContext.githubInstallationId}`);
        }
      }

      // Start the exploration
      let resolvedPreviewUrl: string | null = null;
      const pr = github.context.payload.pull_request;

      if (!explorationUrlOverride && pr) {
        if (!process.env.GITHUB_TOKEN) {
          core.warning('No GITHUB_TOKEN is set; cannot resolve preview URL via GitHub APIs. Falling back to subject baseUrl.');
        } else {
          const timeoutSecondsRaw = (previewTimeoutSecondsRaw || '60').trim();
          const pollIntervalSecondsRaw = (previewPollIntervalSecondsRaw || '5').trim();
          const timeoutSeconds = Math.max(1, parseInt(timeoutSecondsRaw, 10));
          const pollIntervalSeconds = Math.max(1, parseInt(pollIntervalSecondsRaw, 10));
          const timeoutMs = timeoutSeconds * 1000;
          const pollIntervalMs = pollIntervalSeconds * 1000;

          const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

          const commentAuthorLogins = previewCommentAuthorLoginsRaw
            ? previewCommentAuthorLoginsRaw.split(',').map(s => s.trim()).filter(Boolean)
            : [];

          core.info(`Resolving preview URL (source='${previewUrlSource}', timeout=${timeoutSeconds}s)...`);
          resolvedPreviewUrl = await resolvePreviewUrl({
            source: previewUrlSource,
            octokit,
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            prNumber: pr.number,
            sha: prHeadSha || buildRef,
            timeoutMs,
            pollIntervalMs,
            deploymentEnvironmentRegexRaw: previewDeploymentEnvironmentRegex,
            checkNameRegexRaw: previewCheckNameRegex,
            statusContextRegexRaw: previewStatusContextRegex,
            commentAuthorLogins,
            commentUrlRegexRaw: previewUrlRegex,
          });

          if (resolvedPreviewUrl) {
            core.info(`Using preview URL: ${resolvedPreviewUrl}`);
          } else if (previewUrlSource !== 'none') {
            core.warning(`Preview URL not found; falling back to subject baseUrl.`);
          }
        }
      }

      const explorationUrl = explorationUrlOverride || resolvedPreviewUrl || subject.baseUrl;
      if (explorationUrlOverride) {
        core.info(`Using exploration URL override: ${explorationUrlOverride}`);
      }

      const explorationInput: Record<string, unknown> = {
        url: explorationUrl,
        targetId: target.id,
        ...prContext
      };

      const explorationResponse = await request(apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          query: START_EXPLORATION_MUTATION,
          variables: {
            input: {
              ...explorationInput
            }
          }
        })
      });

      const explorationJson = await explorationResponse.body.json() as {
        data?: {
          startExploration: {
            id: string;
            status: string;
            createdAt: string;
          };
        };
        errors?: Array<{ message: string; [key: string]: unknown }>;
      };

      if (explorationJson.errors?.length) {
        throw new Error(`GraphQL errors starting exploration: ${JSON.stringify(explorationJson.errors)}`);
      }

      exploration = explorationJson.data?.startExploration || null;
      if (!exploration) {
        throw new Error('No data returned from startExploration mutation');
      }

      core.info(`Exploration started successfully: ${exploration.id}`);
      core.info(`Status: ${exploration.status}`);
      core.info(`Created At: ${exploration.createdAt}`);

      // Set exploration outputs
      core.setOutput('run-id', exploration.id);
      core.setOutput('run-status', exploration.status);
    }

  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : 'Unknown error');
  }
}

run();
