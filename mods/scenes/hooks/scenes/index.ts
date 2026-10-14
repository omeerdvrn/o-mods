import { drawBursts } from '../bursts'
import { drawCrab } from '../crab'
import { Canvas, LOOP_MS, toSvg } from '../engine'
import type { Activity, Scene } from '../engine'
import { campfire } from './campfire'
import { fishTank } from './fish-tank'
import { lofiRoom } from './lofi-room'
import { matrix, matrixRain } from './matrix'
import { nightDrive } from './night-drive'
import { oceanSunset } from './ocean-sunset'
import { rainyWindow } from './rainy-window'
import { spaceFlight } from './space-flight'
import { weather } from './weather'

export const SCENES: Scene[] = [nightDrive, rainyWindow, fishTank, spaceFlight, lofiRoom, campfire, oceanSunset, matrix, weather]

export function sceneById(id: string): Scene | undefined {
  return SCENES.find(scene => scene.id === id)
}

/** A scene by id or by a loose spelling of its name ("lofi", "fish", "night drive"). */
export function findScene(asked: string): Scene | undefined {
  const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')
  const wanted = plain(asked)
  if (wanted === '') return undefined
  return SCENES.find(scene => plain(scene.id) === wanted || plain(scene.name) === wanted)
    ?? (SCENES.filter(scene => plain(scene.id).includes(wanted)).length === 1 ? SCENES.find(scene => plain(scene.id).includes(wanted)) : undefined)
}

/** A random scene for a new turn: never the one just shown, only those available now. */
export function pickScene(act: Activity, last: string | null, random: number): Scene {
  const choices = SCENES.filter(scene => scene.id !== last && (scene.isAvailable?.(act) ?? true))
  return choices[Math.floor(random * choices.length)] ?? nightDrive
}

/** One frame: the scene, the matrix sweeping over it while Claude searches, any bursts, and the crab. */
export function composeFrame(scene: Scene, width: number, height: number, phase: number, act: Activity, withCrab: boolean): Canvas {
  const canvas = new Canvas(width, height)
  scene.draw(canvas, phase, act)
  if (act.tool === 'search' && scene.id !== 'matrix' && act.finishingMs === null) matrixRain(canvas, phase, 0.12)
  drawBursts(canvas, act)
  if (withCrab) drawCrab(canvas, phase, act)
  return canvas
}

/** The desktop's SVG: the largest scene that stays under its 131072-character limit. */
export function desktopSvg(scene: Scene, columns: number, height: number, act: Activity, withCrab: boolean): string {
  let svg = ''
  for (const [width, frames] of [[Math.min(columns, 80), 8], [64, 6], [48, 5], [40, 4], [32, 3]] as const) {
    svg = toSvg(Array.from({ length: frames }, (_, frame) => composeFrame(scene, width, height, frame / frames, act, withCrab)), LOOP_MS / 1000)
    if (svg.length < 120_000) break
  }
  return svg
}
