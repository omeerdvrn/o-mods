import { hex, mix, noise, wrap } from '../engine'
import type { Activity, Canvas, Scene } from '../engine'

const NIGHT = hex('#0a0d24')
const LIGHTS = [hex('#ff5fa2'), hex('#5fd7ff'), hex('#ffcf5f'), hex('#9a7bff'), hex('#ff8a4f')]
const STREAK = hex('#8fb4e8')
const STREAK_DIM = hex('#3a4f80')
const DROP = hex('#cfe3ff')
const FRAME = hex('#1a1426')
const FRAME_EDGE = hex('#2e2440')
const SILL = hex('#3a2c22')

/** A rainy window at night: soft neon city lights behind glass, rain streaking down, drops sliding. */
export const rainyWindow: Scene = {
  id: 'rainy-window',
  name: 'Rainy window',
  draw(canvas: Canvas, phase: number, act: Activity) {
    const { width, height } = canvas
    canvas.gradient(0, height, [[0, '#070a1c'], [0.6, '#10163a'], [1, '#1c1840']], 8)

    // The city behind the glass: dark towers with lit windows.
    for (let x = 0, index = 0; x < width; index++) {
      const wide = 4 + Math.floor(noise(index * 7 + 1) * 8)
      const tall = Math.round(height * (0.3 + noise(index * 7 + 2) * 0.55))
      canvas.fill(x, height - tall, x + wide, height, hex('#0c0f26'))
      for (let wx = x + 1; wx < x + wide - 1; wx += 2) {
        for (let wy = height - tall + 1; wy < height - 1; wy += 2) {
          if (noise(wx * 13 + wy * 7) < 0.22) canvas.put(wx, wy, mix(LIGHTS[(wx + wy) % LIGHTS.length]!, hex('#0c0f26'), 0.45))
        }
      }
      x += wide + 1
    }

    // Bokeh: big soft lights out of focus, breathing.
    for (let index = 0; index < Math.round(width / 6); index++) {
      const x = noise(index * 5 + 1) * width
      const y = height * 0.2 + noise(index * 5 + 2) * height * 0.7
      const color = LIGHTS[Math.floor(noise(index * 5 + 3) * LIGHTS.length)]!
      const breathe = 0.5 + 0.5 * Math.sin((phase + noise(index * 5 + 4)) * Math.PI * 2)
      const radius = 1.5 + noise(index * 5 + 5) * 2
      canvas.disc(x, y, radius, (px, py) => mix(canvas.get(px, py), color, (0.18 + 0.22 * breathe) * (1 - Math.hypot(px - x, py - y) / (radius + 0.5))))
    }

    // Rain on the glass: long slanted streaks, more and faster while tools run.
    const isBusy = act.tool !== 'think'
    const streaks = Math.round(width * (isBusy ? 0.45 : 0.25))
    for (let index = 0; index < streaks; index++) {
      const speed = 1 + Math.floor(noise(index * 3 + 7) * 2) + (isBusy ? 1 : 0)
      const x0 = noise(index * 3 + 8) * (width + height * 0.4)
      const y = wrap(noise(index * 3 + 9) + phase * speed) * (height + 10) - 8
      const length = 4 + Math.floor(noise(index * 3 + 10) * 5)
      for (let step = 0; step < length; step++) {
        canvas.put(x0 - (y + step) * 0.3, y + step, mix(STREAK_DIM, STREAK, step / length))
      }
    }

    // Drops on the glass sliding down, a bright glint on each.
    for (let index = 0; index < Math.round(width / 7); index++) {
      const x = noise(index * 11 + 21) * width
      const slide = wrap(noise(index * 11 + 22) + act.elapsedMs / 5000)
      const y = slide * slide * height
      canvas.put(x, y, DROP)
      canvas.put(x, y + 1, mix(DROP, NIGHT, 0.4))
      canvas.put(x, y - 1, mix(STREAK_DIM, NIGHT, 0.3))
    }

    // The window: one bar down the middle and the sill.
    const bar = Math.round(width * 0.62)
    canvas.fill(bar - 1, 0, bar + 1, height - 2, FRAME)
    canvas.fill(bar, 0, bar + 1, height - 2, FRAME_EDGE)
    canvas.fill(0, height - 2, width, height - 1, FRAME_EDGE)
    canvas.fill(0, height - 1, width, height, SILL)
  },
}
