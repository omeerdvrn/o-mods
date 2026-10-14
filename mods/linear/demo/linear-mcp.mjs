#!/usr/bin/env node
// A stand-in Linear MCP server for the demo recording: stdio JSON-RPC, no
// dependencies, no network. It answers list_issues, get_issue and save_issue
// in the same JSON shape as Linear's own MCP server, with made-up issues.
import { createInterface } from 'node:readline'

const now = Date.now()
const day = 86_400_000
const date = offset => new Date(now + offset * day).toISOString().slice(0, 10)
const pts = n => ({ value: n, name: `${n} Points` })
const pri = (value, name) => ({ value, name })

const issue = (id, title, status, statusType, priority, estimate, project, labels = [], dueDate = null, description = '') => ({
  id, title, description, estimate, priority, status, statusType, project, team: 'Acme',
  url: `https://linear.app/acme/issue/${id}`,
  gitBranchName: `feature/${id.toLowerCase()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)}`,
  labels: labels.map(name => ({ name })), dueDate,
})

const ISSUES = [
  issue('ENG-128', 'Add dark mode to the settings page', 'In Progress', 'started', pri(2, 'High'), pts(3), 'Web app', ['Feature'], date(3),
    'Add a theme toggle to Settings → Appearance. Respect the system preference by default and remember the choice per user.'),
  issue('ENG-131', 'Checkout button stays disabled after the card form is fixed', 'In Progress', 'started', pri(1, 'Urgent'), pts(2), 'Payments', ['Bug'], date(1),
    'After a validation error on the card form, correcting the field does not re-enable the Pay button until the page reloads.'),
  issue('ENG-119', 'Cache the search index between deploys', 'In Review', 'started', pri(3, 'Medium'), pts(5), 'Platform', ['Performance'], null,
    'Rebuilding the index on every deploy takes four minutes. Persist it to the shared volume and rebuild only on schema changes.'),
  issue('ENG-135', 'Paginate the audit log API', 'Todo', 'unstarted', pri(2, 'High'), pts(3), 'Platform', ['API'], date(6),
    'Return 100 entries per page with a cursor, and keep the old unpaginated response behind a flag for one release.'),
  issue('ENG-142', 'Show a friendly error when the upload is too large', 'Todo', 'unstarted', pri(3, 'Medium'), pts(1), 'Web app', ['Bug'], null,
    'Uploads over 25 MB fail with a raw 413 page. Check the size in the browser first and explain the limit.'),
  issue('ENG-147', 'Add keyboard shortcuts to the issue list', 'Todo', 'unstarted', pri(4, 'Low'), pts(2), 'Web app', ['Feature'], null,
    'j/k to move, enter to open, x to select.'),
  issue('ENG-101', 'Remove the legacy v1 export endpoint', 'Backlog', 'backlog', pri(4, 'Low'), pts(1), 'Platform', ['Cleanup'], null,
    'Nobody has called /v1/export in 90 days.'),
  issue('ENG-112', 'Rotate the session signing key without logging users out', 'Done', 'completed', pri(2, 'High'), pts(3), 'Platform', ['Security'], null, ''),
  issue('ENG-115', 'Fix flaky date picker test', 'Done', 'completed', pri(3, 'Medium'), pts(1), 'Web app', ['Testing'], null, ''),
]

const text = body => ({ content: [{ type: 'text', text: JSON.stringify(body) }], isError: false })

const TOOLS = {
  list_issues: args => text({ issues: ISSUES.filter(i => !args.state || i.statusType === args.state), hasNextPage: false }),
  get_issue: args => {
    const found = ISSUES.find(i => i.id === args.id)
    return found ? text(found) : { content: [{ type: 'text', text: `Issue ${args.id} not found` }], isError: true }
  },
  save_issue: args => {
    const found = ISSUES.find(i => i.id === args.id)
    if (found && args.state) Object.assign(found, { status: args.state, statusType: 'started' })
    return text(found ?? { ok: true })
  },
}

const schema = { type: 'object', properties: {}, additionalProperties: true }
const send = msg => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n')

createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return
  const { id, method, params } = JSON.parse(line)
  if (id === undefined) return
  if (method === 'initialize')
    return send({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'linear-demo', version: '0.0.1' } } })
  if (method === 'tools/list')
    return send({ id, result: { tools: [
      { name: 'list_issues', description: 'List issues', inputSchema: schema },
      { name: 'get_issue', description: 'Get an issue', inputSchema: schema },
      { name: 'save_issue', description: 'Create or update an issue', inputSchema: schema },
    ] } })
  if (method === 'tools/call') {
    const tool = TOOLS[params.name]
    return send({ id, result: tool ? tool(params.arguments ?? {}) : { content: [{ type: 'text', text: `Unknown tool ${params.name}` }], isError: true } })
  }
  if (method === 'ping') return send({ id, result: {} })
  send({ id, error: { code: -32601, message: `Method not found: ${method}` } })
})
