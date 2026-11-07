import { TextLink } from '../components/ui/Button.tsx'
import { signed } from '../lib/format.ts'
import { formatDate, type CreditSummary, type ScoreFactor, type ScoreInfo, type ScorePoint } from '../credit/creditApi.ts'

/**
 * The credit score on the Monthly review: the number, what it is made of, why it moved last month and how it
 * has moved over time. All the numbers come from the backend; this only draws them.
 */
export function ScoreSection({ summary }: { summary: CreditSummary }) {
  const sc = summary.score
  if (!summary.score_enabled || !sc) {
    return (
      <div className="mt-12 border border-ink/20 bg-sky p-6">
        <p className="meta text-ink/70">Credit score</p>
        <p className="mt-2 max-w-prose text-lead">
          Credit score tracking is switched off for your account. If your parent turns it on, your score will show here
          with the reasons it moves.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <h2 className="text-d3 font-light tracking-[-0.02em]">Credit score</h2>
        <TextLink to="/learn#score">How the score works</TextLink>
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,280px)_1fr]">
        <div>
          <p className="text-d1 font-light tabular-nums" aria-label={`Credit score ${sc.score} out of ${sc.max_score}`}>
            {sc.score}
          </p>
          <p className="mt-1 text-lead">
            {sc.band}
            {sc.change !== null && <span className="text-muted"> · {signed(sc.change)} last month</span>}
          </p>
          <div className="mt-4">
            <Bar value={sc.score - sc.min_score} max={sc.max_score - sc.min_score} label="Score on the 300 to 800 scale" />
            <div className="meta mt-1 flex justify-between">
              <span>{sc.min_score}</span>
              <span>{sc.max_score}</span>
            </div>
          </div>
          <p className="mt-4 max-w-prose text-sm">
            {sc.next_unlock
              ? `${sc.next_unlock.card_name} unlocks at ${sc.next_unlock.min_score}. You need ${sc.next_unlock.points_needed} more ${
                  sc.next_unlock.points_needed === 1 ? 'point' : 'points'
                }.`
              : 'Your score is high enough for every card.'}
          </p>
        </div>

        <ul className="flex flex-col gap-6">
          {sc.factors.map((f) => (
            <FactorRow key={f.key} factor={f} />
          ))}
        </ul>
      </div>

      <h3 className="mt-12 text-d4 font-medium">Why it moved last month</h3>
      <Reasons score={sc} />

      <h3 className="mt-12 text-d4 font-medium">Your score over time</h3>
      <div className="mt-4">
        <ScoreChart points={sc.history} min={sc.min_score} max={sc.max_score} />
      </div>
    </div>
  )
}

export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = Math.max(0, Math.min(100, Math.round((value / max) * 100)))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-3 border border-ink"
    >
      <div className="h-full bg-ink" style={{ width: `${percent}%` }} />
    </div>
  )
}

export function FactorRow({ factor }: { factor: ScoreFactor }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-medium">{factor.name}</p>
        <p className="tabular-nums">
          {factor.points} <span className="text-muted">of {factor.max_points}</span>
        </p>
      </div>
      <div className="mt-2">
        <Bar value={factor.points} max={factor.max_points} label={`${factor.name}: ${factor.points} of ${factor.max_points} points`} />
      </div>
      <p className="mt-2 max-w-prose text-sm text-muted">{factor.note}</p>
    </li>
  )
}

export function Reasons({ score }: { score: ScoreInfo }) {
  if (score.reasons.length === 0) {
    return (
      <p className="mt-4 max-w-prose text-muted">
        Nothing to explain yet. Your score changes each time a statement is issued, and you will see exactly why here.
      </p>
    )
  }
  return (
    <ul className="mt-4 border-t border-ink">
      {score.reasons.map((r, i) => (
        <li key={`${r.factor}-${i}`} className="flex gap-4 border-b border-ink/15 py-4">
          <span className="w-12 shrink-0 font-medium tabular-nums">{signed(r.delta)}</span>
          <span>
            <span className="block">{r.reason}</span>
            <span className="meta">{r.factor_name}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** A plain line chart of the score by month, with the band edges (Fair, Good, Excellent) marked. */
export function ScoreChart({ points, min, max }: { points: ScorePoint[]; min: number; max: number }) {
  if (points.length < 2) {
    return <p className="max-w-prose text-muted">Your history builds up here after your first statement.</p>
  }
  const W = 600
  const H = 170
  const padX = 44 // room on the left for the band labels
  const padY = 18
  // Fit the vertical scale to the scores so the line uses the whole chart (never beyond 300 to 800).
  const scores = points.map((p) => p.score)
  const lo = Math.max(min, Math.floor((Math.min(...scores) - 30) / 10) * 10)
  const hi = Math.min(max, Math.ceil((Math.max(...scores) + 30) / 10) * 10)
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (points.length - 1)
  const y = (score: number) => padY + ((hi - score) * (H - 2 * padY)) / (hi - lo)
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Score history: ${points.map((p) => `month ${p.month}, ${p.score}`).join('; ')}`}
        className="w-full border border-ink/20 bg-white"
      >
        {[580, 670, 740].filter((edge) => edge > lo && edge < hi).map((edge) => (
          <g key={edge}>
            <line x1={padX} x2={W - padX} y1={y(edge)} y2={y(edge)} className="stroke-ink/20" strokeDasharray="3 4" />
            <text x={6} y={y(edge) + 3} fontSize={10} className="fill-muted">
              {edge}
            </text>
          </g>
        ))}
        <polyline points={points.map((p, i) => `${x(i)},${y(p.score)}`).join(' ')} fill="none" className="stroke-ink" strokeWidth={2} />
        {points.map((p, i) => (
          <g key={p.month}>
            <circle cx={x(i)} cy={y(p.score)} r={4} className="fill-signal stroke-ink" strokeWidth={1.5} />
            <text x={x(i)} y={y(p.score) - 9} fontSize={11} textAnchor="middle" className="fill-ink">
              {p.score}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="meta mt-2">
        From {first.score} when your account started ({formatDate(first.date)}) to {last.score} now. Each point is one
        statement.
      </figcaption>
    </figure>
  )
}
