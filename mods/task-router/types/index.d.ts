/** One task as the registry script's summary-json gives it, for the sidebar. */
export type Row = {
  task_id: string
  title: string
  status: string
  review: string | null
  plan_ref: string | null
  parent_id: string | null
  mismatch: boolean
  /** Haiku, Sonnet, Opus, Unrouted or Pending (not yet routed). */
  group: string
  model: string | null
  rule: string | null
  elapsed: string
  /** The model id the task's subagent really ran on, when a hook saw it. */
  ran_on: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'task-router': {
      rows: Row[]
    }
  }
}
