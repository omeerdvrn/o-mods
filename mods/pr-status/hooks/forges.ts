// Pure parts: reading a git remote, naming its forge, and turning each forge's
// answer into one list of checks.

import type { Check, CheckState, Forge, Pr } from '../types'

export type Remote = {
  /** Host as written in the remote; an SSH alias until resolved. */
  host: string
  /** `owner/repo`, `group/sub/repo`, or `org/project/repo` on Azure DevOps. */
  path: string
  isSsh: boolean
}

/** Reads `git@host:a/b.git`, `ssh://git@host:2222/a/b.git`, `https://host/a/b`, and Azure DevOps' shapes. */
export function parseRemote(url: string): Remote | null {
  const text = url.trim()
  let host: string
  let path: string
  let isSsh: boolean
  const scp = text.match(/^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/)
  const full = text.match(/^(\w+(?:\+\w+)?):\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+)$/)
  if (full) {
    host = full[2]!
    path = full[3]!
    isSsh = full[1]!.startsWith('ssh') || full[1]!.startsWith('git')
  } else if (scp) {
    host = scp[1]!
    path = scp[2]!
    isSsh = true
  } else return null
  path = path.replace(/\/+$/, '').replace(/\.git$/, '')
  // Azure DevOps: ssh.dev.azure.com:v3/org/project/repo, dev.azure.com/org/project/_git/repo, org.visualstudio.com/project/_git/repo
  if (host === 'ssh.dev.azure.com') path = path.replace(/^v3\//, '')
  if (path.includes('/_git/')) path = path.replace('/_git/', '/')
  const vs = host.match(/^([^.]+)\.visualstudio\.com$/)
  if (vs) {
    host = 'dev.azure.com'
    path = `${vs[1]}/${path.replace(/^DefaultCollection\//, '')}`
  }
  if (host === 'ssh.dev.azure.com' || host === 'vs-ssh.visualstudio.com') host = 'dev.azure.com'
  if (!path.includes('/')) return null

  return { host, path, isSsh }
}

/** The forge a well-known host runs; undefined for one that must be asked. */
export function knownForge(host: string): Forge | undefined {
  const name = host.toLowerCase()
  if (name === 'github.com' || name.endsWith('.ghe.com')) return 'github'
  if (name === 'gitlab.com') return 'gitlab'
  if (name === 'bitbucket.org') return 'bitbucket'
  if (name === 'dev.azure.com') return 'azure'
  if (name === 'codeberg.org' || name === 'gitea.com') return 'gitea'
  if (/(^|\.)github\./.test(name)) return 'github'
  if (/(^|\.)gitlab\./.test(name)) return 'gitlab'
  if (/(^|\.)(gitea|forgejo)\./.test(name)) return 'gitea'

  return undefined
}

/** `ssh -G alias` prints `hostname real.host`; SSH aliases like `github.com-work` resolve here. */
export function sshHostname(output: string): string | undefined {
  return output.match(/^hostname\s+(\S+)/m)?.[1]
}

