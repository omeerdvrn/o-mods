import { hex, mix, noise, wrap } from '../engine'
import type { Activity, Canvas, Scene } from '../engine'

const WALL = hex('#2a1f3d')
const WALL_LOW = hex('#33264a')
const WINDOW_FRAME = hex('#1a1326')
const DESK = hex('#5a3a2a')
const DESK_TOP = hex('#7a5038')
const MONITOR = hex('#1b1b24')
const SCREEN = hex('#16324a')
const CODE = [hex('#7df3ff'), hex('#ff8fd8'), hex('#ffd36b'), hex('#9cf28a')]
const MUG = hex('#e8e0d0')
const STEAM = hex('#8d84a8')
const LAMP = hex('#ffcf7a')
const CAT = hex('#14101c')
const CAT_EYE = hex('#c8f26a')
const PLANT = hex('#4fa86a')
const POT = hex('#b0603a')

/** A lo-fi room: rain on the window, a cat on the sill, steaming coffee, and code scrolling while Claude edits. */
export const lofiRoom: Scene = {
  id: 'lofi-room',
  name: 'Lo-fi room',
  draw(canvas: Canvas, phase: number, act: Activity) {
    const { width, height } = canvas
    canvas.gradient(0, height, [[0, '#251a38'], [1, '#33264a']], 6)

    // The window: night, city lights, rain.
    const wx0 = Math.round(width * 0.58)
    const wx1 = Math.round(width * 0.92)
    const wy1 = Math.round(height * 0.62)
    canvas.gradient(1, wy1, [[0, '#0c1030'], [1, '#2a1a4a']], 6)
    canvas.fill(0, 0, wx0, height, WALL)
    canvas.fill(wx1, 0, width, height, WALL)
    canvas.fill(wx0, wy1, wx1, height, WALL_LOW)
    for (let index = 0; index < Math.round((wx1 - wx0) / 3); index++) {
      const x = wx0 + 1 + noise(index * 5 + 1) * (wx1 - wx0 - 2)
      const y = wy1 - 2 - noise(index * 5 + 2) * (wy1 * 0.5)
      canvas.put(x, y, CODE[index % CODE.length]!)
    }
    for (let index = 0; index < Math.round((wx1 - wx0) / 2); index++) {
      const x = wx0 + 1 + noise(index * 7 + 3) * (wx1 - wx0 - 2)
      const y = 1 + wrap(noise(index * 7 + 4) + phase * 2) * (wy1 - 2)
      canvas.put(x, y, hex('#6f86c4'))
    }
    canvas.fill(wx0 - 1, 0, wx0, wy1 + 1, WINDOW_FRAME)
    canvas.fill(wx1, 0, wx1 + 1, wy1 + 1, WINDOW_FRAME)
    canvas.fill(wx0 - 2, wy1, wx1 + 2, wy1 + 1, DESK_TOP)
    canvas.fill(Math.round((wx0 + wx1) / 2), 0, Math.round((wx0 + wx1) / 2) + 1, wy1, WINDOW_FRAME)

    // The cat on the sill, its tail swishing.
    const catX = wx1 - 8
    canvas.sprite(['c...c.', 'cccc..', 'ecec..', 'cccccc', 'cccccc'], { c: CAT, e: CAT_EYE }, catX, wy1 - 5)
    const swish = Math.sin(phase * Math.PI * 2) * 1.5
    canvas.put(catX + 6, wy1 - 2, CAT)
    canvas.put(catX + 7, wy1 - 3 + swish * 0.5, CAT)
    canvas.put(catX + 8 + swish * 0.4, wy1 - 4 + swish, CAT)

    // A desk lamp: its shade, a warm cone of light down onto the desk.
    const lampX = Math.round(width * 0.5)
    const lampTop = Math.round(height * 0.2)
    for (let y = lampTop + 3; y < height - 4; y++) {
      const spread = (y - lampTop - 3) * 0.6 + 2
      for (let x = Math.round(lampX - spread); x <= Math.round(lampX + spread); x++) canvas.put(x, y, mix(canvas.get(x, y), LAMP, 0.1))
    }
    canvas.sprite(['..sss..', '.sssss.', 'sssssss', '...l...'], { s: hex('#c86a3a'), l: LAMP }, lampX - 3, lampTop)
    canvas.fill(lampX, lampTop + 4, lampX + 1, height - 4, hex('#3a2c22'))

    // The desk, the monitor and its code, the mug, a plant.
    const deskY = height - 4
    canvas.fill(0, deskY, wx0 - 3, deskY + 1, DESK_TOP)
    canvas.fill(0, deskY + 1, wx0 - 3, height, DESK)
    const mx0 = Math.round(width * 0.2)
    const mx1 = Math.round(width * 0.46)
    const my0 = Math.round(height * 0.18)
    canvas.fill(mx0, my0, mx1, deskY - 1, MONITOR)
    canvas.fill(mx0 + 1, my0 + 1, mx1 - 1, deskY - 2, SCREEN)
    canvas.fill(Math.round((mx0 + mx1) / 2) - 1, deskY - 1, Math.round((mx0 + mx1) / 2) + 2, deskY, MONITOR)
    const lines = deskY - 3 - (my0 + 1)
    const scroll = act.tool === 'edit' || act.tool === 'bash' ? Math.floor(phase * 12) : 0
    for (let line = 0; line < lines; line++) {
      const seed = line + scroll
      const indent = Math.floor(noise(seed * 3 + 1) * 4)
      const length = 3 + Math.floor(noise(seed * 3 + 2) * (mx1 - mx0 - 8))
      const color = CODE[Math.floor(noise(seed * 3 + 3) * CODE.length)]!
      canvas.fill(mx0 + 2 + indent, my0 + 2 + line, Math.min(mx1 - 2, mx0 + 2 + indent + length), my0 + 3 + line, mix(color, SCREEN, 0.25))
    }
    if (Math.floor(phase * 6) % 2 === 0) canvas.put(mx0 + 3, deskY - 3, hex('#ffffff'))
    const mugX = mx1 + 4
    canvas.sprite(['mmm.', 'mmmm', 'mmm.'], { m: MUG }, mugX, deskY - 3)
    for (let puff = 0; puff < 3; puff++) {
      const rise = wrap(phase + puff / 3)
      canvas.put(mugX + 1 + Math.sin(rise * 6 + puff) * 1, deskY - 4 - rise * 5, mix(STEAM, WALL, rise))
    }
    canvas.sprite(['.p.p.', 'ppppp', '.ppp.', '.ooo.', '.ooo.'], { p: PLANT, o: POT }, mx1 + 10, deskY - 5)
  },
}
