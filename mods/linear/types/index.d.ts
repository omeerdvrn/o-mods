export type LinearIssue = {
  id: string
  title: string
  description: string
  estimate: string | null
  priority: string | null
  status: string
  statusType: string
  project: string | null
  team: string | null
  url: string
  branch: string | null
  labels: string[]
  dueDate: string | null
}

export type IssueFilter = 'all' | 'started' | 'review' | 'todo' | 'done'

export type StartState = {
  phase: 'working' | 'started' | 'error'
  message: string
  worktree?: string
}

declare module 'claude-code' {
  interface PluginState {
    'linear': {
      issues: LinearIssue[]
      done: LinearIssue[]
      isLoading: boolean
      error: string | null
      fetchedAt: number | null
      expanded: Record<string, boolean>
      fullDescriptions: Record<string, string>
      starts: Record<string, StartState>
      filter: IssueFilter
      selected: string | null
      isConnecting: boolean
    }
  }
}
