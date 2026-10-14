import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Check, CheckState, Forge, Pr, View } from '../types'
import {
  PR_ACTIVITY,
  forgeFromProbe,
  fromAzure,
  fromBitbucket,
  fromGhView,
  fromGiteaRest,
  fromGithubRest,
  fromGitlab,
  isSettled,
  knownForge,
  parseRemote,
  sshHostname,
  tally,
  teaChecks,
} from './forges'
import type { Probe, Remote } from './forges'

// Reading the open PR for a branch from each forge: its CLI when installed and
// signed in (gh, glab, tea), its REST API with a token from the environment
// otherwise.

const TIMEOUT_MS = 20_000
/** How many pages of 50 to look back through for a pinned Gitea PR. */
const TEA_PAGES = 20
/** Where a pinned Gitea PR sits in tea's newest-first list, so its CI is one cheap row away. */
const positions = new Map<string, number>()
const BIN_FOLDERS = ['', '/opt/homebrew/bin/', '/usr/local/bin/', '/usr/bin/']
const found = new Map<string, string | null>()

type Ran = { exitCode: number; stdout: string; stderr: string }

/**
 * Runs a program, looked up on PATH and then in the usual Homebrew and system folders; null when it is not
 * installed. Only a missing program counts as not installed: a call that times out or fails otherwise comes
 * back as a failed run, so one slow forge answer never hides the CLI for the rest of the session.
 */
async function run($: EngineInterface, argv: string[], cwd: string): Promise<Ran | null> {
  const [name, ...rest] = argv
  if (!name) return null
  const known = found.get(name)
  if (known === null) return null
  for (const folder of known !== undefined ? [''] : BIN_FOLDERS) {
    const program = known ?? `${folder}${name}`
    let failure = ''
    const ran = await $.process.run([program, ...rest], { cwd, timeoutMs: TIMEOUT_MS }).catch((error: unknown) => {
      failure = error instanceof Error ? error.message : String(error)
      return null
    })
    if (ran === null && /ENOENT|not found|no such file|executable/i.test(failure)) continue
    found.set(name, program)
    if (ran === null) return { exitCode: 124, stdout: '', stderr: failure || `${name} did not answer` }
    return { exitCode: ran.exitCode ?? 1, stdout: ran.stdout, stderr: ran.stderr }
  }
  found.set(name, null)

  return null
}

async function getJson<T>($: EngineInterface, url: string, headers: Record<string, string>): Promise<T> {
  const response = await $.http.fetch(url, { headers: { accept: 'application/json', ...headers } })
  if (!response.ok) throw new Error(`${response.status} from ${new URL(url).host}${response.status === 401 || response.status === 403 ? ' (token missing or without access)' : ''}`)

  return JSON.parse(response.text) as T
}

async function probe($: EngineInterface, url: string): Promise<Probe | undefined> {
  const response = await $.http.fetch(url, { headers: { accept: 'application/json' } }).catch(() => undefined)

  return response ? { status: response.status, text: response.text.slice(0, 400) } : undefined
}

/** The real host behind an SSH alias such as `github.com-work`. */
async function resolveHost($: EngineInterface, remote: Remote, cwd: string): Promise<string> {
  if (!remote.isSsh) return remote.host
  const ran = await run($, ['ssh', '-G', remote.host], cwd)

  return (ran && sshHostname(ran.stdout)) || remote.host
}

/** Known host, then the signed-in CLIs, then a probe of the host's API. */
async function detectForge($: EngineInterface, host: string, cwd: string): Promise<Forge | undefined> {
  const known = knownForge(host)
  if (known) return known
  const tea = await run($, ['tea', 'login', 'list', '--output', 'json'], cwd)
  if (tea?.exitCode === 0 && tea.stdout.includes(host)) return 'gitea'
  const glab = await run($, ['glab', 'auth', 'status', '--hostname', host], cwd)
  if (glab?.exitCode === 0) return 'gitlab'
  const gh = await run($, ['gh', 'auth', 'status', '--hostname', host], cwd)
  if (gh?.exitCode === 0) return 'github'
  const base = `https://${host}`
  const [gitea, gitlab, github] = await Promise.all([probe($, `${base}/api/v1/version`), probe($, `${base}/api/v4/version`), probe($, `${base}/api/v3/meta`)])

  return forgeFromProbe({ gitea, gitlab, github })
}

