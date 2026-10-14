import { expect, mock, test } from 'claude-code/testing'

import { fixSuggestion } from '../hooks/register'
import { forgeFromProbe, fromAzure, fromBitbucket, fromGhView, fromGitlab, knownForge, parseRemote, sshHostname, tally, teaChecks } from '../hooks/forges'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160 } } as const

test('remotes of every shape read to host and path', async () => {
  expect(parseRemote('git@github.com-work:acme/webapp-1-5')).toEqual({ host: 'github.com-work', path: 'acme/webapp-1-5', isSsh: true })
  expect(parseRemote('ssh://git@git.example.com:2222/acme/webapp.git')).toEqual({ host: 'git.example.com', path: 'acme/webapp', isSsh: true })
  expect(parseRemote('https://gitlab.com/group/sub/repo.git')).toEqual({ host: 'gitlab.com', path: 'group/sub/repo', isSsh: false })
  expect(parseRemote('git@ssh.dev.azure.com:v3/acme/Shop/web')?.path).toBe('acme/Shop/web')
  expect(parseRemote('https://acme@dev.azure.com/acme/Shop/_git/web')?.path).toBe('acme/Shop/web')
  expect(parseRemote('https://acme.visualstudio.com/Shop/_git/web')).toEqual({ host: 'dev.azure.com', path: 'acme/Shop/web', isSsh: false })
  expect(sshHostname('user git\nhostname github.com\nport 22\n')).toBe('github.com')
})

test('hosts name their forge, known or probed', async () => {
  expect(knownForge('github.com')).toBe('github')
  expect(knownForge('gitlab.com')).toBe('gitlab')
  expect(knownForge('bitbucket.org')).toBe('bitbucket')
  expect(knownForge('dev.azure.com')).toBe('azure')
  expect(knownForge('codeberg.org')).toBe('gitea')
  expect(knownForge('git.example.com')).toBeUndefined()
  const html = { status: 404, text: '<html>' }
  expect(forgeFromProbe({ gitea: { status: 403, text: '{"message":"Only signed in user is allowed to call APIs."}' }, gitlab: html, github: html })).toBe('gitea')
  expect(forgeFromProbe({ gitea: html, gitlab: { status: 401, text: '{"message":"401 Unauthorized"}' }, github: html })).toBe('gitlab')
  expect(forgeFromProbe({ gitea: html, gitlab: html, github: { status: 200, text: '{"verifiable_password_authentication":true}' } })).toBe('github')
  expect(forgeFromProbe({ gitea: html, gitlab: html, github: html })).toBeUndefined()
})

