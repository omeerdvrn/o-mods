/** What scanner/scan.py prints: aggregates of every session log on this machine. */
export type Scan = {
  generatedAt: number
  files: number
  parsed: number
  seconds: number
  /** [day, project, model, issue, input, output, cacheWrite, cacheRead, replies] */
  tokens: [string, string, string, string, number, number, number, number, number][]
  /** [day, project, issue, prompts] */
  prompts: [string, string, string, number][]
  /** [day, hour, tokens, prompts] */
  hours: [string, number, number, number][]
  /** [day, project], one per session */
  sessions: [string, string][]
}

/** Linear issues you completed: id, completion day, estimate in points. */
export type Closed = { id: string; day: string; points: number }

export type Range = '7d' | '30d' | 'all'

declare module 'claude-code' {
  interface PluginState {
    'usage-stats': {
      scan: Scan | null
      closed: Closed[] | null
      isScanning: boolean
      error: string | null
      linearError: string | null
      range: Range
    }
  }
}
