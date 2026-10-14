#!/usr/bin/env node
// A stand-in for the Anthropic Messages API that streams scripted replies, so
// mod demos can be recorded in the real Claude Code CLI with no account and
// no cost. Point the CLI at it with ANTHROPIC_BASE_URL.
//
//   node demo/mock-api.mjs mods/<mod>/demo.json [port]
//
// demo.json:
//   { "turns": [
//       { "prompt": "run the tests",          // matched against what you type
//         "steps": [
//           { "text": "Running them." },
//           { "tool": "Bash", "input": { "command": "npm test", "description": "Run tests" } },
//           { "text": "All 12 pass." } ] } ] }
//
// A mod that makes its own model call (no tools) gets a "side" reply:
//   "side": [ { "match": "<text in that request>", "text": "<the reply>" } ]
//
// Text steps stream word by word. A tool step ends a reply; Claude Code runs
// the tool for real and sends the result back, which starts the next reply.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const [scriptPath, port = '8787'] = process.argv.slice(2)
if (!scriptPath) {
  console.error('usage: node demo/mock-api.mjs <demo.json> [port]')
  process.exit(1)
}
// {{HOME}} and {{PROJECT}} in the script stand for the demo's throwaway home
// and project, so scripts never hold a real path.
const fill = text => text.replaceAll('{{HOME}}', process.env.OMODS_HOME ?? '').replaceAll('{{PROJECT}}', process.env.OMODS_PROJECT ?? '')
const script = JSON.parse(fill(readFileSync(scriptPath, 'utf8')))
const WORD_DELAY = script.wordDelay ?? 35

// Each turn's steps, cut into replies: text steps, up to and including a tool.
const replies = turn => {
  const out = [[]]
  for (const step of turn.steps) {
    out.at(-1).push(step)
    if (step.tool) out.push([])
  }
  return out.filter(reply => reply.length)
}

const textOf = content =>
  typeof content === 'string' ? content : content.filter(block => block.type === 'text').map(block => block.text).join('\n')

const isToolResult = message => Array.isArray(message.content) && message.content.some(block => block.type === 'tool_result')

// Which reply this request is asking for: find the last prompt the user typed,
// match it to a turn, and count the assistant replies since.
const pick = messages => {
  let start = messages.length - 1
  while (start >= 0 && (messages[start].role !== 'user' || isToolResult(messages[start]))) start--
  if (start < 0) return undefined
  const typed = textOf(messages[start].content).toLowerCase()
  const turn = script.turns.find(t => typed.includes(t.prompt.toLowerCase()))
  if (!turn) return undefined
  const sent = messages.slice(start + 1).filter(message => message.role === 'assistant').length
  return replies(turn)[sent]
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let toolCount = 0

const stream = async (res, model, steps) => {
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`)
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'request-id': 'req_demo' })
  send('message_start', {
    message: { id: `msg_demo_${Date.now()}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  })
  await sleep(script.thinkDelay ?? 600)

  let index = 0
  let stopReason = 'end_turn'
  for (const step of steps) {
    if (step.pause) await sleep(step.pause)
    if (step.text !== undefined) {
      send('content_block_start', { index, content_block: { type: 'text', text: '' } })
      for (const word of step.text.split(/(?<=\s)/)) {
        send('content_block_delta', { index, delta: { type: 'text_delta', text: word } })
        await sleep(WORD_DELAY)
      }
      send('content_block_stop', { index })
    } else if (step.tool) {
      send('content_block_start', { index, content_block: { type: 'tool_use', id: `toolu_demo_${++toolCount}`, name: step.tool, input: {} } })
      send('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(step.input ?? {}) } })
      send('content_block_stop', { index })
      stopReason = 'tool_use'
    }
    index++
  }
  send('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 180 } })
  send('message_stop', {})
  res.end()
}

const server = createServer((req, res) => {
  let body = ''
  req.on('data', chunk => (body += chunk))
  req.on('end', async () => {
    const path = req.url.split('?')[0]
    if (process.env.OMODS_LOG) console.error(new Date().toISOString().slice(17, 23), req.method, req.url, body.length)
    if (req.method === 'POST' && path === '/v1/messages/count_tokens') {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ input_tokens: 1200 }))
    }
    if (req.method !== 'POST' || path !== '/v1/messages') {
      res.writeHead(404, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'not in demo' } }))
    }
    const request = JSON.parse(body || '{}')
    // Side requests carry no tools: a mod's own model call (a rewrite, a
    // summary) gets the script's matching "side" reply; titles and the like
    // get a short one.
    const sideText = () => JSON.stringify(request.system ?? '') + '\n' + (request.messages ?? []).map(m => textOf(m.content)).join('\n')
    const side = request.tools?.length ? undefined : script.side?.find(s => sideText().toLowerCase().includes(s.match.toLowerCase()))
    const steps = request.tools?.length ? pick(request.messages ?? []) ?? [{ text: script.fallback ?? 'Done.' }] : side ? [{ text: side.text }] : [{ text: 'Demo' }]
    if (!request.stream) {
      const content = steps.flatMap(step =>
        step.text !== undefined ? [{ type: 'text', text: step.text }] : step.tool ? [{ type: 'tool_use', id: `toolu_demo_${++toolCount}`, name: step.tool, input: step.input ?? {} }] : [],
      )
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ id: 'msg_demo', type: 'message', role: 'assistant', model: request.model, content, stop_reason: steps.some(s => s.tool) ? 'tool_use' : 'end_turn', usage: { input_tokens: 1200, output_tokens: 180 } }))
    }
    await stream(res, request.model, steps)
  })
})

server.listen(Number(port), '127.0.0.1', () => console.log(`mock API on http://127.0.0.1:${port} playing ${scriptPath}`))
