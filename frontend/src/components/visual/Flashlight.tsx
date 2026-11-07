import { useEffect, useRef, type CSSProperties } from 'react'
import { BlurBackdrop } from './BlurBackdrop.tsx'

/*
  Cursor light for a section that uses <BlurBackdrop />. Place it right after the backdrop.

  - the fluted glass partly clears around the pointer (an un-refracted copy of the backdrop
    shown through a soft radial mask)
  - a soft-light lift and a faint screen glow, all with the same long falloff (no rim)

  Only runs with a fine pointer and hover, never under reduced motion. Nothing touches React
  state: the beam position goes into CSS variables, and the animation loop only runs while
  the beam is still easing toward the pointer or fading in/out, then goes idle.
*/

/** Tuning. Raise or lower these to taste. */
const TUNING = {
  radius: 380, // px, outer edge of the falloff
  follow: 0.55, // 0..1 per frame at 60fps; higher sticks closer to the pointer
  clearAt: 0.62, // how much the glass clears at the centre (0..1)
  glowAt: 0.16, // screen glow at the centre (0..1)
  liftAt: 0.35, // soft-light lift at the centre, brightens the colour under the beam (0..1)
}

/** Approximate a smooth ease-out falloff with many stops, so there is no hard rim. */
function falloff(peak: number, rgb: string) {
  const stops = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
  return stops
    .map((t) => {
      const a = peak * (1 - t) ** 2.2
      return `rgba(${rgb},${a.toFixed(4)}) ${(t * 100).toFixed(0)}%`
    })
    .join(', ')
}

/** `image`: also show the backdrop image in the clear view (match the BlurBackdrop beside it). */
export function Flashlight({ image = false }: { image?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const host = root?.parentElement
    if (!root || !host) return

    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!canHover || reduced) return

    const beam = { tx: 0, ty: 0, x: 0, y: 0, intensity: 0, inside: false, raf: 0, last: 0 }

    const tick = (now: number) => {
      const dt = beam.last ? Math.min((now - beam.last) / 1000, 0.05) : 1 / 60
      beam.last = now

      const follow = 1 - (1 - TUNING.follow) ** (dt * 60)
      beam.x += (beam.tx - beam.x) * follow
      beam.y += (beam.ty - beam.y) * follow
      const target = beam.inside ? 1 : 0
      beam.intensity += (target - beam.intensity) * (1 - 0.93 ** (dt * 60))

      root.style.setProperty('--fx', `${beam.x.toFixed(1)}px`)
      root.style.setProperty('--fy', `${beam.y.toFixed(1)}px`)
      root.style.setProperty('--fi', beam.intensity.toFixed(3))

      const settled =
        Math.abs(beam.tx - beam.x) < 0.5 &&
        Math.abs(beam.ty - beam.y) < 0.5 &&
        Math.abs(target - beam.intensity) < 0.003
      if (settled) {
        beam.raf = 0
        beam.last = 0
      } else {
        beam.raf = requestAnimationFrame(tick)
      }
    }
    const wake = () => {
      if (!beam.raf) beam.raf = requestAnimationFrame(tick)
    }

    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      beam.tx = e.clientX - rect.left
      beam.ty = e.clientY - rect.top
      if (!beam.inside) {
        // jump on entry instead of sliding in from wherever it left
        beam.x = beam.tx
        beam.y = beam.ty
      }
      beam.inside = true
      wake()
    }
    const onLeave = () => {
      beam.inside = false
      wake()
    }
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(beam.raf)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  const r = TUNING.radius
  const mask = `radial-gradient(circle ${r}px at var(--fx) var(--fy), ${falloff(1, '0,0,0')})`

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ '--fx': '50%', '--fy': '50%', '--fi': 0 } as CSSProperties}
    >
      {/* partial clear view through the glass, strongest at the pointer */}
      <div
        className="absolute inset-0"
        style={{
          opacity: `calc(var(--fi) * ${TUNING.clearAt})`,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      >
        <BlurBackdrop refract={false} image={image} />
      </div>
      {/* lift the colour under the beam */}
      <div
        className="absolute inset-0 mix-blend-soft-light"
        style={{
          opacity: 'var(--fi)',
          background: `radial-gradient(circle ${r * 1.1}px at var(--fx) var(--fy), ${falloff(TUNING.liftAt, '255,255,255')})`,
        }}
      />
      {/* faint glow, same long falloff */}
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{
          opacity: 'var(--fi)',
          background: `radial-gradient(circle ${r}px at var(--fx) var(--fy), ${falloff(TUNING.glowAt, '255,248,240')})`,
        }}
      />
    </div>
  )
}
