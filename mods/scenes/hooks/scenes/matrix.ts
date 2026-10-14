import { hex, mix, noise, wrap } from '../engine'
import type { Canvas, Scene } from '../engine'

const HEAD = hex('#d8ffd8')
const BRIGHT = hex('#3cff6a')
const DIM = hex('#0f7a2a')
const BLACK = hex('#020a04')

/** Columns of green code raining down. `density` 0 to 1: a full scene, or a sparse sweep over another scene. */
export function matrixRain(canvas: Canvas, phase: number, density: number) {
  const { width, height } = canvas
  for (let column = 0; column < width; column++) {
    if (noise(column * 7 + 3) > density) continue
    const speed = 1 + Math.floor(noise(column * 7 + 4) * 3)
    const length = 4 + Math.floor(noise(column * 7 + 5) * height * 0.8)
    const head = wrap(noise(column * 7 + 6) + phase * speed) * (height + length)
    for (let step = 0; step < length; step++) {
      const y = Math.floor(head - step)
      if (y < 0 || y >= height) continue
      // Glyphs change as they fall: some cells blink out.
      if (step > 0 && noise(column * 131 + y * 17 + Math.floor(phase * 20)) < 0.18) continue
      canvas.put(column, y, step === 0 ? HEAD : mix(BRIGHT, DIM, step / length))
    }
  }
}

export const matrix: Scene = {
  id: 'matrix',
  name: 'Matrix rain',
  draw(canvas: Canvas, phase: number) {
    canvas.fill(0, 0, canvas.width, canvas.height, BLACK)
    matrixRain(canvas, phase, 0.55)
  },
}
