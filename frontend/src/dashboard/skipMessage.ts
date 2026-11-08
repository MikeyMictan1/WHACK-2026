import { STATUS_LABEL, formatDate, type SkipResult } from '../credit/creditApi.ts'
import { formatMoney } from '../lib/money.ts'

/** What skipping a month did, in a sentence or two. */
export function skipMessage(r: SkipResult): string {
  const parts = [`${r.child_name}: a month passed`]
  if (r.allowance > 0) parts.push(`${formatMoney(r.allowance)} allowance paid`)
  if (r.previous_number !== null && r.outcome) {
    const label = r.outcome === 'paid' ? STATUS_LABEL.paid : r.outcome === 'carried' ? STATUS_LABEL.carried : STATUS_LABEL.late
    parts.push(`statement ${r.previous_number}: ${label.toLowerCase()}`)
  }
  if (r.interest > 0) parts.push(`${formatMoney(r.interest)} interest`)
  if (r.late_fee > 0) parts.push(`${formatMoney(r.late_fee)} late fee`)
  if (r.statement) parts.push(`new statement ${r.statement.number}: ${formatMoney(r.statement.total)} due ${formatDate(r.statement.due_date)}`)
  if (r.score_enabled && r.score_before !== null && r.score_after !== null) {
    parts.push(
      r.score_before === r.score_after ? `score stayed at ${r.score_after}` : `score ${r.score_before} to ${r.score_after}`,
    )
  }
  return parts.join(', ')
}
