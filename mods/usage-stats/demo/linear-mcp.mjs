#!/usr/bin/env node
// A fake Linear MCP server for the usage-stats demo: list_issues answers with
// made-up ENG- issues closed over the last weeks. No network.
import { createInterface } from 'node:readline'

const DAY = 86_400_000
const ISSUES = [
  [1, 1], [2, 2], [3, 3], [4, 1], [6, 2], [8, 5], [9, 1], [11, 3], [13, 2], [15, 1], [16, 3], [19, 2], [22, 1], [24, 8], [27, 2],
].map(([ago, points], i) => ({ id: `ENG-${400 + i * 2}`, completedAt: new Date(Date.now() - ago * DAY).toISOString(), estimate: { value: points } }))

const send = msg => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n')
const schema = { type: 'object', properties: {}, additionalProperties: true }

createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return
  const { id, method, params } = JSON.parse(line)
  if (id === undefined) return
  if (method === 'initialize')
    return send({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'linear-demo', version: '0.0.1' } } })
  if (method === 'tools/list') return send({ id, result: { tools: [{ name: 'list_issues', description: 'List issues', inputSchema: schema }] } })
  if (method === 'tools/call') {
    if (params.name !== 'list_issues') return send({ id, result: { content: [{ type: 'text', text: `Unknown tool ${params.name}` }], isError: true } })
    return send({ id, result: { content: [{ type: 'text', text: JSON.stringify({ issues: ISSUES, hasNextPage: false }) }] } })
  }
  if (method === 'ping') return send({ id, result: {} })
  send({ id, error: { code: -32601, message: `Method not found: ${method}` } })
})
