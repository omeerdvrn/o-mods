import { hex, mix, noise, ramp, wrap } from '../engine'
import type { Activity, Canvas, Scene, Stops } from '../engine'

const SKY: Stops = [[0, '#2a1650'], [0.45, '#8a2f6a'], [0.8, '#ff7a4a'], [1, '#ffc46a']]
const SUN: Stops = [[0, '#fff3b0'], [1, '#ff9a3a']]
const SEA = hex('#1a2a5a')
const SEA_DARK = hex('#101a3e')
const WAVE = hex('#3a5a9a')
const SHIMMER = [hex('#ffd36a'), hex('#ff9a4a'), hex('#ff6a5a')]
const CLOUD = hex('#ff9a8a')
const SAIL = hex('#fff2e0')
const HULL = hex('#2a1420')
const BIRD = hex('#2a1430')

/** An ocean sunset: waves rolling in, the sun's reflection shimmering, gulls, and a sailboat crossing over the turn. */
export const oceanSunset: Scene = {
  id: 'ocean-sunset',
  name: 'Ocean sunset',
  draw(canvas: Canvas, phase: number, act: Activity) {
    const { width, height } = canvas
    const horizon = Math.round(height * 0.5)
    canvas.gradient(0, horizon, SKY, 10)

    // Clouds drifting slowly, the sun on the horizon.
    for (let index = 0; index < 3; index++) {
      const x = wrap(noise(index * 4 + 1) + (act.elapsedMs / 1000) * 0.01 * (index + 1)) * (width + 30) - 15
      const y = horizon * (0.2 + index * 0.18)
      const length = 10 + noise(index * 4 + 2) * 16
      canvas.fill(x, y, x + length, y + 1, mix(CLOUD, hex('#5a2a6a'), index * 0.2))
      canvas.fill(x + 3, y - 1, x + length - 4, y, mix(CLOUD, hex('#ffffff'), 0.2))
    }
    const sunX = width * 0.5
    const sunR = Math.max(3, horizon * 0.55)
    canvas.disc(sunX, horizon, sunR, (x, y) => (y < horizon ? ramp(SUN, (y - (horizon - sunR)) / sunR, 6) : null))

    // Gulls.
    for (let index = 0; index < 3; index++) {
      const x = wrap(noise(index + 7) + (act.elapsedMs / 1000) * 0.05) * width
      const y = horizon * (0.25 + noise(index + 9) * 0.4)
      const flap = Math.floor(phase * 8 + index) % 2
      canvas.put(x - 1, y - flap, BIRD)
      canvas.put(x, y, BIRD)
      canvas.put(x + 1, y - flap, BIRD)
    }

    // The sea: rows of waves rolling toward you, the sun's reflection breaking on them.
    for (let y = horizon; y < height; y++) {
      const depth = (y - horizon) / (height - horizon)
      canvas.fill(0, y, width, y + 1, mix(SEA_DARK, SEA, depth))
      const spacing = 4 + depth * 10
      for (let x = 0; x < width; x++) {
        const crest = wrap(x / spacing / 3 + Math.sin(y * 1.7) + phase * (1 + Math.floor(depth * 2)))
        if (crest < 0.18) canvas.put(x, y, WAVE)
      }
      const spread = sunR * (0.6 + depth * 1.2)
      for (let x = sunX - spread; x < sunX + spread; x++) {
        if (noise(Math.floor(x) * 31 + y * 7 + Math.floor(phase * 10)) < 0.35) canvas.put(x, y, SHIMMER[(y + Math.floor(x)) % 3]!)
      }
    }

    // A sailboat crossing over the turn: about a minute a crossing, rocking on the swell.
    const across = wrap(act.elapsedMs / 60_000 + 0.15)
    const boatX = across * (width + 16) - 12
    const rock = Math.round(Math.sin(phase * Math.PI * 2))
    canvas.sprite(['....s....', '...ss....', '..sss....', '.ssss.s..', '...m..ss.', 'hhhhhhhhh', '.hhhhhhh.'], { s: SAIL, m: HULL, h: HULL }, boatX, horizon + 1 + rock - 5)
  },
}
