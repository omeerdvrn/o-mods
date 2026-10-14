export type Limit = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

export type GitPlace = {
  branch: string
  /** The worktree's folder name when the session is in a linked worktree; absent in the main checkout. */
  worktree?: string
  staged: number
  modified: number
  untracked: number
  ahead: number
  behind: number
}

/** Whether the limit bars show what you've used or what's left. */
export type Show = 'used' | 'remaining'

export type Snapshot = {
  model: string
  contextPercent: number | null
  costUsd: number | null
  git: GitPlace | null
}

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': {
      limits: Limit[]
      snapshot: Snapshot | null
      git: GitPlace | null
      folder: string
      now: number
      show: Show
    }
  }
}