/** Where to look: the repository, and either the branch's open PR or, with `number`, that PR. */
type Target = { forge: Forge; host: string; path: string; branch: string; cwd: string; number?: number }

async function readPr($: EngineInterface, target: Target): Promise<Pr | null> {
  switch (target.forge) {
    case 'github':
      return readGithub($, target)
    case 'gitlab':
      return readGitlab($, target)
    case 'gitea':
      return readGitea($, target)
    case 'bitbucket':
      return readBitbucket($, target)
    case 'azure':
      return readAzure($, target)
  }
}

async function readGithub($: EngineInterface, { host, path, branch, cwd, number }: Target): Promise<Pr | null> {
  const fields = 'number,title,url,state,isDraft,statusCheckRollup'
  const repo = host === 'github.com' ? path : `${host}/${path}`
  const gh = await run($, ['gh', 'pr', 'view', number === undefined ? branch : String(number), '--repo', repo, '--json', fields], cwd)
  if (gh?.exitCode === 0) return fromGhView(gh.stdout)
  if (gh && /no (open )?pull requests? found/i.test(gh.stderr)) return null
  const token = (await $.env.get('GH_TOKEN')) || (await $.env.get('GITHUB_TOKEN'))
  if (!token && gh) throw new Error(`gh: ${gh.stderr.trim().split('\n')[0] ?? 'failed'}`)
  const api = host === 'github.com' ? 'https://api.github.com' : `https://${host}/api/v3`
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}
  const owner = path.split('/')[0]
  type Pull = { number: number; title: string; html_url: string; draft?: boolean; head: { sha: string } }
  const pull =
    number === undefined
      ? (await getJson<Pull[]>($, `${api}/repos/${path}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`, headers))[0]
      : await getJson<Pull>($, `${api}/repos/${path}/pulls/${number}`, headers)
  if (!pull) return null
  const [runs, statuses] = await Promise.all([
    getJson<Parameters<typeof fromGithubRest>[1]>($, `${api}/repos/${path}/commits/${pull.head.sha}/check-runs?per_page=100`, headers),
    getJson<Parameters<typeof fromGithubRest>[2]>($, `${api}/repos/${path}/commits/${pull.head.sha}/status?per_page=100`, headers),
  ])

  return fromGithubRest(pull, runs, statuses)
}

async function readGitlab($: EngineInterface, { host, path, branch, cwd, number }: Target): Promise<Pr | null> {
  const project = encodeURIComponent(path)
  const token = (await $.env.get('GITLAB_TOKEN')) || (await $.env.get('GL_TOKEN'))
  const hasGlab = !token && (await run($, ['glab', 'auth', 'status', '--hostname', host], cwd))?.exitCode === 0
  const get = async <T,>(endpoint: string): Promise<T> => {
    if (hasGlab) {
      const ran = await run($, ['glab', 'api', '--hostname', host, endpoint], cwd)
      if (ran?.exitCode !== 0) throw new Error(`glab: ${ran?.stderr.trim().split('\n')[0] ?? 'failed'}`)
      return JSON.parse(ran.stdout) as T
    }
    return getJson<T>($, `https://${host}/api/v4/${endpoint}`, token ? { 'private-token': token } : {})
  }
  type Mr = Parameters<typeof fromGitlab>[0] & { head_pipeline?: { id: number } | null }
  const iid =
    number ?? (await get<Mr[]>(`projects/${project}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`))[0]?.iid
  if (iid === undefined) return null
  const mr = await get<Mr>(`projects/${project}/merge_requests/${iid}`)
  const pipeline = mr.head_pipeline?.id
  const jobs = pipeline ? await get<Parameters<typeof fromGitlab>[1]>(`projects/${project}/pipelines/${pipeline}/jobs?per_page=100`) : []

  return fromGitlab(mr, jobs)
}

