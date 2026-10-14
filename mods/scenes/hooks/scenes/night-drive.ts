import { hex, mix, noise, ramp } from '../engine'
import type { Canvas, Scene } from '../engine'

/** Synthwave: a striped neon sun behind a skyline, the grid and streetlights rushing at you, your car. */
const SKY: [number, string][] = [[0, '#0b0120'], [0.5, '#24063f'], [0.8, '#5a1166'], [0.94, '#b0206f'], [1, '#ff3d8b']]
const SUN: [number, string][] = [[0, '#fff07a'], [0.45, '#ffb347'], [0.75, '#ff6a5c'], [1, '#ff2a8a']]
const C = {
  ground: hex('#0e0122'),
  grid: hex('#ff2fa8'),
  gridFar: hex('#3a0a4a'),
  road: hex('#160829'),
  edge: hex('#16e0ff'),
  dash: hex('#ffd23f'),
  building: hex('#120526'),
  buildingTop: hex('#5a2a8a'),
  windows: [hex('#ff8fd8'), hex('#7df3ff'), hex('#ffe08a')],
  stars: [hex('#ffffff'), hex('#b9f2ff'), hex('#ffc7f0')],
  lamp: hex('#fff1c1'),
  pole: hex('#3b2363'),
  car: hex('#4a2a7a'),
  carTop: hex('#120a22'),
  glass: hex('#3d7fc4'),
  tail: hex('#ff2d4a'),
  plate: hex('#d9d2ff'),
}


