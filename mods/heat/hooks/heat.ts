import type { Heat } from '../types'

export const MAX_HEAT = 100
/** Milliseconds of idle time per point of heat lost. */
export const DECAY_MS = 30_000
const BASE_BUMP = 2
const TOOL_BUMP = 1
const TOOL_PENALTY = 3
/** Below this heat no fire is lit. */
export const COLD = 15

/** Heat after idle decay: one point per 30 seconds since it was last written. */
export function heatNow(state: Heat, now: number): number {
  const lost = Math.floor(Math.max(0, now - state.at) / DECAY_MS)
  return Math.max(0, state.heat - lost)
}

function clamp(heat: number): number {
  return Math.max(0, Math.min(MAX_HEAT, heat))
}

/**
 * A prompt's bump: a base, a bonus for a longer prompt, and a bonus for sending it soon after the last
 * write, so rapid-fire prompting heats up fastest (NBA Jam's consecutive baskets).
 */
export function promptBump(state: Heat, promptLength: number, now: number): Heat {
  const elapsed = Math.max(0, now - state.at) / 1000
  const length =
    promptLength >= 1000 ? 6 : promptLength >= 200 ? 5 : promptLength >= 50 ? 4 : promptLength >= 10 ? 2 : 0
  const pace = elapsed < 10 ? 6 : elapsed < 30 ? 3 : elapsed < 60 ? 1 : 0

  return { heat: clamp(heatNow(state, now) + BASE_BUMP + length + pace), at: now }
}

/** A tool call: success warms by one, an error cools by three. */
export function toolBump(state: Heat, isError: boolean, now: number): Heat {
  return { heat: clamp(heatNow(state, now) + (isError ? -TOOL_PENALTY : TOOL_BUMP)), at: now }
}

export const TIERS = [
  { min: 85, label: "🔥🔥🔥 ON FIRE! 🔥🔥🔥", color: '#FF4D2E', isBold: true },
  { min: 65, label: '🔥🔥 heating up', color: '#FF7A2E', isBold: true },
  { min: 40, label: '🔥 warm', color: '#FFB43C', isBold: false },
  { min: 15, label: '· lukewarm', color: '#C9A227', isBold: false },
  { min: 0, label: 'ice cold', color: '#5C8DB8', isBold: false },
] as const

export function tierOf(heat: number) {
  return TIERS.find(tier => heat >= tier.min) ?? TIERS[TIERS.length - 1]!
}