/** The branch's open PR through tea: the first page of open PRs, with their CI. Undefined when tea is missing. */
async function teaBranchPr($: EngineInterface, path: string, branch: string, cwd: string): Promise<Pr | null | undefined> {
  const common = ['--repo', path, '--state', 'open', '--limit', '50']
  const list = await run($, ['tea', 'pulls', 'list', ...common, '--fields', 'index,title,head,url', '--output', 'json'], cwd)
  if (!list) return undefined
  if (list.exitCode !== 0) throw new Error(`tea: ${list.stderr.trim().split('\n')[0] || 'failed'}`)
  const pulls = JSON.parse(list.stdout || '[]') as { index: string; title: string; head: string; url: string }[]
  const pull = pulls.find(one => one.head === branch || one.head.endsWith(`:${branch}`))
  if (!pull) return null
  const index = Number(pull.index)
  // tea fetches CI for every row it prints: ask for the PR's own row, and the full page only if it moved.
  const position = pulls.indexOf(pull) + 1
  const row = await run($, ['tea', 'pulls', 'list', '--repo', path, '--state', 'open', '--limit', '1', '--page', String(position), '--fields', 'index,ci', '--output', 'simple'], cwd)
  let checks = row?.exitCode === 0 ? teaChecks(row.stdout, index) : undefined
  if (checks === undefined) {
    const ci = await run($, ['tea', 'pulls', 'list', ...common, '--fields', 'index,ci', '--output', 'simple'], cwd)
    checks = ci?.exitCode === 0 ? (teaChecks(ci.stdout, index) ?? []) : []
  }

  return { forge: 'gitea', number: index, title: pull.title, url: pull.url, isDraft: /^(WIP|Draft)\b/i.test(pull.title), checks }
}

/**
 * Any PR by number through tea, kept quick: the PR itself in one call, then its CI from a one-row page of
 * the full list. tea's list with CI fetches statuses for every row it prints, so the row's position is
 * found first by paging through numbers alone, and remembered.
 */
async function teaPinnedPr($: EngineInterface, path: string, number: number, cwd: string): Promise<Pr | null | undefined> {
  const shown = await run($, ['tea', 'pulls', String(number), '--repo', path, '--output', 'json'], cwd)
  if (!shown) return undefined
  if (shown.exitCode === 124) throw new Error(`tea: ${shown.stderr}`)
  if (shown.exitCode !== 0) return null
  const pull = JSON.parse(shown.stdout) as { index: number; title: string; url: string }
  const row = (position: number) =>
    run($, ['tea', 'pulls', 'list', '--repo', path, '--state', 'all', '--limit', '1', '--page', String(position), '--fields', 'index,ci', '--output', 'simple'], cwd)

  let position = positions.get(`${path}#${number}`)
  let ci = position === undefined ? undefined : await row(position)
  // New PRs push older ones down the list: find the row again when it moved.
  if (!ci || ci.exitCode !== 0 || teaChecks(ci.stdout, number) === undefined) {
    position = undefined
    for (let page = 1; page <= TEA_PAGES && position === undefined; page++) {
      const numbers = await run($, ['tea', 'pulls', 'list', '--repo', path, '--state', 'all', '--limit', '50', '--page', String(page), '--fields', 'index', '--output', 'simple'], cwd)
      if (numbers?.exitCode !== 0) break
      const indexes = numbers.stdout.split('\n').map(line => Number(line.trim())).filter(Number.isFinite).filter(index => index > 0)
      const at = indexes.indexOf(number)
      if (at >= 0) position = (page - 1) * 50 + at + 1
      else if (indexes.length === 0 || indexes[indexes.length - 1]! < number) break
    }
    if (position !== undefined) positions.set(`${path}#${number}`, position)
    ci = position === undefined ? undefined : await row(position)
  }
  const checks = ci?.exitCode === 0 ? (teaChecks(ci.stdout, number) ?? []) : []

  return { forge: 'gitea', number: pull.index, title: pull.title, url: pull.url, isDraft: /^(WIP|Draft)\b/i.test(pull.title), checks }
}

