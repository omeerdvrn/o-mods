/**
 * The events the mod plays on, the clips it plays, and which event a finished command is. Pure functions, so
 * the rules are testable.
 */

export const EVENTS = {
  'tests-failed': 'a test run fails',
  'tests-passed': 'a test run passes',
  asking: 'Claude asks you something (a permission, a question, a plan)',
  'build-failed': 'a build or type check fails',
  'command-failed': 'any other shell command fails',
  'push-rejected': 'git push is rejected',
  denied: 'a tool call is denied',
  'turn-error': 'a turn ends in an error',
  interrupted: 'you stop Claude mid-turn',
} as const

export type FaahEvent = keyof typeof EVENTS

/** The clips, each fetched once from Remotion's sound library (https://remotion.media/<name>.wav). */
export const CLIPS = ['faah', 'anime-wow', 'bruh'] as const
export type Clip = (typeof CLIPS)[number]

export const CLIP_FILES: Record<Clip, string> = { faah: 'fah', 'anime-wow': 'anime-wow', bruh: 'bruh' }

export const DEFAULT_EVENTS: FaahEvent[] = ['tests-failed', 'tests-passed', 'asking']

/** Which clip each event plays until you pick another with /faah sound. */
export const DEFAULT_SOUNDS: Record<FaahEvent, Clip> = {
  'tests-failed': 'faah',
  'tests-passed': 'anime-wow',
  asking: 'bruh',
  'build-failed': 'faah',
  'command-failed': 'faah',
  'push-rejected': 'faah',
  denied: 'bruh',
  'turn-error': 'faah',
  interrupted: 'bruh',
}

/** Tools whose call puts a question to you: they open a dialog however permissions are set. */
export const ASKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])
/** Notification types that mean a dialog is open and waiting on you (not the idle reminder). */
export const ASKING_NOTIFICATIONS = new Set(['permission_prompt', 'elicitation_dialog'])

const TEST_COMMAND = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(jest|vitest|pytest|mocha|rspec|phpunit|playwright)\b|\b(go|cargo|deno|bun|swift|dotnet)\s+test\b|\bclaude\s+plugin\s+test\b|\bmake\s+(test|check)\b|\bpython3?\s+-m\s+(pytest|unittest)\b|\bgradlew?\s+test\b|\bmvn\s+test\b/
const BUILD_COMMAND = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(build|typecheck|type-check|lint)\b|\btsc\b|\b(cargo|go|swift)\s+build\b|\bmake\b|\bgradlew?\s+(build|assemble)\b|\bmvn\s+(package|compile|install)\b|\bxcodebuild\b|\bdocker\s+build\b/
const PUSH_COMMAND = /\bgit\s+push\b/

/** A test runner's summary that names failures, for runs piped through tail or grep that exit 0. */
const FAILURES_IN_OUTPUT = /\b[1-9]\d*\s+(failed|failing|failures?|errors?)\b|^\s*FAIL\b|\bFAILED\b|^\(fail\)|\b[1-9]\d*\s+fail\b|Tests?:\s+[1-9]\d*\s+failed/im

export function parseEvents(text: string): FaahEvent[] {
  return [...new Set(text.split(/[\s,]+/).filter((name): name is FaahEvent => name in EVENTS))]
}

export function isClip(name: string): name is Clip {
  return (CLIPS as readonly string[]).includes(name)
}

/** The event a finished Bash command is, if any. */
export function bashEvent(command: string, output: { isError: boolean; text: string }): FaahEvent | null {
  if (TEST_COMMAND.test(command)) return output.isError || FAILURES_IN_OUTPUT.test(output.text) ? 'tests-failed' : 'tests-passed'
  if (!output.isError) return null
  if (PUSH_COMMAND.test(command)) return 'push-rejected'
  if (BUILD_COMMAND.test(command)) return 'build-failed'
  return 'command-failed'
}

