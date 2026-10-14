import { hex, wrap } from './engine'
import type { Activity, Canvas } from './engine'

const BODY = hex('#d4826a')
const EYE = hex('#1b1b1b')
const PAGE = hex('#f2efe6')
const COVER = hex('#4e8de0')
const LAPTOP = hex('#c9ccd3')
const SCREEN = hex('#7df3ff')
const SHOVEL = hex('#9aa0a6')
const HANDLE = hex('#8a6a4a')
const DIRT = hex('#7a5a3a')
const PROMPT = hex('#3cff6a')
const TERMINAL = hex('#1b1b24')
const GLOBE = hex('#4fb8ff')
const LAND = hex('#4fd17a')
const WAVE = hex('#c58aff')
const BUBBLE = hex('#e8e8f0')
const BALLS = [hex('#ff5f7a'), hex('#ffd34d'), hex('#4fd1ff')]
const FOOD = hex('#e8b04a')
const HEART = hex('#ff4a6a')
const ZZZ = hex('#bfc8ff')

const CRAB = ['..oooooo..', 'o.oeooeo.o', 'oooooooooo', '..oooooo..', '..o.o.o.o.']
const SLEEPY = ['..oooooo..', 'o.oxooxo.o', 'oooooooooo', '..oooooo..', '..o.o.o.o.']
const HEART_ART = ['h.h', 'hhh', '.h.']

/** Late at night the crab gets sleepy. */
const isSleepy = (hour: number) => hour >= 0 && hour < 6

/**
 * The companion crab in the scene's bottom-left corner: it does what Claude does (reads, types, digs, runs,
 * browses, delegates, thinks, juggles on long runs), eats when a task is done, and keeps today's hearts.
 */
export function drawCrab(canvas: Canvas, phase: number, act: Activity) {
  const { height } = canvas
  const x = 3
  const bob = Math.floor(phase * 4) % 2
  const y = height - CRAB.length - 1 - bob
  const sleepy = isSleepy(act.hour) && act.finishingMs === null
  canvas.sprite(sleepy ? SLEEPY : CRAB, { o: BODY, e: EYE, x: EYE }, x, y)
  const front = x + 11
  const tick = Math.floor(phase * 16)

  // Today's hearts, up to five, above the crab.
  for (let heart = 0; heart < Math.min(5, act.fedToday); heart++) canvas.sprite(HEART_ART, { h: HEART }, x + heart * 4 - 1, y - 5)

  if (act.finishingMs !== null) {
    // Task done: a snack, a chomp, a heart popping up.
    const t = Math.min(1, act.finishingMs / 1500)
    if (t < 0.7) canvas.sprite(['ff', 'ff'], { f: FOOD }, front - 1 - Math.round(t * 2), y + 1)
    canvas.sprite(HEART_ART, { h: HEART }, x + 4, y - 2 - Math.round(t * 6))
    return
  }
  if (sleepy) {
    for (let index = 0; index < 3; index++) {
      const rise = wrap(phase + index / 3)
      canvas.put(x + 8 + rise * 6, y - 1 - rise * 6, ZZZ)
    }
  }
  if (act.elapsedMs > 30_000 && act.tool !== 'think') {
    // A long run: juggling.
    BALLS.forEach((color, index) => {
      const angle = (phase * 2 + index / 3) * Math.PI * 2
      canvas.put(x + 5 + Math.cos(angle) * 4, y - 3 + Math.sin(angle) * 3 - 1, color)
    })
    return
  }
  switch (act.tool) {
    case 'read':
      canvas.sprite(['cpppc', 'cpppc', 'ccccc'], { p: PAGE, c: COVER }, front, y + 1)
      if (tick % 4 === 0) canvas.put(front + 2, y + 1, COVER)
      break
    case 'edit':
      canvas.sprite(['sssss', 'sssss', 'lllllll'], { s: SCREEN, l: LAPTOP }, front - 1, y + 1)
      canvas.put(front - 2, y + 2 + (tick % 2), BODY)
      break
    case 'search':
      canvas.line(front, y - 1, front + 3, y + 3, HANDLE)
      canvas.fill(front + 3, y + 3, front + 5, y + 5, SHOVEL)
      for (let clod = 0; clod < 3; clod++) {
        const arc = wrap(phase * 2 + clod / 3)
        canvas.put(front + 5 + arc * 6, y + 3 - Math.sin(arc * Math.PI) * 5, DIRT)
      }
      break
    case 'bash':
    case 'test':
      canvas.fill(front, y, front + 6, y + 4, TERMINAL)
      canvas.put(front + 1, y + 1, PROMPT)
      if (tick % 2) canvas.put(front + 2, y + 1, PROMPT)
      canvas.fill(front + 1, y + 3, front + 2 + (tick % 4), y + 4, PROMPT)
      break
    case 'web':
      canvas.disc(front + 2, y + 2, 2.2, GLOBE)
      canvas.put(front + 1 + (tick % 4), y + 1, LAND)
      canvas.put(front + 2 + ((tick + 2) % 3), y + 3, LAND)
      break
    case 'agent':
      for (let ring = 1; ring <= 3; ring++) {
        if ((tick + ring) % 3 === 0) {
          canvas.put(x + 5 - ring, y - 1 - ring, WAVE)
          canvas.put(x + 5 + ring, y - 1 - ring, WAVE)
        }
      }
      break
    default: {
      // Thinking: a bubble whose dots fill in turn.
      canvas.put(x + 9, y - 1, BUBBLE)
      canvas.put(x + 10, y - 3, BUBBLE)
      canvas.fill(x + 11, y - 7, x + 18, y - 4, BUBBLE)
      for (let dot = 0; dot < 3; dot++) if (tick % 4 > dot) canvas.put(x + 12 + dot * 2, y - 6, EYE)
    }
  }
}