async function readGitea($: EngineInterface, { host, path, branch, cwd, number }: Target): Promise<Pr | null> {
  const token = (await $.env.get('GITEA_TOKEN')) || (await $.env.get('FORGEJO_TOKEN')) || (await $.env.get('CODEBERG_TOKEN'))
  if (!token) {
    const fromTea = number === undefined ? await teaBranchPr($, path, branch, cwd) : await teaPinnedPr($, path, number, cwd)
    if (fromTea !== undefined) return fromTea
  }
  const api = `https://${host}/api/v1/repos/${path}`
  const headers: Record<string, string> = token ? { authorization: `token ${token}` } : {}
  type Pull = Parameters<typeof fromGiteaRest>[0] & { head: { ref: string; sha: string } }
  const pull =
    number === undefined
      ? (await getJson<Pull[]>($, `${api}/pulls?state=open&limit=50`, headers)).find(one => one.head.ref === branch)
      : await getJson<Pull>($, `${api}/pulls/${number}`, headers)
  if (!pull) return null
  const combined = await getJson<Parameters<typeof fromGiteaRest>[1]>($, `${api}/commits/${pull.head.sha}/status`, headers)

  return fromGiteaRest(pull, combined)
}

async function readBitbucket($: EngineInterface, { path, branch, number }: Target): Promise<Pr | null> {
  const bearer = await $.env.get('BITBUCKET_TOKEN')
  const user = await $.env.get('BITBUCKET_USERNAME')
  const password = await $.env.get('BITBUCKET_APP_PASSWORD')
  const headers: Record<string, string> = bearer ? { authorization: `Bearer ${bearer}` } : user && password ? { authorization: `Basic ${btoa(`${user}:${password}`)}` } : {}
  const api = `https://api.bitbucket.org/2.0/repositories/${path}/pullrequests`
  const query = encodeURIComponent(`source.branch.name="${branch}" AND state="OPEN"`)
  const pull =
    number === undefined
      ? (await getJson<{ values?: Parameters<typeof fromBitbucket>[0][] }>($, `${api}?q=${query}`, headers)).values?.[0]
      : await getJson<Parameters<typeof fromBitbucket>[0]>($, `${api}/${number}`, headers)
  if (!pull) return null
  const statuses = await getJson<Parameters<typeof fromBitbucket>[1]>($, `${api}/${pull.id}/statuses?pagelen=100`, headers)

  return fromBitbucket(pull, statuses)
}

async function readAzure($: EngineInterface, { path, branch, number }: Target): Promise<Pr | null> {
  const pat = (await $.env.get('AZURE_DEVOPS_EXT_PAT')) || (await $.env.get('AZURE_DEVOPS_TOKEN'))
  if (!pat) throw new Error('set AZURE_DEVOPS_EXT_PAT to a personal access token with Code and Build read access')
  const [org, project, repo] = path.split('/')
  if (!org || !project || !repo) throw new Error(`cannot read org/project/repo from ${path}`)
  const headers = { authorization: `Basic ${btoa(`:${pat}`)}` }
  const base = `https://dev.azure.com/${org}/${project}/_apis`
  const version = 'api-version=7.1'
  const ref = encodeURIComponent(`refs/heads/${branch}`)
  const pull =
    number === undefined
      ? (await getJson<{ value?: Parameters<typeof fromAzure>[0][] }>($, `${base}/git/repositories/${repo}/pullrequests?searchCriteria.sourceRefName=${ref}&searchCriteria.status=active&${version}`, headers)).value?.[0]
      : await getJson<Parameters<typeof fromAzure>[0]>($, `${base}/git/repositories/${repo}/pullrequests/${number}?${version}`, headers)
  if (!pull) return null
  const id = pull.pullRequestId
  const merge = encodeURIComponent(`refs/pull/${id}/merge`)
  const [builds, statuses] = await Promise.all([
    getJson<Parameters<typeof fromAzure>[2]>($, `${base}/build/builds?branchName=${merge}&queryOrder=queueTimeDescending&$top=50&${version}`, headers),
    getJson<Parameters<typeof fromAzure>[3]>($, `${base}/git/repositories/${repo}/pullRequests/${id}/statuses?${version}`, headers),
  ])

  return fromAzure(pull, `https://dev.azure.com/${org}/${project}/_git/${repo}/pullrequest/${id}`, builds, statuses)
}

