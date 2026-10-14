import { hex, mix, noise, ramp, wrap } from '../engine'
import type { Activity, Canvas, Scene, Stops } from '../engine'

const TREE = hex('#0a1410')
const TREE_FAR = hex('#122119')
const GROUND = hex('#1a140f')
const LOG = hex('#5a3418')
const LOG_END = hex('#8a5a2e')
const STAR = hex('#d8e6ff')
const FIRE: Stops = [[0, '#fff3b0'], [0.3, '#ffc845'], [0.6, '#ff7a2a'], [0.85, '#d6322a'], [1, '#6a1a1a']]
const SPARK = hex('#ffd36a')

/** A campfire in the woods: it grows as the turn goes on, and throws a shower of sparks when tests pass. */
export const campfire: Scene = {
  id: 'campfire',
  name: 'Campfire',
  draw(canvas: Canvas, phase: number, act: Activity) {
    const { width, height } = canvas
    canvas.gradient(0, height, [[0, '#050814'], [0.7, '#0e1430'], [1, '#1a1a3a']], 8)
    for (let index = 0; index < Math.round(width / 3); index++) {
      if (wrap(phase + noise(index * 2 + 1)) < 0.8) canvas.put(noise(index * 2 + 2) * width, noise(index * 2 + 3) * height * 0.5, STAR)
    }
    canvas.disc(width * 0.85, height * 0.2, 2.2, hex('#f2efd8'))

    // Two rows of pines.
    for (const [far, color] of [[true, TREE_FAR], [false, TREE]] as const) {
      for (let index = 0; index < Math.round(width / (far ? 5 : 8)); index++) {
        const x = noise(index * 9 + (far ? 1 : 2)) * width
        if (!far && Math.abs(x - width / 2) < width * 0.12) continue
        const tall = height * (far ? 0.35 : 0.55) * (0.7 + noise(index * 9 + 3) * 0.5)
        const base = height - 3
        for (let step = 0; step < tall; step++) {
          const half = ((tall - step) / tall) * (far ? 2.2 : 3.2)
          canvas.fill(x - half, base - step, x + half + 1, base - step + 1, color)
        }
      }
    }
    canvas.fill(0, height - 3, width, height, GROUND)

    // The fire: bigger the longer Claude works, flickering tongues of flame.
    const cx = width / 2
    const grow = Math.min(1, 0.35 + act.elapsedMs / 50_000)
    const tall = Math.round((height - 4) * grow)
    const halfBase = 2 + grow * 4
    const glow = halfBase * 3
    canvas.disc(cx, height - 3, glow, (x, y) => mix(canvas.get(x, y), hex('#ff7a2a'), 0.18 * (1 - Math.hypot(x - cx, y - height + 3) / glow)))
    for (let column = -Math.ceil(halfBase); column <= Math.ceil(halfBase); column++) {
      const edge = 1 - Math.abs(column) / (halfBase + 1)
      const flicker = noise(Math.floor(phase * 30) * 13 + column * 7)
      const flame = Math.round(tall * edge * (0.6 + flicker * 0.5))
      for (let step = 0; step < flame; step++) {
        canvas.put(cx + column + Math.sin(phase * Math.PI * 4 + step * 0.7) * (step / tall), height - 4 - step, ramp(FIRE, step / Math.max(1, flame) * 0.9 + (1 - edge) * 0.2, 8))
      }
    }
    canvas.sprite(['eLLLLLLLLe', '.eLLLLLLe.'], { L: LOG, e: LOG_END }, cx - 5, height - 4)

    // Sparks rising; a shower of them for a few seconds after tests pass.
    const cheer = act.bursts.some(burst => burst.kind === 'tests-pass' && act.now - burst.at < 4000)
    const sparks = cheer ? 26 : 6
    for (let index = 0; index < sparks; index++) {
      const rise = wrap(phase * (1 + Math.floor(noise(index) * 2)) + noise(index + 50))
      const x = cx + (noise(index + 90) - 0.5) * (cheer ? width * 0.3 : 6) * rise + Math.sin(rise * 9 + index) * 1.2
      canvas.put(x, height - 4 - tall * 0.6 - rise * height, mix(SPARK, hex('#ff5a2a'), rise))
    }
  },
}