/** What a probe of `https://host/<path>` says about the forge behind it. */
export function forgeFromProbe(probe: { gitea?: Probe; gitlab?: Probe; github?: Probe }): Forge | undefined {
  const isJson = (one?: Probe) => Boolean(one && one.status < 500 && /^\s*[{[]/.test(one.text))
  if (isJson(probe.gitea) && (probe.gitea!.status === 200 || /signed in|token/i.test(probe.gitea!.text))) return 'gitea'
  if (isJson(probe.gitlab) && (probe.gitlab!.status === 200 || probe.gitlab!.status === 401)) return 'gitlab'
  if (isJson(probe.github) && probe.github!.status === 200) return 'github'

  return undefined
}

export type Probe = { status: number; text: string }

export function tally(checks: Check[]): Record<CheckState, number> {
  const counts: Record<CheckState, number> = { passed: 0, failed: 0, running: 0, queued: 0, warning: 0, skipped: 0, cancelled: 0 }
  for (const check of checks) counts[check.state] += 1

  return counts
}

export function isSettled(pr: Pr): boolean {
  return pr.checks.every(check => check.state !== 'running' && check.state !== 'queued')
}

/** The newest result per name, so a re-run replaces the run it repeats. */
function latest(checks: (Check & { at?: string })[]): Check[] {
  const byName = new Map<string, Check & { at?: string }>()
  for (const check of checks) {
    const seen = byName.get(check.name)
    if (!seen || (check.at ?? '') >= (seen.at ?? '')) byName.set(check.name, check)
  }

  return [...byName.values()].map(({ at: _at, ...check }) => check)
}

// GitHub: `gh pr view --json statusCheckRollup`, or REST check runs and statuses.

type GhRollup = {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string | null
  state?: string
  detailsUrl?: string
  targetUrl?: string
  workflowName?: string
  startedAt?: string
}

export function githubRunState(status: string | undefined, conclusion: string | null | undefined): CheckState {
  const done = (status ?? '').toUpperCase()
  if (done && done !== 'COMPLETED') return done === 'IN_PROGRESS' ? 'running' : 'queued'
  switch ((conclusion ?? '').toUpperCase()) {
    case 'SUCCESS':
      return 'passed'
    case 'NEUTRAL':
    case 'SKIPPED':
      return 'skipped'
    case 'CANCELLED':
    case 'STALE':
      return 'cancelled'
    case '':
      return 'queued'
    default:
      return 'failed'
  }
}

export function githubStatusState(state: string | undefined): CheckState {
  switch ((state ?? '').toUpperCase()) {
    case 'SUCCESS':
      return 'passed'
    case 'PENDING':
      return 'running'
    case 'EXPECTED':
      return 'queued'
    default:
      return 'failed'
  }
}

export function fromGhView(json: string): Pr | null {
  const view = JSON.parse(json) as {
    number: number
    title: string
    url: string
    state: string
    isDraft: boolean
    statusCheckRollup?: GhRollup[]
  }
  if (view.state !== 'OPEN') return null
  const checks = (view.statusCheckRollup ?? []).map(item =>
    item.__typename === 'StatusContext' || item.context
      ? { name: item.context ?? 'status', state: githubStatusState(item.state), url: item.targetUrl }
      : {
          name: item.workflowName ? `${item.workflowName} / ${item.name}` : (item.name ?? 'check'),
          state: githubRunState(item.status, item.conclusion),
          url: item.detailsUrl,
          at: item.startedAt,
        },
  )

  return { forge: 'github', number: view.number, title: view.title, url: view.url, isDraft: view.isDraft, checks: latest(checks) }
}

export function fromGithubRest(
  pull: { number: number; title: string; html_url: string; draft?: boolean },
  runs: { check_runs?: { name: string; status: string; conclusion: string | null; html_url?: string; started_at?: string }[] },
  statuses: { statuses?: { context: string; state: string; target_url?: string }[] },
): Pr {
  const checks = [
    ...(runs.check_runs ?? []).map(run => ({ name: run.name, state: githubRunState(run.status, run.conclusion), url: run.html_url, at: run.started_at })),
    ...(statuses.statuses ?? []).map(one => ({ name: one.context, state: githubStatusState(one.state), url: one.target_url })),
  ]

  return { forge: 'github', number: pull.number, title: pull.title, url: pull.html_url, isDraft: Boolean(pull.draft), checks: latest(checks) }
}

// Gitea and Forgejo: tea's `simple` output marks each status with a glyph; the REST API names it.

const TEA_GLYPHS: Record<string, CheckState> = { '✓': 'passed', '⏳': 'running', '⚠': 'warning', '✘': 'failed', '❌': 'failed' }

/** One PR's line of `tea pulls list --fields index,ci --output simple`: `842 ✓ CI / lint (pull_request), ❌ CI / unit (pull_request)`. */
export function teaChecks(simple: string, index: number): Check[] | undefined {
  const line = simple.split('\n').find(row => row.trim().startsWith(`${index} `) || row.trim() === `${index}`)
  if (line === undefined) return undefined
  const rest = line.trim().slice(String(index).length).trim()
  if (rest === '') return []

  // tea marks most checks with a symbol, but prints a check that has not started yet bare: queued.
  return rest
    .split(/,\s+/u)
    .map(part => {
      const glyph = [...part][0] ?? ''
      const state = TEA_GLYPHS[glyph]
      return { name: (state ? part.slice(glyph.length) : part).trim(), state: state ?? 'queued' }
    })
    .filter(check => check.name !== '')
}

export function giteaState(status: string): CheckState {
  switch (status) {
    case 'success':
      return 'passed'
    case 'pending':
      return 'running'
    case 'warning':
      return 'warning'
    case 'skipped':
      return 'skipped'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'failed'
  }
}

export function fromGiteaRest(
  pull: { number: number; title: string; html_url: string; draft?: boolean },
  combined: { statuses?: { context: string; status: string; target_url?: string }[] | null },
): Pr {
  const checks = (combined.statuses ?? []).map(one => ({ name: one.context, state: giteaState(one.status), url: one.target_url || undefined }))

  return { forge: 'gitea', number: pull.number, title: pull.title, url: pull.html_url, isDraft: Boolean(pull.draft) || /^(WIP|Draft)\b/i.test(pull.title), checks }
}

// GitLab: the merge request's head pipeline and its jobs.

export function gitlabState(status: string, allowFailure = false): CheckState {
  switch (status) {
    case 'success':
      return 'passed'
    case 'failed':
      return allowFailure ? 'warning' : 'failed'
    case 'running':
      return 'running'
    case 'canceled':
    case 'canceling':
      return 'cancelled'
    case 'skipped':
    case 'manual':
      return 'skipped'
    default:
      return 'queued'
  }
}

export function fromGitlab(
  mr: { iid: number; title: string; web_url: string; draft?: boolean; work_in_progress?: boolean },
  jobs: { name: string; stage?: string; status: string; web_url?: string; allow_failure?: boolean }[],
): Pr {
  const checks = jobs.map(job => ({ name: job.stage ? `${job.stage} / ${job.name}` : job.name, state: gitlabState(job.status, job.allow_failure), url: job.web_url }))

  return { forge: 'gitlab', number: mr.iid, title: mr.title, url: mr.web_url, isDraft: Boolean(mr.draft ?? mr.work_in_progress), checks }
}

// Bitbucket Cloud: commit statuses on the pull request.

export function bitbucketState(state: string): CheckState {
  switch (state) {
    case 'SUCCESSFUL':
      return 'passed'
    case 'INPROGRESS':
      return 'running'
    case 'STOPPED':
      return 'cancelled'
    default:
      return 'failed'
  }
}

export function fromBitbucket(
  pull: { id: number; title: string; draft?: boolean; links?: { html?: { href?: string } } },
  statuses: { values?: { key: string; name?: string; state: string; url?: string; updated_on?: string }[] },
): Pr {
  const checks = (statuses.values ?? []).map(one => ({ name: one.name || one.key, state: bitbucketState(one.state), url: one.url, at: one.updated_on }))

  return { forge: 'bitbucket', number: pull.id, title: pull.title, url: pull.links?.html?.href ?? '', isDraft: Boolean(pull.draft), checks: latest(checks) }
}

// Azure DevOps: builds of the PR's merge ref, plus statuses posted on the PR.

export function azureBuildState(status: string, result?: string): CheckState {
  if (status !== 'completed') return status === 'inProgress' || status === 'cancelling' ? 'running' : 'queued'
  switch (result) {
    case 'succeeded':
      return 'passed'
    case 'partiallySucceeded':
      return 'warning'
    case 'canceled':
      return 'cancelled'
    default:
      return 'failed'
  }
}

export function azureStatusState(state: string): CheckState {
  switch (state) {
    case 'succeeded':
      return 'passed'
    case 'pending':
      return 'running'
    case 'notApplicable':
      return 'skipped'
    case 'notSet':
      return 'queued'
    default:
      return 'failed'
  }
}

export function fromAzure(
  pull: { pullRequestId: number; title: string; isDraft?: boolean },
  webUrl: string,
  builds: { value?: { definition?: { name?: string }; status: string; result?: string; queueTime?: string; _links?: { web?: { href?: string } } }[] },
  statuses: { value?: { context?: { genre?: string; name?: string }; state: string; targetUrl?: string; creationDate?: string }[] },
): Pr {
  const checks = [
    ...(builds.value ?? []).map(build => ({
      name: build.definition?.name ?? 'build',
      state: azureBuildState(build.status, build.result),
      url: build._links?.web?.href,
      at: build.queueTime,
    })),
    ...(statuses.value ?? []).map(one => ({
      name: [one.context?.genre, one.context?.name].filter(Boolean).join('/') || 'status',
      state: azureStatusState(one.state),
      url: one.targetUrl,
      at: one.creationDate,
    })),
  ]

  return { forge: 'azure', number: pull.pullRequestId, title: pull.title, url: webUrl, isDraft: Boolean(pull.isDraft), checks: latest(checks) }
}

/** Shell commands after which a PR may have just been opened or its checks restarted. */
export const PR_ACTIVITY = /\b(git\s+(push|checkout|switch|worktree)|gh\s+pr\s+(create|ready|reopen)|glab\s+mr\s+(create|update|reopen)|tea\s+(pr|pulls)\s+(create|c|reopen)|az\s+repos\s+pr\s+create|gh\s+run\s+rerun|glab\s+ci\s+(retry|run))\b/