test('each forge answer counts passed, running, queued and failed checks', async () => {
  const gh = fromGhView(
    JSON.stringify({
      number: 27,
      title: 'Bump deps',
      url: 'https://github.com/o/r/pull/27',
      state: 'OPEN',
      isDraft: false,
      statusCheckRollup: [
        { __typename: 'CheckRun', name: 'Lint', workflowName: 'PR', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { __typename: 'CheckRun', name: 'Tests', workflowName: 'PR', status: 'COMPLETED', conclusion: 'FAILURE' },
        { __typename: 'CheckRun', name: 'Build', workflowName: 'PR', status: 'IN_PROGRESS', conclusion: '' },
        { __typename: 'CheckRun', name: 'Deploy', workflowName: 'PR', status: 'QUEUED', conclusion: '' },
        { __typename: 'StatusContext', context: 'ci/legacy', state: 'PENDING' },
      ],
    }),
  )!
  expect(tally(gh.checks)).toMatchObject({ passed: 1, failed: 1, running: 2, queued: 1 })
  expect(fromGhView(JSON.stringify({ number: 1, title: '', url: '', state: 'MERGED', isDraft: false }))).toBeNull()

  const tea = teaChecks('842 ✓ CI / lint (pull_request), ⏳ CI / unit (pull_request), ❌ CI / integration (pull_request), ⚠ Linear / status (push)\n841 ✓ CI / lint (pull_request)', 842)!
  expect(tally(tea)).toMatchObject({ passed: 1, running: 1, failed: 1, warning: 1 })
  expect(tea[2]?.name).toBe('CI / integration (pull_request)')
  expect(teaChecks('841 ✓ a', 9)).toBeUndefined()
  // A check that has not started prints with no symbol; it must not swallow the checks after it.
  const bare = teaChecks('1142 ⏳ Linear / status (push), CI / typecheck (pull_request), CI / lint (pull_request)', 1142)!
  expect(bare.map(check => check.name)).toEqual(['Linear / status (push)', 'CI / typecheck (pull_request)', 'CI / lint (pull_request)'])
  expect(bare.map(check => check.state)).toEqual(['running', 'queued', 'queued'])

  const gl = fromGitlab({ iid: 4, title: 'MR', web_url: 'u' }, [
    { name: 'lint', stage: 'test', status: 'success' },
    { name: 'e2e', stage: 'test', status: 'failed', allow_failure: true },
    { name: 'unit', stage: 'test', status: 'running' },
    { name: 'deploy', stage: 'deploy', status: 'manual' },
    { name: 'build', stage: 'build', status: 'pending' },
  ])
  expect(tally(gl.checks)).toMatchObject({ passed: 1, warning: 1, running: 1, skipped: 1, queued: 1 })

  const bb = fromBitbucket({ id: 9, title: 'PR' }, { values: [{ key: 'a', state: 'SUCCESSFUL' }, { key: 'b', state: 'INPROGRESS' }, { key: 'c', state: 'FAILED' }] })
  expect(tally(bb.checks)).toMatchObject({ passed: 1, running: 1, failed: 1 })

  const az = fromAzure(
    { pullRequestId: 3, title: 'PR' },
    'u',
    {
      value: [
        { definition: { name: 'ci' }, status: 'completed', result: 'failed', queueTime: '2026-10-08T10:00:00Z' },
        { definition: { name: 'ci' }, status: 'inProgress', queueTime: '2026-10-08T11:00:00Z' },
      ],
    },
    { value: [{ context: { genre: 'sonar', name: 'gate' }, state: 'succeeded' }] },
  )
  // The re-run replaces the failed run it repeats.
  expect(tally(az.checks)).toMatchObject({ running: 1, passed: 1, failed: 0 })
})

type Ran = { exitCode: number; stdout: string; stderr?: string }

function answer(out: Ran) {
  return { value: { exitCode: out.exitCode, stdout: out.stdout, stderr: out.stderr ?? '', isStdoutTruncated: false, isStderrTruncated: false } } as never
}

function gitFor(remote: string, branch: string) {
  return (argv: readonly string[]): Ran | undefined => {
    const args = argv.slice(1).join(' ')
    if (args === 'symbolic-ref --short -q HEAD') return { exitCode: 0, stdout: `${branch}\n` }
    if (args.startsWith('config branch.')) return args.endsWith('.remote') ? { exitCode: 0, stdout: 'origin\n' } : { exitCode: 0, stdout: `refs/heads/${branch}\n` }
    if (args === 'remote get-url origin') return { exitCode: 0, stdout: `${remote}\n` }
    return undefined
  }
}

test('a GitHub PR behind an SSH alias shows its checks above the prompt', async ($, on) => {
  const git = gitFor('git@github.com-work:acme/shop.git', 'feature/cart')
  const rollup = [
    { __typename: 'CheckRun', name: 'Lint', workflowName: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', name: 'Tests', workflowName: 'CI', status: 'COMPLETED', conclusion: 'FAILURE' },
    { __typename: 'CheckRun', name: 'Build', workflowName: 'CI', status: 'IN_PROGRESS', conclusion: '' },
  ]
  let ghArgs: readonly string[] = []
  mock.clock(on)
  mock.store(on)
  mock.env(on, {})
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  on('process.run', async (_$, e) => {
    const [program] = e.argv
    if (program === 'git') return answer(git(e.argv) ?? { exitCode: 1, stdout: '' })
    if (program === 'ssh') return answer({ exitCode: 0, stdout: 'hostname github.com\n' })
    if (program === 'gh') {
      ghArgs = e.argv
      return answer({ exitCode: 0, stdout: JSON.stringify({ number: 12, title: 'Add cart', url: 'https://github.com/acme/shop/pull/12', state: 'OPEN', isDraft: false, statusCheckRollup: rollup }) })
    }
    return answer({ exitCode: 1, stdout: '' })
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const status = await $.command.run({ command: 'pr-status', args: '' } as never)
  expect(JSON.stringify(status)).toContain('GitHub PR #12')
  expect(ghArgs).toEqual(['gh', 'pr', 'view', 'feature/cart', '--repo', 'acme/shop', '--json', 'number,title,url,state,isDraft,statusCheckRollup'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pr-status', surface, ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /^PR #12$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 passed/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 running/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 failed/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /failing: CI \/ Tests/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a Gitea host is detected through tea and read without a token', async ($, on) => {
  const git = gitFor('ssh://git@vcs.example.com:2222/team/app.git', 'feature/x')
  mock.clock(on)
  mock.store(on)
  mock.env(on, {})
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  on('process.run', async (_$, e) => {
    const [program, ...rest] = e.argv
    const args = rest.join(' ')
    if (program === 'git') return answer(git(e.argv) ?? { exitCode: 1, stdout: '' })
    if (program === 'ssh') return answer({ exitCode: 0, stdout: 'hostname vcs.example.com\n' })
    if (program === 'tea' && args.startsWith('login list')) return answer({ exitCode: 0, stdout: '[{"name":"vcs","url":"https://vcs.example.com"}]' })
    if (program === 'tea' && args.includes('--output json'))
      return answer({ exitCode: 0, stdout: JSON.stringify([{ index: '7', title: 'Feature X', head: 'feature/x', url: 'https://vcs.example.com/team/app/pulls/7' }]) })
    if (program === 'tea' && args.includes('--output simple')) return answer({ exitCode: 0, stdout: '7 ✓ CI / lint (pull_request), ⏳ CI / unit (pull_request)\n' })
    return answer({ exitCode: 1, stdout: '' })
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const status = JSON.stringify(await $.command.run({ command: 'pr-status', args: '' } as never))
  expect(status).toContain('Gitea PR #7')
  expect(status).toContain('1 running, 1 passed')

  const ui = await $.ui.mount({ plugin: 'pr-status', surface: 'desktop', ...BAND } as never)
  expect(await ui.find({ type: 'Text', text: /^PR #7$/ })).toBeDefined()
  await ui.unmount()
})

test('no band while the branch has no open PR', async ($, on) => {
  const git = gitFor('git@github.com:acme/shop.git', 'main')
  mock.clock(on)
  mock.store(on)
  mock.env(on, {})
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  on('process.run', async (_$, e) => {
    if (e.argv[0] === 'git') return answer(git(e.argv) ?? { exitCode: 1, stdout: '' })
    if (e.argv[0] === 'gh') return answer({ exitCode: 1, stdout: '', stderr: 'no pull requests found for branch "main"' })
    return answer({ exitCode: 1, stdout: '' })
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(JSON.stringify(await $.command.run({ command: 'pr-status', args: '' } as never))).toContain('No open PR for main on GitHub')
  const ui = await $.ui.mount({ plugin: 'pr-status', surface: 'terminal', ...BAND } as never)
  expect(await ui.find({ type: 'Text', text: /^PR #/ })).toBeUndefined()
  await ui.unmount()
})

test('/pr-status <number> pins that PR, and /pr-status branch follows the branch again', async ($, on) => {
  const git = gitFor('git@github.com:acme/shop.git', 'feature/cart')
  const asked: string[] = []
  mock.clock(on)
  mock.store(on)
  mock.env(on, {})
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  on('process.run', async (_$, e) => {
    const [program] = e.argv
    if (program === 'git') return answer(git(e.argv) ?? { exitCode: 1, stdout: '' })
    if (program === 'gh') {
      const which = e.argv[3] ?? ''
      asked.push(which)
      const number = which === '987' ? 987 : 12
      const rollup = [{ __typename: 'CheckRun', name: 'Tests', workflowName: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }]
      return answer({
        exitCode: 0,
        stdout: JSON.stringify({ number, title: `PR ${number}`, url: `https://github.com/acme/shop/pull/${number}`, state: 'OPEN', isDraft: false, statusCheckRollup: rollup }),
      })
    }
    return answer({ exitCode: 1, stdout: '' })
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const pinned = JSON.stringify(await $.command.run({ command: 'pr-status', args: '#987' } as never))
  expect(pinned).toContain('GitHub PR #987')
  expect(pinned).toContain('pinned')
  expect(asked.at(-1)).toBe('987')
  const ui = await $.ui.mount({ plugin: 'pr-status', surface: 'terminal', ...BAND } as never)
  expect(await ui.find({ type: 'Text', text: /^PR #987$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^pinned$/ })).toBeDefined()
  await ui.unmount()

  const back = JSON.stringify(await $.command.run({ command: 'pr-status', args: 'branch' } as never))
  expect(back).toContain('GitHub PR #12')
  expect(back).not.toContain('pinned')
  expect(asked.at(-1)).toBe('feature/cart')
})

test('a tea call that times out is a failed call, not a missing tea', async ($, on) => {
  const git = gitFor('ssh://git@vcs.example.com:2222/team/app.git', 'feature/x')
  mock.clock(on)
  mock.store(on)
  mock.env(on, {})
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  let slow = 0
  on('process.run', async (_$, e) => {
    const [program, ...rest] = e.argv
    const args = rest.join(' ')
    if (program === 'git') return answer(git(e.argv) ?? { exitCode: 1, stdout: '' })
    if (program === 'ssh') return answer({ exitCode: 0, stdout: 'hostname vcs.example.com\n' })
    if (program === 'tea' && args.startsWith('login list')) return answer({ exitCode: 0, stdout: '[{"name":"vcs","url":"https://vcs.example.com"}]' })
    if (program === 'tea' && args.includes('--output json'))
      return answer({ exitCode: 0, stdout: JSON.stringify([{ index: '7', title: 'Feature X', head: 'feature/x', url: 'https://vcs.example.com/team/app/pulls/7' }]) })
    // The CI row times out the first time it is asked for.
    if (program === 'tea' && args.includes('--output simple')) {
      slow += 1
      if (slow === 1) return { deny: 'timed out after 20000 ms' } as never
      return answer({ exitCode: 0, stdout: '7 ✓ CI / lint (pull_request)\n' })
    }
    return answer({ exitCode: 1, stdout: '' })
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(JSON.stringify(await $.command.run({ command: 'pr-status', args: '' } as never))).toContain('Gitea PR #7')
  // Still read through tea afterwards: no fall back to the API without a token.
  const again = JSON.stringify(await $.command.run({ command: 'pr-status', args: '' } as never))
  expect(again).toContain('Gitea PR #7')
  expect(again).toContain('1 passed')
  expect(again).not.toContain('403')
})

test('failing checks become the input bar suggestion: fix them', async ($, on) => {
  const pr = (states: string[]) => ({
    branch: 'feature/x', forge: 'gitea', pinned: null, error: null, checkedAt: 1,
    pr: { forge: 'gitea', number: 1142, title: 'x', url: 'u', isDraft: false, checks: states.map((state, index) => ({ name: `CI / step${index} (pull_request)`, state })) },
  }) as never
  expect(fixSuggestion(pr(['passed', 'failed']))).toBe('Fix the failing `CI / step1` check on PR #1142.')
  expect(fixSuggestion(pr(['failed', 'failed', 'failed', 'passed']))).toBe('Fix the failing `CI / step0`, `CI / step1` and 1 more checks on PR #1142.')
  expect(fixSuggestion(pr(['passed', 'running']))).toBeNull()

  // In a session: the PR's failing check is suggested once, and replaces the engine's own guess after a turn.
  const git = gitFor('ssh://git@vcs.example.com:2222/team/app.git', 'feature/x')
  mock.clock(on)
  mock.store(on)
  mock.env(on, {})
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  const shown: string[] = []
  on('prompt.suggest', async (_$, e) => {
    shown.push(e.text)
    return { isShown: true } as never
  })
  on('process.run', async (_$, e) => {
    const [program, ...rest] = e.argv
    const args = rest.join(' ')
    if (program === 'git') return answer(git(e.argv) ?? { exitCode: 1, stdout: '' })
    if (program === 'ssh') return answer({ exitCode: 0, stdout: 'hostname vcs.example.com\n' })
    if (program === 'tea' && args.startsWith('login list')) return answer({ exitCode: 0, stdout: '[{"name":"vcs","url":"https://vcs.example.com"}]' })
    if (program === 'tea' && args.includes('--output json'))
      return answer({ exitCode: 0, stdout: JSON.stringify([{ index: '7', title: 'Feature X', head: 'feature/x', url: 'https://vcs.example.com/team/app/pulls/7' }]) })
    if (program === 'tea' && args.includes('--output simple')) return answer({ exitCode: 0, stdout: '7 ✓ CI / lint (pull_request), ❌ CI / unit (pull_request)\n' })
    return answer({ exitCode: 1, stdout: '' })
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'pr-status', args: '' } as never)
  expect(shown).toContain('Fix the failing `CI / unit` check on PR #7.')
  await $.prompt.suggest({ text: 'run the linter', origin: { kind: 'engine' } } as never)
  expect(shown.at(-1)).toBe('Fix the failing `CI / unit` check on PR #7.')
})
