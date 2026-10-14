import { bigText, bucket, leaderLine, sparkRows, stretch } from './charts'
import type { Summary } from './stats'
import { compact, topWithOther } from './stats'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dateLabel(day: string): string {
  const [, month, date] = day.split('-').map(Number)
  return `${MONTHS[month! - 1]} ${date}`
}

/**
 * The receipt as plain text, for where no pane is drawn (a desktop app that places none): the same
 * lines as the pane, in a code block so they keep their alignment.
 */
export function receiptText(sum: Summary, period: string, closedIssues: string, footer: string, width = 56): string {
  const share = (value: number) => `${Math.round((value / Math.max(1, sum.tokens)) * 100)}%`
  const line = (name: string, columns: string[]) => {
    const parts = leaderLine(name, columns, width)
    return `${parts.name}${parts.leader}${parts.tail}`
  }
  const spark = sparkRows(stretch(bucket(sum.daily.map(day => day.tokens), width), width), 2)
  const first = sum.daily[0]?.day
  const last = sum.daily[sum.daily.length - 1]?.day
  const dates = first && last ? dateLabel(first).padEnd(Math.max(0, (spark[0]?.length ?? 0) - dateLabel(last).length)) + dateLabel(last) : ''
  const models = topWithOther(sum.byModel, 4)

  const lines = [
    ...bigText(compact(sum.tokens)),
    `tokens in ${period}`,
    '',
    `${compact(sum.prompts)} prompts   ${compact(sum.sessions)} sessions   ${closedIssues} issues closed`,
    '',
    ...spark,
    dates,
    '',
    'Projects',
    ...topWithOther(sum.byProject, 5).map(slice => line(slice.label, [compact(slice.value), share(slice.value)])),
    '',
    'Models',
    ...models.map(slice => line(slice.label, [compact(slice.value), share(slice.value)])),
    '',
    footer,
  ]

  return ['```', ...lines, '```'].join('\n')
}
