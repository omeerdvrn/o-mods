/** A pasted image's preview: its tag's number and the small copy saved from the clipboard. */
export type Thumb = { number: number; file: string; width: number; height: number }

declare module 'claude-code' {
  interface PluginState {
    'snippets': {
      thumbs: Thumb[]
    }
  }
}