const ACTIVE_MS = 10_000
const SETTLED_MS = 60_000
const NO_PR_MS = 30_000
const FORGES_KEY = 'forges'

const EMPTY: View = { branch: null, forge: null, pinned: null, pr: null, error: null, checkedAt: 0 }
const view = atom({ plugin: 'pr-status', key: 'view' } as const, EMPTY)
const isHidden = atom({ plugin: 'pr-status', key: 'isHidden' } as const, false)
const pinnedPr = atom({ plugin: 'pr-status', key: 'pinned' } as const, null as number | null)

const FORGE_NAMES: Record<Forge, string> = { github: 'GitHub', gitlab: 'GitLab', gitea: 'Gitea', bitbucket: 'Bitbucket', azure: 'Azure DevOps' }

const BADGES: { state: CheckState; glyph: string; label: string; color: string }[] = [
  { state: 'failed', glyph: '✗', label: 'failed', color: 'error' },
  { state: 'running', glyph: '⟳', label: 'running', color: 'warning' },
  { state: 'queued', glyph: '○', label: 'queued', color: 'inactive' },
  { state: 'warning', glyph: '⚠', label: 'warning', color: 'warning' },
  { state: 'passed', glyph: '✓', label: 'passed', color: 'success' },
  { state: 'cancelled', glyph: '⊘', label: 'cancelled', color: 'inactive' },
  { state: 'skipped', glyph: '–', label: 'skipped', color: 'inactive' },
]

let timer: { cancel: () => void } | null = null
let inFlight: Promise<void> | null = null
/** The read queued behind the one in flight; every caller who asked meanwhile waits for it. */
let queued: Promise<void> | null = null

async function git($: EngineInterface, args: string[], cwd: string): Promise<string | null> {
  const ran = await run($, ['git', ...args], cwd)

  return ran?.exitCode === 0 ? ran.stdout.trim() : null
}

/** The forge for a host: remembered on this machine once detected. */
async function forgeOf($: EngineInterface, host: string, cwd: string): Promise<Forge | undefined> {
  const saved = ((await $.store.get(FORGES_KEY)) ?? {}) as Record<string, Forge>
  if (saved[host]) return saved[host]
  const forge = await detectForge($, host, cwd)
  if (forge) await $.store.set(FORGES_KEY, { ...saved, [host]: forge })

  return forge
}

