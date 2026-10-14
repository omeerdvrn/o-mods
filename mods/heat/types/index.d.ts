export type Heat = {
  /** 0 to 100, as last written; read it through the decay with `heatNow`. */
  heat: number
  /** Milliseconds since the epoch when `heat` was written. */
  at: number
}

export type Burst = {
  /** Heat the burst was lit at. */
  heat: number
  startedAt: number
  seed: number
  /** The style it was lit in; a burst keeps it even if /heat style changes mid-burn. */
  style: FireStyle
}

/** `flame`: the solid fire. `classic`: the original v1 particle burst. */
export type FireStyle = 'flame' | 'classic'

declare module 'claude-code' {
  interface PluginState {
    'heat': {
      heat: Heat
      burst: Burst | null
      isOn: boolean
      now: number
      style: FireStyle
    }
  }
}
