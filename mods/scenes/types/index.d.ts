/** A scene's id, as /scenes lists them. */
export type SceneId = string

declare module 'claude-code' {
  interface PluginState {
    'scenes': {
      /** Whether the band is up: while Claude works and a moment after. */
      showing: boolean
      sceneId: SceneId
    }
  }
}
