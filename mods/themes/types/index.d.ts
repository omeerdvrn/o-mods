/** A theme's slug, as themes/<slug>.json names it. */
export type ThemeSlug = string

declare module 'claude-code' {
  interface PluginState {
    'themes': {
      /** This session's theme slug; null when the switcher is off. */
      current: ThemeSlug | null
    }
  }
}
