import { expect, test } from 'claude-code/testing'

import { partsOf } from '../hooks/markdown'

test('a long answer is cut at its headings, never inside a code block', async () => {
  const section = (n: number) => [`## Part ${n}`, '', 'word '.repeat(120).trim(), '', '```', '## not a heading', '```'].join('\n')
  const answer = [1, 2, 3, 4].map(section).join('\n\n')
  const parts = partsOf(answer, 1200)
  expect(parts.length).toBeGreaterThan(1)
  for (const part of parts) expect(part.startsWith('## Part')).toBe(true)
  expect(parts.join('\n\n')).toBe(answer)
  expect(partsOf('short answer', 1200)).toEqual(['short answer'])
})
