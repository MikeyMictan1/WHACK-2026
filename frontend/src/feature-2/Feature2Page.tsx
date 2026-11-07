import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader.tsx'
import { Button } from '../components/ui/Button.tsx'
import { api } from '../lib/api.ts'

const SIZE = 16
const BLUE = '#0050ff'

type Grid = {
  connected: boolean
  port: string | null
  size: number
  pixels: (string | null)[][]
}

const empty = (): (string | null)[][] => Array.from({ length: SIZE }, () => Array(SIZE).fill(null))

export function Feature2Page() {
  const [pixels, setPixels] = useState(empty)
  const [device, setDevice] = useState<{ connected: boolean; port: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apply = (g: Grid) => {
    setPixels(g.pixels)
    setDevice({ connected: g.connected, port: g.port })
  }

  useEffect(() => {
    api<Grid>('/feature-2/grid')
      .then(apply)
      .catch((e: Error) => setError(e.message))
  }, [])

  const send = (path: string, json?: unknown) =>
    api<Grid>(path, { method: 'POST', json })
      .then((g) => {
        apply(g)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))

  const toggle = (x: number, y: number) => {
    const color = pixels[y][x] ? null : BLUE
    setPixels((p) => p.map((row, ry) => (ry === y ? row.map((c, rx) => (rx === x ? color : c)) : row)))
    void send('/feature-2/grid/pixel', { x, y, color })
  }

  return (
    <>
      <PageHeader
        marker="02"
        title="Feature 2"
        description="Tap a square to light it blue on the 16×16 Unicorn display. Tap it again to switch it off."
      />

      <section className="container-x py-10 md:py-14">
        <div className="flex flex-wrap items-center justify-between gap-4 border-y border-ink py-4">
          <span className="text-sm font-medium">
            {device === null ? (
              <span className="text-ink/50">Checking display…</span>
            ) : device.connected ? (
              <span className="text-ink/70">Unicorn connected{device.port ? ` on ${device.port}` : ''}</span>
            ) : (
              <span className="text-red-600">Unicorn not plugged in</span>
            )}
          </span>
          <Button size="sm" onClick={() => void send('/feature-2/grid/clear')}>
            Clear
          </Button>
        </div>

        {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

        <div
          className="mx-auto mt-8 grid w-full max-w-[560px] gap-[3px] bg-ink p-[6px]"
          style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
        >
          {pixels.map((row, y) =>
            row.map((color, x) => (
              <button
                key={`${x}-${y}`}
                type="button"
                aria-label={`Pixel ${x + 1}, ${y + 1}${color ? ', on' : ''}`}
                aria-pressed={color !== null}
                onClick={() => toggle(x, y)}
                className="aspect-square bg-ink-2 hover:outline hover:outline-1 hover:outline-white/40"
                style={color ? { backgroundColor: color, boxShadow: `0 0 8px ${color}` } : undefined}
              />
            )),
          )}
        </div>
      </section>
    </>
  )
}