export const nightDrive: Scene = {
  id: 'night-drive',
  name: 'Night drive',
  draw(canvas: Canvas, phase: number) {
  const { width, height, colors } = canvas
  const put = (x: number, y: number, color: number) => canvas.put(x, y, color)
  const horizon = Math.max(4, Math.round(height * 0.55))
  const centre = Math.floor(width / 2)
  const span = height - horizon

  const roadHalf = Math.max(8, Math.min(width * 0.2, span * 2.6))

  // Sky and stars, twinkling.
  for (let y = 0; y < horizon; y++) {
    const color = ramp(SKY, y / horizon, 14)
    for (let x = 0; x < width; x++) colors[y * width + x] = color
  }
  const stars = Math.round((width * horizon) / 110)
  for (let index = 0; index < stars; index++) {
    const x = Math.floor(noise(index * 3 + 1) * width)
    const y = Math.floor(noise(index * 3 + 2) * (horizon - 3))
    if ((phase * 2 + noise(index * 3 + 3)) % 1 < 0.75) put(x, y, C.stars[index % 3]!)
  }

  // The sun, its lower half cut by bands drifting down.
  const radius = Math.max(3, Math.min(Math.round(horizon * 0.8), Math.round(width * 0.09)))
  const sunY = horizon - 1
  const band = Math.max(3, Math.round(radius / 3))
  for (let y = sunY - radius; y < horizon; y++) {
    const dy = y - sunY
    if (dy * dy > radius * radius) continue
    const below = y - (sunY - Math.round(radius * 0.45))
    if (below >= 0) {
      const gap = 1 + Math.floor((below / (radius * 0.45 + 1)) * 2)
      const offset = (((below - Math.floor(phase * band * 2)) % band) + band) % band
      if (offset < gap) continue
    }
    const half = Math.floor(Math.sqrt(radius * radius - dy * dy))
    const color = ramp(SUN, (y - (sunY - radius)) / (radius + 1), 8)
    for (let x = centre - half; x <= centre + half; x++) put(x, y, color)
  }

  // The skyline: low near the sun, taller toward the sides; its windows flicker.
  for (let x = 0, index = 0; x < width; index++) {
    const wide = 3 + Math.floor(noise(index * 7 + 11) * 7)
    const fromCentre = Math.abs(x + wide / 2 - centre) / (width / 2)
    const tall = Math.max(1, Math.round(horizon * (0.12 + fromCentre * 0.5) * (0.5 + noise(index * 7 + 12))))
    for (let y = horizon - tall; y < horizon; y++) {
      for (let column = x; column < x + wide; column++) put(column, y, y === horizon - tall ? C.buildingTop : C.building)
    }
    for (let column = x + 1; column < x + wide - 1; column += 2) {
      for (let y = horizon - tall + 1; y < horizon - 1; y += 2) {
        const lit = noise(column * 31 + y * 17)
        if (lit < 0.3 && (phase + lit * 3) % 1 < 0.85) put(column, y, C.windows[Math.floor(lit * 10) % 3]!)
      }
    }
    x += wide + (noise(index * 7 + 13) < 0.3 ? 1 : 0)
  }

  /** A line down the ground that stays unbroken however steep: each row fills the run from the row above. */
  const slope = (xAt: (s: number) => number, color: number) => {
    let previous: number | null = null
    for (let y = horizon; y < height; y++) {
      const x = Math.round(xAt((y - horizon + 1) / span))
      const low = previous === null ? x : Math.min(x, previous + Math.sign(x - previous))
      const high = previous === null ? x : Math.max(x, previous + Math.sign(x - previous))
      for (let column = low; column <= high; column++) put(column, y, color)
      previous = x
    }
  }

  // Ground and grid: rows one pixel thick at every depth, rushing toward you; columns converging.
  for (let y = horizon; y < height; y++) {
    const s = (y - horizon + 1) / span
    for (let x = 0; x < width; x++) colors[y * width + x] = C.ground
    const depth = 1 / s
    const perPixel = 1.2 / (s * s * span)
    if (perPixel < 0.45 && (((depth * 1.2 - phase * 2) % 1) + 1) % 1 < perPixel * 1.05) {
      const color = mix(C.gridFar, C.grid, Math.round(Math.min(1, s * 1.8) * 6) / 6)
      for (let x = 0; x < width; x++) colors[y * width + x] = color
    }
  }
  // A few grid lines converging on the road's vanishing point.
  for (let k = 1; k <= 6; k++) {
    for (const side of [-1, 1]) slope(s => centre + side * (roadHalf * s + k * width * 0.11 * s), C.gridFar)
  }

  // The road, with cyan edges and yellow dashes in the middle.
  for (let y = horizon; y < height; y++) {
    const s = (y - horizon + 1) / span
    const half = roadHalf * s
    const left = Math.round(centre - half)
    const right = Math.round(centre + half)
    for (let x = left; x <= right; x++) put(x, y, C.road)
    if ((((1 / s) * 1.5 - phase * 3) % 1 + 1) % 1 < 0.5) {
      put(centre, y, C.dash)
      if (s > 0.6) put(centre - 1, y, C.dash)
    }
  }

  slope(s => centre - roadHalf * s - 1, C.edge)
  slope(s => centre + roadHalf * s + 1, C.edge)

  // Streetlights on both sides, coming toward you.
  for (let k = 0; k < 3; k++) {
    const u = (k + phase * 3) / 3 % 1
    const s = u * u
    if (s < 0.08) continue
    const y = horizon + Math.round(s * (span - 1))
    for (const side of [-1, 1]) {
      const x = Math.round(centre + side * roadHalf * 1.4 * s)
      const tall = Math.max(2, Math.round(height * 0.6 * s))
      for (let py = y - tall; py <= y; py++) put(x, py, C.pole)
      put(x - side, y - tall, C.lamp)
      put(x, y - tall, C.lamp)
    }
  }

  // Your car from behind: a small sprite, roof, taillights, plate and tires, with a small bounce.
  const car = [
    '...gggggg...',
    '..gggggggg..',
    'tttbbbbbbttt',
    'bbbbbppbbbbb',
    '.dd......dd.',
  ]
  const paint: Record<string, number> = { g: C.glass, t: C.tail, b: C.car, p: C.plate, d: C.carTop }
  if (span >= car.length) {
    const left = centre - 6
    const top = height - car.length - (phase * 8 % 1 < 0.5 ? 0 : 1) + 1
    car.forEach((line, row) => [...line].forEach((pixel, column) => paint[pixel] !== undefined && put(left + column, top + row, paint[pixel]!)))
  }

  },
}