async function readView($: EngineInterface): Promise<View> {
  const cwd = await $.session.cwd()
  const checkedAt = await $.clock.now()
  const pinned = await read($, pinnedPr)
  const branch = await git($, ['symbolic-ref', '--short', '-q', 'HEAD'], cwd)
  // A pinned PR needs only the repository, so it works on a detached HEAD too.
  if (!branch && pinned === null) return { ...EMPTY, checkedAt }
  const remoteName = (branch && (await git($, ['config', `branch.${branch}.remote`], cwd))) || 'origin'
  const merge = branch ? await git($, ['config', `branch.${branch}.merge`], cwd) : null
  const remoteBranch = merge?.replace(/^refs\/heads\//, '') || branch || ''
  const url = await git($, ['remote', 'get-url', remoteName === '.' ? 'origin' : remoteName], cwd)
  const remote = url ? parseRemote(url) : null
  if (!remote) return { ...EMPTY, branch, pinned, checkedAt }
  const host = await resolveHost($, remote, cwd)
  const forge = await forgeOf($, host, cwd)
  if (!forge) return { ...EMPTY, branch, pinned, error: `could not tell which forge ${host} runs`, checkedAt }
  try {
    const pr = await readPr($, { forge, host, path: remote.path, branch: remoteBranch, cwd, number: pinned ?? undefined })
    return { branch, forge, pinned, pr, error: null, checkedAt }
  } catch (error) {
    const previous = await read($, view)
    // Keep showing the last known PR through a passing network error.
    const isSame = previous.branch === branch && previous.pinned === pinned
    return { branch, forge, pinned, pr: isSame ? previous.pr : null, error: error instanceof Error ? error.message : String(error), checkedAt }
  }
}

function summary(checks: Check[]): string {
  const counts = tally(checks)
  const parts = BADGES.filter(badge => counts[badge.state] > 0).map(badge => `${counts[badge.state]} ${badge.label}`)

  return parts.length > 0 ? parts.join(', ') : 'no checks yet'
}

function announce($: EngineInterface, before: View, after: View) {
  const pr = after.pr
  if (!pr) return
  const old = before.pr
  // Pinning or unpinning is the person's own doing: nothing to announce.
  if (before.pinned !== after.pinned) return
  if (!old || old.number !== pr.number || old.forge !== pr.forge) {
    if (before.checkedAt > 0) $.ui.toast(`PR #${pr.number} opened: ${summary(pr.checks)}`)
    return
  }
  if (isSettled(old) || !isSettled(pr) || pr.checks.length === 0) return
  const failed = pr.checks.filter(check => check.state === 'failed')
  $.ui.toast(
    failed.length > 0
      ? `PR #${pr.number}: CI failed (${failed.length} of ${pr.checks.length}): ${failed.map(check => check.name).slice(0, 3).join(', ')}`
      : `PR #${pr.number}: CI passed (${pr.checks.length} checks)`,
  )
}

/**
 * What to suggest in the empty input bar while the PR has failing checks: fix them. Null when nothing failed.
 * Check names drop their trigger suffix ("CI / unit (pull_request)" reads "CI / unit").
 */
export function fixSuggestion(current: View): string | null {
  const pr = current.pr
  const failed = (pr?.checks ?? []).filter(check => check.state === 'failed').map(check => check.name.replace(/\s*\((pull_request|push)[^)]*\)$/, ''))
  if (!pr || failed.length === 0) return null
  const names = failed.length <= 2 ? failed.map(name => `\`${name}\``).join(' and ') : `\`${failed[0]}\`, \`${failed[1]}\` and ${failed.length - 2} more`
  return `Fix the failing ${names} check${failed.length > 1 ? 's' : ''} on PR #${pr.number}.`
}

/** The suggestion last put in the input bar, so a refresh with the same failures does not repeat it. */
let suggested: string | null = null

/** Puts the fix suggestion in the empty input bar when the failing checks change; Tab takes it. */
function suggestFix($: EngineInterface, current: View) {
  const text = fixSuggestion(current)
  if (text === suggested) return
  suggested = text
  if (text) void $.prompt.suggest({ text }).catch(() => undefined)
}

function nextDelay(current: View): number {
  if (!current.pr) return NO_PR_MS
  if (!isSettled(current.pr) || current.pr.checks.length === 0) return ACTIVE_MS

  return SETTLED_MS
}

/** Reads the PR now, then keeps reading it: every 10 s while checks run, every 30–60 s otherwise. */
function refresh($: EngineInterface): Promise<void> {
  if (inFlight) {
    // Something changed while a read runs (a pin, a push): read again after it, and let the caller wait
    // for that read rather than the one already under way.
    queued ??= inFlight.catch(() => undefined).then(() => {
      queued = null
      return refresh($)
    })
    return queued
  }
  inFlight = (async () => {
    timer?.cancel()
    const before = await read($, view)
    const after = await readView($)
    await update($, view, () => after)
    if (before.pr?.number !== after.pr?.number) await update($, isHidden, () => false)
    announce($, before, after)
    suggestFix($, after)
    timer = $.clock.after(nextDelay(after), () => void refresh($))
  })().finally(() => {
    inFlight = null
  })

  return inFlight
}

async function openUrl($: EngineInterface, url: string) {
  const cwd = await $.session.cwd()
  const opened = await run($, ['open', url], cwd)
  if (opened?.exitCode !== 0) await run($, ['xdg-open', url], cwd)
}

