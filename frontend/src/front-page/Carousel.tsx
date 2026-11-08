import { useEffect, useRef } from 'react'

import chip from '../assets/cards/chip.png'
import calicco from '../assets/cards/calicco_credit.png'
import debit from '../assets/cards/debit.png'
import shark from '../assets/cards/loan_shark.png'
import venture from '../assets/cards/venture_w.png'
import logo from '../assets/brand/logo-blue.png'

/*
  3D ring carousel. Cards sit on the inside of a cylinder that you look into; the ring
  turns slowly on its own, and you can drag it (with momentum) left or right.

  It shows the Teenacredit wordmark and the five cards a child can choose between, each in a
  landscape white frame with its name underneath. Edit SLOTS to change what is on the ring.

  Sizing: the card count, card size and ring radius are recomputed on resize (see fit()), so
  the nearest side cards always fit the height and the visible arc spans the width.
*/

type Slot = { src: string; caption: string }

const SLOTS: Slot[] = [
  { src: logo, caption: 'Teenacredit' },
  { src: calicco, caption: 'CaliccoCredit, the starter card' },
  { src: debit, caption: 'DeerDebit, your own money' },
  { src: chip, caption: 'ChipOne, a step up' },
  { src: venture, caption: 'Venture <W>, the best rewards' },
  { src: shark, caption: 'The Shark Father. Mind the interest' },
]

const TUNING = {
  /** Distinct image slots. The ring repeats them. */
  images: 6,
  /**
   * Cards on the ring are chosen per screen: as few as possible while the visible arc still
   * spans the full width. Wide, short screens get more (smaller) cards; phones get fewer.
   * The count is always a multiple of `images`, so the sequence repeats without a seam.
   */
  minCards: 12,
  maxCards: 30,
  /** Idle rotation in degrees per second. 0 to stop. */
  autoSpeed: 4,
  /** Degrees of rotation per pixel dragged. */
  dragFactor: 0.06,
  /** Card width / height. Landscape, to fit the credit cards. Cards keep this shape at every size. */
  aspect: 1.3,
  /**
   * Camera distance as a multiple of the ring radius. Lower = stronger fish-eye
   * (small centre card, big side cards). The original mock used 0.91.
   */
  camera: 2.2,
  /** The tallest (nearest, side) card may use this share of the carousel's height. */
  heightShare: 0.94,
  /** The front card is never wider than this share of the carousel's width (phones). */
  maxFrontWidth: 0.42,
  /** Card height cap in px, so very tall screens don't get giant cards. */
  maxCardHeight: 760,
  /** Gap between cards: 0.9 = cards fill 90% of their slot on the ring. */
  fill: 0.9,
  /** Cards beyond this angle from centre are hidden; the last few degrees fade. */
  maxAngle: 78,
  fadeDegrees: 8,
}

type Geometry = { n: number; cw: number; ch: number; R: number; z0: number; P: number }

/**
 * For a ring of n cards of width 1: the largest projected half-height of any visible card
 * corner, and the furthest projected x. Everything scales linearly with card width.
 */
function measure(n: number) {
  const R = n / (2 * Math.PI * TUNING.fill)
  const z0 = R * 0.96
  const P = R * TUNING.camera
  const v = 0.5 / TUNING.aspect
  let halfH = 0
  let maxX = 0
  for (let a = 0; a <= TUNING.maxAngle; a += 1) {
    const r = (a * Math.PI) / 180
    for (const u of [-0.5, 0.5]) {
      // same transform as the cards: translateZ(z0) rotateY(a) translateZ(-R)
      const x = u * Math.cos(r) - R * Math.sin(r)
      const z = -u * Math.sin(r) - R * Math.cos(r) + z0
      const s = P / (P - z)
      halfH = Math.max(halfH, v * s)
      maxX = Math.max(maxX, Math.abs(x * s))
    }
  }
  return { halfH, maxX }
}

/** Size the ring for a W x H stage: no card ever clipped top or bottom, arc fills the width. */
function fit(W: number, H: number): Geometry {
  let n = TUNING.minCards
  let cw = 0
  for (; n <= TUNING.maxCards; n += TUNING.images) {
    const { halfH, maxX } = measure(n)
    cw = Math.min((H * TUNING.heightShare) / (2 * halfH), W * TUNING.maxFrontWidth, TUNING.maxCardHeight * TUNING.aspect)
    if (2 * maxX * cw >= W * 0.94) break // the outermost cards are fading anyway
  }
  n = Math.min(n, TUNING.maxCards - (TUNING.maxCards % TUNING.images))
  const R = (cw * n) / (2 * Math.PI * TUNING.fill)
  return { n, cw, ch: cw / TUNING.aspect, R, z0: R * 0.96, P: R * TUNING.camera }
}

type Motion = {
  rot: number
  vel: number
  dragging: boolean
  lastX: number
  lastT: number
  raf: number
  visible: boolean
  prev: number
}

