#!/usr/bin/env node
// Writes fake Claude Code session logs for the usage-stats demo, dated relative
// to today so the receipt always has a fresh last 30 days. Every project,
// branch and number here is made up.
//   node gen-logs.mjs <CLAUDE_CONFIG_DIR>
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [config] = process.argv.slice(2)
if (!config) throw new Error('usage: gen-logs.mjs <config dir>')

let seed = 7
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const pick = weighted => {
  let r = rand() * weighted.reduce((s, [, w]) => s + w, 0)
  for (const [value, w] of weighted) if ((r -= w) <= 0) return value
  return weighted[0][0]
}

const PROJECTS = [['webapp', 58], ['shop-api', 24], ['docs-site', 11], ['infra', 7]]
const MODELS = [['claude-opus-5-5', 47], ['claude-opus-5', 36], ['claude-sonnet-5-5', 14], ['claude-haiku-5-5', 3]]
const BRANCHES = {
  webapp: ['eng-412-checkout-retry', 'eng-418-dark-mode', 'eng-431-cart-badge', 'main'],
  'shop-api': ['eng-405-rate-limit', 'eng-427-order-export', 'main'],
  'docs-site': ['eng-433-api-guide', 'main'],
  infra: ['eng-420-redis-sessions', 'main'],
}
const DAY = 86_400_000
const now = Date.now()
const uuid = () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(rand() * 16).toString(16))

let sessions = 0
for (let back = 44; back >= 0; back--) {
  const day = new Date(now - back * DAY)
  const weekend = day.getDay() === 0 || day.getDay() === 6
  const busy = 0.6 + Math.sin(back / 4) * 0.4 + (back < 9 ? 0.5 : 0)
  const count = Math.max(0, Math.round((weekend ? 0.6 : 3.4) * busy + rand() * 1.5 - 0.5))
  for (let n = 0; n < count; n++) {
    const project = pick(PROJECTS)
    const branch = BRANCHES[project][Math.floor(rand() * BRANCHES[project].length)]
    const model = pick(MODELS)
    const session = uuid()
    const cwd = `/Users/dev/src/${project}`
    const start = new Date(day)
    start.setHours(9 + Math.floor(rand() * 9), Math.floor(rand() * 60), 0, 0)
    if (start.getTime() > now) start.setTime(now - 3_600_000)
    let t = start.getTime()
    const lines = []
    const prompts = 3 + Math.floor(rand() * 9)
    for (let p = 0; p < prompts; p++) {
      const base = { cwd, gitBranch: branch, sessionId: session, userType: 'external', version: '2.1.300' }
      lines.push({ ...base, type: 'user', timestamp: new Date(t).toISOString(), message: { role: 'user', content: 'demo prompt' } })
      const replies = 2 + Math.floor(rand() * 7)
      for (let r = 0; r < replies; r++) {
        t += 20_000 + rand() * 60_000
        lines.push({
          ...base, type: 'assistant', timestamp: new Date(t).toISOString(), requestId: `req_${uuid()}`,
          message: {
            id: `msg_${uuid()}`, role: 'assistant', model, content: [{ type: 'text', text: 'demo' }],
            usage: {
              input_tokens: 20 + Math.floor(rand() * 400), output_tokens: 300 + Math.floor(rand() * 2500),
              cache_creation_input_tokens: 2000 + Math.floor(rand() * 20000), cache_read_input_tokens: 60000 + Math.floor(rand() * 160000),
            },
          },
        })
      }
      t += 60_000 + rand() * 600_000
    }
    const dir = join(config, 'projects', `-Users-dev-src-${project}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${session}.jsonl`), lines.map(line => JSON.stringify(line)).join('\n') + '\n')
    sessions++
  }
}
console.log(`wrote ${sessions} fake sessions`)
