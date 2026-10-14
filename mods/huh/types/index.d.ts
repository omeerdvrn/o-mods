/** The answer in the reader: as Claude wrote it, and rewritten for reading once that arrives. */
export type Reading = {
  title: string
  original: string
  readable: string | null
  state: 'rewriting' | 'ready' | 'failed'
  /** Why there is no readable version, when that failed. */
  problem: string | null
}

/** The answer typeset as a page, in picture strips: which text and page they show, and their sizes. */
export type Typeset = { key: string; strips: string[]; heights: number[]; width: number }

/** Which version the sidebar shows. */
export type Version = 'readable' | 'original'

declare module 'claude-code' {
  interface PluginState {
    huh: {
      reading: Reading | null
      version: Version
      /** Light page, dark page, or the terminal's own colors. */
      page: 'light' | 'dark' | 'terminal'
      typeset: Typeset | null
    }
  }
}