export function Carousel({ className = '' }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const auto = reduced ? 0 : TUNING.autoSpeed
    const m: Motion = { rot: 0, vel: auto, dragging: false, lastX: 0, lastT: 0, raf: 0, visible: true, prev: 0 }

    const geo: Geometry = fit(stage.clientWidth, stage.clientHeight)
    const resize = () => {
      Object.assign(geo, fit(stage.clientWidth, stage.clientHeight))
      stage.style.perspective = `${geo.P}px`
      // frame padding and caption size follow the card, so small cards still read as polaroids
      stage.style.setProperty('--pad', `${Math.max(4, Math.min(10, geo.cw * 0.05)).toFixed(1)}px`)
      stage.style.setProperty('--cap', `${Math.max(10, Math.min(15, geo.cw * 0.075)).toFixed(1)}px`)
      for (let i = 0; i < TUNING.maxCards; i++) {
        const el = cardRefs.current[i]
        if (!el) continue
        el.style.width = `${geo.cw}px`
        el.style.height = `${geo.ch}px`
        el.style.marginLeft = `${-geo.cw / 2}px`
        el.style.marginTop = `${-geo.ch / 2}px`
      }
      layout()
    }

    const layout = () => {
      const { n, R, z0 } = geo
      const stepA = 360 / n
      for (let i = 0; i < TUNING.maxCards; i++) {
        const el = cardRefs.current[i]
        if (!el) continue
        const a = ((((m.rot + i * stepA) % 360) + 540) % 360) - 180
        const abs = Math.abs(a)
        if (i >= n || abs > TUNING.maxAngle) {
          el.style.visibility = 'hidden'
          continue
        }
        el.style.visibility = 'visible'
        el.style.transform = `translateZ(${z0}px) rotateY(${a}deg) translateZ(${-R}px)`
        el.style.opacity = String(Math.max(0, Math.min(1, (TUNING.maxAngle - abs) / TUNING.fadeDegrees)))
      }
    }

    const tick = (t: number) => {
      const dt = m.prev ? Math.min(0.05, (t - m.prev) / 1000) : 0
      m.prev = t
      if (!m.dragging) {
        // ease back toward the idle speed after a fling
        m.vel += (auto - m.vel) * Math.min(1, dt * 2.2)
        m.rot += m.vel * dt
      }
      layout()
      if (m.visible) m.raf = requestAnimationFrame(tick)
    }
    m.raf = requestAnimationFrame(tick)

    const onDown = (e: PointerEvent) => {
      m.dragging = true
      m.lastX = e.clientX
      m.lastT = performance.now()
      stage.setPointerCapture(e.pointerId)
      stage.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      if (!m.dragging) return
      const now = performance.now()
      const d = -(e.clientX - m.lastX) * TUNING.dragFactor
      m.rot += d
      m.vel = d / Math.max(0.008, (now - m.lastT) / 1000)
      m.lastX = e.clientX
      m.lastT = now
      if (!m.visible) layout()
    }
    const onUp = () => {
      m.dragging = false
      stage.style.cursor = 'grab'
    }
    stage.addEventListener('pointerdown', onDown)
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerup', onUp)
    stage.addEventListener('pointercancel', onUp)

    const io = new IntersectionObserver(([entry]) => {
      const was = m.visible
      m.visible = entry.isIntersecting
      if (m.visible && !was) {
        m.prev = 0
        m.raf = requestAnimationFrame(tick)
      }
    })
    io.observe(stage)

    const ro = new ResizeObserver(resize)
    resize()
    ro.observe(stage)

    return () => {
      cancelAnimationFrame(m.raf)
      io.disconnect()
      ro.disconnect()
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return (
    <div
      ref={stageRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="The Teenacredit cards. Drag to turn."
      className={`relative w-full cursor-grab touch-pan-y overflow-hidden select-none ${className}`}
    >
      {Array.from({ length: TUNING.maxCards }, (_, i) => {
        const slot = SLOTS[i % SLOTS.length]
        return (
          <div
            key={i}
            ref={(el) => {
              cardRefs.current[i] = el
            }}
            /* A polaroid: white frame, the picture in a window, a deeper strip below for the caption. */
            className="invisible absolute top-1/2 left-1/2 flex flex-col border border-ink/15 bg-white px-(--pad) pt-(--pad) [backface-visibility:hidden] will-change-transform"
          >
            <div className="relative flex-1 overflow-hidden bg-white">
              <img
                src={slot.src}
                alt={slot.caption}
                draggable={false}
                className="pointer-events-none absolute inset-0 size-full object-contain p-[4%]"
              />
            </div>
            <p className="flex h-[17%] shrink-0 items-center truncate px-0.5 text-(length:--cap) leading-tight text-ink/75">
              {slot.caption}
            </p>
          </div>
        )
      })}
    </div>
  )
}
