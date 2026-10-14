import { hex, noise, wrap } from '../engine'
import type { Activity, Canvas, Scene } from '../engine'

const SAND = hex('#c9a66b')
const SAND_DARK = hex('#a8834d')
const WEED = hex('#2fa86a')
const WEED_DARK = hex('#1f7a4c')
const BUBBLE = hex('#bff3ff')
const FOOD = hex('#e8b04a')
const CHEST = hex('#7a4a22')
const GOLD = hex('#ffd34d')

// Each fish faces right: tail at the left, eye near the nose.
const FISH = [
  { art: ['o.ooo.', 'ooooeo', 'o.ooo.'], body: hex('#ff8a3d') },
  { art: ['b..bbb..', 'bbbbbbbb.', '.bbbbbebb', 'bbbbbbbb.', 'b..bbb..'], body: hex('#4fb8ff') },
  { art: ['y.yyy.', 'yyyyey', 'y.yyy.'], body: hex('#ffd84d') },
  { art: ['p.ppp.', 'ppppep', 'p.ppp.'], body: hex('#ff6fb5') },
]

/** A fish tank: fish swim, weed sways, a bubble rises per tool call, and food drops when the task is done. */
export const fishTank: Scene = {
  id: 'fish-tank',
  name: 'Fish tank',
  draw(canvas: Canvas, phase: number, act: Activity) {
    const { width, height } = canvas
    canvas.gradient(0, height, [[0, '#0f5c8a'], [0.6, '#0a3d66'], [1, '#062744']], 8)
    // Light rays from the surface.
    for (let ray = 0; ray < 4; ray++) {
      const x0 = width * (0.15 + ray * 0.24) + Math.sin((phase + ray) * Math.PI * 2) * 2
      for (let y = 0; y < height * 0.7; y++) canvas.put(x0 + y * 0.4, y, hex('#1676a8'))
    }

    // Sand, a treasure chest, and weed swaying.
    for (let x = 0; x < width; x++) {
      const top = height - 2 - Math.round(noise(Math.floor(x / 6)) * 1.4)
      canvas.fill(x, top, x + 1, height, (x + top) % 5 === 0 ? SAND_DARK : SAND)
    }
    const chestX = Math.round(width * 0.12)
    canvas.sprite(['.gggg.', 'cccccc', 'cgccgc', 'cccccc'], { c: CHEST, g: GOLD }, chestX, height - 6)
    for (let index = 0; index < Math.round(width / 12); index++) {
      const x = noise(index * 13 + 3) * width
      const tall = 4 + Math.floor(noise(index * 13 + 4) * (height * 0.45))
      for (let step = 0; step < tall; step++) {
        const sway = Math.sin((phase + index * 0.13) * Math.PI * 2 + step * 0.5) * (step / tall) * 1.6
        canvas.put(x + sway, height - 2 - step, step % 3 === 0 ? WEED_DARK : WEED)
      }
    }

    // Bubbles: one stream per tool call this turn (up to 8), rising from the chest and the weed.
    const streams = Math.min(8, 1 + act.toolCalls)
    for (let stream = 0; stream < streams; stream++) {
      const x0 = stream === 0 ? chestX + 3 : noise(stream * 17 + 5) * width
      for (let bubble = 0; bubble < 3; bubble++) {
        const rise = wrap(phase * 2 + bubble / 3 + noise(stream * 17 + 6))
        canvas.put(x0 + Math.sin(rise * 9) * 0.8, height - 3 - rise * (height - 3), BUBBLE)
      }
    }

    // Food falls when the task is done; the fish swim to it.
    const feeding = act.finishingMs !== null
    const foodX = width / 2
    if (feeding) {
      for (let flake = 0; flake < 7; flake++) {
        const fall = Math.min(1, (act.finishingMs! / 1600) * (0.6 + noise(flake) * 0.6))
        canvas.put(foodX - 4 + noise(flake + 40) * 8, fall * height * 0.6, FOOD)
      }
    }

    // The fish.
    FISH.forEach((fish, index) => {
      const speed = 1 + (index % 2)
      const lane = height * (0.25 + noise(index * 7 + 1) * 0.45)
      const goesRight = index % 2 === 0
      const swim = wrap((act.elapsedMs / 1000) * speed * 0.07 + noise(index * 7 + 2))
      let x = goesRight ? swim * (width + 10) - 8 : width + 2 - swim * (width + 10)
      let y = lane + Math.sin((phase * 2 + index) * Math.PI * 2) * 1.2
      if (feeding) {
        const pull = Math.min(1, act.finishingMs! / 1200)
        x += (foodX - 3 + index * 2 - x) * pull
        y += (height * 0.45 - y) * pull
      }
      const palette: Record<string, number> = { o: fish.body, b: fish.body, y: fish.body, p: fish.body, e: hex('#0b0b14') }
      canvas.sprite(fish.art, palette, x, y - Math.floor(fish.art.length / 2), !goesRight)
    })
  },
}