function describe(current: View): string {
  if (!current.branch && current.pinned === null) return 'Not on a branch in a git repository.'
  const forge = current.forge ? FORGE_NAMES[current.forge] : 'unknown forge'
  const error = current.error ? `\nLast error: ${current.error}` : ''
  const pr = current.pr
  if (!pr && current.pinned !== null) return `Could not find PR #${current.pinned} on ${forge}.${error}`
  if (!pr) return `No open PR for ${current.branch} on ${forge}.${error}`
  const rows = BADGES.flatMap(badge =>
    pr.checks.filter(check => check.state === badge.state).map(check => `  ${badge.glyph} ${check.name}${check.state === 'failed' && check.url ? `  ${check.url}` : ''}`),
  )

  const pin = current.pinned !== null ? ' (pinned; /pr-status branch to follow the branch again)' : ''
  return [`${forge} PR #${pr.number}${pr.isDraft ? ' (draft)' : ''}: ${pr.title}${pin}`, pr.url, `CI: ${summary(pr.checks)}`, ...rows].join('\n') + error
}

export const register: Register = on => {
  // After each turn the engine proposes its own next prompt; while checks fail, the fix is the better guess.
  on('prompt.suggest', async ($, e, next) => {
    const text = fixSuggestion(await read($, view))
    return next(text ? { ...e, text } : e)
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  on('session.start', async ($, e, next) => {
    // Not awaited: registering makes Claude Code re-describe every command (~0.7 s), which would hold startup.
    // Typed as /pr-status in the terminal; the command file is what the desktop app lists in its menu.
    void $.command.register({
      name: 'pr-status',
      description: "CI status of this branch's pull request, or of any PR you pin",
      argumentHint: '[<pr number>|branch|refresh|show|hide|open]',
    }).catch(() => undefined)
    void refresh($)

    return next(e)
  })

  on('command.run', { command: ['pr-status', 'pr-status:pr-status'] }, async ($, e) => {
    const verb = e.args.trim()
    // `/pr-status 123` (or `#123`) pins that PR; `/pr-status branch` follows the branch's PR again.
    const asked = /^#?(\d+)$/.exec(verb)
    if (asked || verb === 'branch') {
      await update($, pinnedPr, () => (asked ? Number(asked[1]) : null))
      await update($, isHidden, () => false)
      await refresh($)
      return { text: describe(await read($, view)) }
    }
    if (verb === 'hide' || verb === 'show') {
      await update($, isHidden, () => verb === 'hide')
      return { text: `Band ${verb === 'hide' ? 'hidden until the next PR' : 'shown'}.` }
    }
    if (verb === 'open') {
      const pr = (await read($, view)).pr
      if (pr) await openUrl($, pr.url)
      return { text: pr ? `Opened ${pr.url}` : 'No PR to open.' }
    }
    await refresh($)

    return { text: describe(await read($, view)) }
  })

  // A push or a new PR: look now, and again while the forge catches up.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    if (PR_ACTIVITY.test(e.command)) {
      void refresh($)
      $.clock.after(5_000, () => void refresh($))
    }

    return result
  })

  // The session moved to another worktree.
  on('tool.call', { tool: 'EnterWorktree' }, async ($, e, next) => {
    const result = await next(e)
    void refresh($)
    return result
  })

  on('tool.call', { tool: 'ExitWorktree' }, async ($, e, next) => {
    const result = await next(e)
    void refresh($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, view)
    const pr = current.pr
    if (!pr || e.props.hasSurvey || (await read($, isHidden))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const counts = tally(pr.checks)
    const failed = pr.checks.filter(check => check.state === 'failed')
    const below = await next(e)
    const room = Math.max(10, e.props.bodyColumns - 40)
    const title = pr.title.length > room ? `${pr.title.slice(0, room - 1)}…` : pr.title

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color="suggestion" bold>{`PR #${pr.number}`}</Text>
          {current.pinned !== null && <Text dimColor>pinned</Text>}
          {pr.isDraft && <Text dimColor>draft</Text>}
          {pr.checks.length === 0 && <Text dimColor>no checks yet</Text>}
          {BADGES.filter(badge => counts[badge.state] > 0).map(badge => (
            <Text color={badge.color}>{`${badge.glyph} ${counts[badge.state]} ${badge.label}`}</Text>
          ))}
          <Text dimColor wrap="truncate">{title}</Text>
          <Button key="open" label="Open" onPress={() => openUrl($, pr.url)} />
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
        {failed.length > 0 && (
          <Text color="error" wrap="truncate">{`  failing: ${failed.map(check => check.name).join(', ')}`}</Text>
        )}
        {below}
      </Box>
    )
  })
}
