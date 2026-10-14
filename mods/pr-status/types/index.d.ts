export type Forge = 'github' | 'gitlab' | 'gitea' | 'bitbucket' | 'azure'

export type CheckState = 'passed' | 'failed' | 'running' | 'queued' | 'warning' | 'skipped' | 'cancelled'

export type Check = {
  name: string
  state: CheckState
  url?: string
}

export type Pr = {
  forge: Forge
  number: number
  title: string
  url: string
  isDraft: boolean
  checks: Check[]
}

export type View = {
  /** The branch the session is on, as last read. */
  branch: string | null
  /** The forge the remote's host runs, once known. */
  forge: Forge | null
  /** The PR number `/pr-status <number>` pinned; null while following the branch. */
  pinned: number | null
  /** The PR shown: the pinned one, or the branch's open PR; null when there is none. */
  pr: Pr | null
  /** Why the last read failed, when it did. */
  error: string | null
  /** Milliseconds since the epoch of the last read. */
  checkedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'pr-status': {
      view: View
      isHidden: boolean
      pinned: number | null
    }
  }
}
