import { useHealth } from './useHealth.ts'

/**
 * Illustrative dashboard standing in for a real product screenshot.
 * The numbers are sample data; only the status line in the title bar is live.
 */

const NAV = ['Overview', 'Feature 1', 'Feature 2', 'AI Feature']

const BARS = [34, 46, 40, 52, 47, 58, 54, 44, 57, 65, 61, 70, 63, 57, 68, 73, 79, 100, 76, 69, 64, 71, 60, 67]
const PEAK = 17

const STATS = [
  { label: 'Requests', value: '48,210' },
  { label: 'Accounts', value: '1,284' },
  { label: 'Median latency', value: '6 ms' },
]

const LOG = [
  { method: 'POST', path: '/api/auth/register', code: 201, ms: 14 },
  { method: 'GET', path: '/api/feature-1', code: 200, ms: 6 },
  { method: 'GET', path: '/api/auth/me', code: 200, ms: 4 },
  { method: 'POST', path: '/api/auth/login', code: 200, ms: 11 },
]

function LiveStatus() {
  const health = useHealth()
  const text =
    health.state === 'ok'
      ? `GET /api/health  200  ${health.ms} ms`
      : health.state === 'offline'
        ? 'GET /api/health  backend offline'
        : 'GET /api/health  ···'
  return <span className="font-mono text-[11px] whitespace-pre text-muted">{text}</span>
}

export function ProductMock() {
  return (
    <div className="border border-ink/15 bg-white">
      {/* title bar */}
      <div className="flex h-10 items-center justify-between gap-4 border-b border-line px-4">
        <span className="text-sm font-medium">Whack</span>
        <LiveStatus />
      </div>

      <div className="grid md:grid-cols-[208px_1fr]">
        <aside className="hidden border-r border-line md:block">
          <ul className="py-3">
            {NAV.map((item, i) => (
              <li
                key={item}
                className={`px-4 py-2 text-sm ${i === 0 ? 'bg-sky font-medium text-ink' : 'text-muted'}`}
              >
                {item}
              </li>
            ))}
          </ul>
        </aside>

        <div className="p-5 md:p-8">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-d4 font-bold">Overview</p>
            <p className="meta">Last 30 days</p>
          </div>

          <dl className="mt-6 grid grid-cols-3 border-y border-line">
            {STATS.map((s, i) => (
              <div key={s.label} className={`py-4 ${i > 0 ? 'border-l border-line pl-4 md:pl-6' : ''}`}>
                <dt className="meta">{s.label}</dt>
                <dd className="mt-1 text-xl font-bold md:text-d3">{s.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex items-baseline justify-between">
            <p className="text-sm font-medium">Requests per day</p>
            <p className="meta">Peak 3,412 on 23 Oct</p>
          </div>
          <div className="mt-4 flex h-32 items-end gap-[3px] border-b border-ink md:h-40 md:gap-1.5">
            {BARS.map((h, i) => (
              <div
                key={i}
                className={`flex-1 ${i === PEAK ? 'bg-ink' : 'bg-sky-2'}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
            <span>06 Oct</span>
            <span>20 Oct</span>
            <span>04 Nov</span>
          </div>

          <table className="mt-8 w-full font-mono text-[11px] md:text-xs">
            <thead>
              <tr className="border-b border-ink text-left text-muted">
                <th className="pb-2 font-medium">Method</th>
                <th className="pb-2 font-medium">Path</th>
                <th className="pb-2 text-right font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {LOG.map((l) => (
                <tr key={l.path} className="border-b border-line">
                  <td className="py-2.5 text-muted">{l.method}</td>
                  <td className="py-2.5">{l.path}</td>
                  <td className="py-2.5 text-right">{l.code}</td>
                  <td className="py-2.5 text-right text-muted">{l.ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
