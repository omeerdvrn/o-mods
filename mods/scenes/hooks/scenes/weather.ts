import { hex, mix, noise, wrap } from '../engine'
import type { Activity, Canvas, Scene } from '../engine'

const HILL = hex('#2f6a3a')
const HILL_FAR = hex('#3f7a55')
const HOUSE = hex('#c9a27a')
const ROOF = hex('#8a3a2a')
const WINDOW = hex('#ffd36a')
const DOOR = hex('#5a3420')
const CLOUD = hex('#e8eef8')
const STORM = hex('#5a6278')
const RAIN = hex('#9ab8e8')
const BOLT = hex('#fff6a0')
const SUN = hex('#ffd84a')
const MOON = hex('#eef0d8')
const BIRD = hex('#1a1a2a')

/** How the sky looks for the 5-hour limit's usage: clear, cloudy, rain, storm. */
export function weatherOf(percent: number): 'clear' | 'cloudy' | 'rain' | 'storm' {
  if (percent < 40) return 'clear'
  if (percent < 70) return 'cloudy'
  if (percent < 90) return 'rain'
  return 'storm'
}

/** A little village under weather that follows your 5-hour usage: clear, then clouds, rain, and a thunderstorm near the limit. */
export const weather: Scene = {
  id: 'weather',
  name: 'Usage weather',
  isAvailable: act => act.usagePercent !== null,
  draw(canvas: Canvas, phase: number, act: Activity) {
    const { width, height } = canvas
    const sky = weatherOf(act.usagePercent ?? 0)
    const isNight = act.hour < 7 || act.hour >= 20
    const dark = sky === 'storm' ? 0.75 : sky === 'rain' ? 0.5 : sky === 'cloudy' ? 0.25 : 0
    const top = isNight ? '#0a1030' : '#4aa8ff'
    const low = isNight ? '#2a2a5a' : '#bfe6ff'
    for (let y = 0; y < height; y++) canvas.fill(0, y, width, y + 1, mix(mix(hex(top), hex(low), y / height), hex('#2a2e3a'), dark))

    // Lightning lights the whole sky for a moment.
    const flash = sky === 'storm' && wrap(phase * 2) < 0.06
    if (flash) canvas.fill(0, 0, width, height, hex('#c8ccff'))

    if (sky !== 'storm' && sky !== 'rain') {
      if (isNight) canvas.disc(width * 0.8, height * 0.25, 2.5, MOON)
      else canvas.disc(width * 0.8, height * 0.25, 3, SUN)
    }
    if (isNight && sky === 'clear') {
      for (let index = 0; index < width / 4; index++) canvas.put(noise(index) * width, noise(index + 99) * height * 0.5, hex('#ffffff'))
    }

    // Clouds: more and darker as usage climbs.
    const clouds = sky === 'clear' ? 1 : sky === 'cloudy' ? 4 : 7
    for (let index = 0; index < clouds; index++) {
      const x = wrap(noise(index * 3 + 1) + (act.elapsedMs / 1000) * 0.02 * (1 + (index % 3))) * (width + 30) - 15
      const y = height * (0.1 + noise(index * 3 + 2) * 0.25)
      const size = 5 + noise(index * 3 + 3) * 8
      const color = sky === 'clear' || sky === 'cloudy' ? CLOUD : STORM
      canvas.disc(x, y + 1, size * 0.35, color)
      canvas.disc(x + size * 0.4, y, size * 0.45, color)
      canvas.disc(x + size * 0.85, y + 1, size * 0.35, color)
    }

    // Hills, the house with its lit window.
    for (let x = 0; x < width; x++) {
      const far = height * 0.62 + Math.sin(x * 0.07) * 2
      const near = height * 0.75 + Math.sin(x * 0.11 + 2) * 2
      canvas.fill(x, far, x + 1, height, HILL_FAR)
      canvas.fill(x, near, x + 1, height, HILL)
    }
    const hx = Math.round(width * 0.25)
    const hy = Math.round(height * 0.75) - 5
    canvas.sprite(['...rrr...', '..rrrrr..', '.rrrrrrr.', '.hhhhhhh.', '.hwhhhdh.', '.hhhhhdh.'], { r: ROOF, h: HOUSE, w: isNight || dark > 0.3 ? WINDOW : hex('#7ab8e8'), d: DOOR }, hx, hy)

    // Smoke curling from the chimney, grass swaying in the wind.
    for (let puff = 0; puff < 4; puff++) {
      const rise = wrap(phase + puff / 4)
      canvas.put(hx + 6 + Math.sin((rise + puff) * Math.PI * 2) * 1.2 + rise * 3, hy - 1 - rise * 6, mix(hex('#c8c8d0'), hex('#5a6278'), rise))
    }
    for (let tuft = 0; tuft < Math.round(width / 5); tuft++) {
      const x = noise(tuft * 3 + 70) * width
      const base = Math.round(height * 0.75 + Math.sin(x * 0.11 + 2) * 2) + 2
      const sway = Math.sin((phase + noise(tuft)) * Math.PI * 2) > 0 ? 1 : 0
      canvas.put(x, base, hex('#4f9a4a'))
      canvas.put(x + sway, base - 1, hex('#6fc25a'))
    }

    // Birds on a clear day, rain and lightning when it is not.
    if (sky === 'clear' && !isNight) {
      for (let index = 0; index < 3; index++) {
        const x = wrap(noise(index + 5) + (act.elapsedMs / 1000) * 0.06) * width
        const y = height * (0.2 + index * 0.08)
        const flap = Math.floor(phase * 10 + index) % 2
        canvas.put(x - 1, y - flap, BIRD)
        canvas.put(x, y, BIRD)
        canvas.put(x + 1, y - flap, BIRD)
      }
    }
    if (sky === 'rain' || sky === 'storm') {
      for (let index = 0; index < width * (sky === 'storm' ? 0.6 : 0.35); index++) {
        const x = noise(index * 2 + 1) * width
        const y = wrap(noise(index * 2 + 2) + phase * 3) * height
        canvas.put(x - y * 0.2, y, RAIN)
        canvas.put(x - y * 0.2 - 0.2, y + 1, mix(RAIN, hex('#2a2e3a'), 0.5))
      }
    }
    if (flash) {
      let x = width * (0.4 + noise(Math.floor(phase * 2)) * 0.4)
      for (let y = 0; y < height * 0.6; y++) {
        x += noise(y * 13 + Math.floor(phase * 2)) < 0.5 ? -1 : 1
        canvas.put(x, y, BOLT)
      }
    }
  },
}
