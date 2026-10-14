import { hex, mix, noise, wrap } from '../engine'
import type { Activity, Canvas, Scene } from '../engine'

const SPACE = hex('#05030f')
const STAR = [hex('#ffffff'), hex('#bfe6ff'), hex('#ffe3b3')]
const HULL = hex('#c9d2e3')
const HULL_DARK = hex('#7d88a3')
const COCKPIT = hex('#5fd7ff')
const STRIPE = hex('#ff5f7a')
const FLAME = [hex('#fff6c2'), hex('#ffc24a'), hex('#ff6a2a'), hex('#c2236a')]

/** Space flight: warp stars stream past, a ringed planet slides by, and the engine burns hotter the longer it runs. */
export const spaceFlight: Scene = {
  id: 'space-flight',
  name: 'Space flight',
  draw(canvas: Canvas, phase: number, act: Activity) {
    const { width, height } = canvas
    canvas.fill(0, 0, width, height, SPACE)
    const cx = width * 0.55
    const cy = height / 2

    // A ringed planet drifting across over the turn (a minute a pass).
    const pass = wrap(act.elapsedMs / 60_000 + 0.3)
    const px = width * 1.1 - pass * width * 1.3
    const radius = height * 0.42
    canvas.disc(px, cy + 2, radius, (x, y) => {
      const band = Math.floor((y - (cy + 2 - radius)) / 2) % 3
      const light = (px - x) / radius
      return mix([hex('#8a4fd1'), hex('#b07ae8'), hex('#6a3aa8')][band]!, hex('#1a0d33'), Math.max(0, -light) * 0.7)
    })
    for (let x = -radius * 1.7; x <= radius * 1.7; x++) canvas.put(px + x, cy + 2 + x * 0.18, hex('#e0c98a'))

    // Warp: stars stream out from the centre, longer the faster they go.
    const warp = Math.min(1, 0.4 + act.elapsedMs / 40_000)
    for (let index = 0; index < Math.round(width * 0.9); index++) {
      const angle = noise(index * 3 + 1) * Math.PI * 2
      const depth = wrap(noise(index * 3 + 2) + phase * (1 + Math.floor(noise(index * 3 + 3) * 2)))
      const distance = depth * depth * width * 0.7
      const trail = Math.max(1, depth * 6 * warp)
      const color = STAR[index % 3]!
      for (let step = 0; step < trail; step++) {
        const d = distance - step
        if (d < 1) break
        canvas.put(cx + Math.cos(angle) * d, cy + Math.sin(angle) * d * 0.5, step === 0 ? color : mix(color, SPACE, step / trail))
      }
    }

    // The ship, from behind-left, and its engine: hotter and longer as the turn goes on.
    const ship = [
      '....hhh.....',
      '..hhhcchh...',
      'shhhhhhhhhh.',
      '..hddddddd..',
      '....ddd.....',
    ]
    const shipX = Math.round(cx - 6)
    const shipY = Math.round(cy - 2 + Math.sin(phase * Math.PI * 4) * 0.6)
    canvas.sprite(ship, { h: HULL, d: HULL_DARK, c: COCKPIT, s: STRIPE }, shipX, shipY)
    const burn = Math.min(1, act.elapsedMs / 45_000)
    const flame = 3 + Math.round(burn * 9)
    for (let step = 0; step < flame; step++) {
      const flicker = noise(Math.floor(phase * 40) * 7 + step) < 0.25 ? 1 : 0
      const color = FLAME[Math.min(FLAME.length - 1, Math.floor((step / flame) * FLAME.length) + flicker)]!
      canvas.put(shipX - 1 - step, shipY + 2, color)
      if (step < flame * 0.6) canvas.put(shipX - 1 - step, shipY + 3, mix(color, SPACE, 0.4))
    }
  },
}
