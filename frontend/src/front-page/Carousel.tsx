import { useEffect, useRef } from 'react'

/*
  3D ring carousel. Cards sit on the inside of a cylinder that you look into; the ring
  turns slowly on its own, and you can drag it (with momentum) left or right.

  IMAGES: drop up to 6 files into  frontend/src/assets/carousel/  (jpg, png, webp, avif).
  They are used in filename order (01.jpg, 02.jpg …) and repeat around the ring.
  Each card is a solid white frame with the image in a window.
  Any of the 6 slots without a file shows a plain grey placeholder with its expected name.

  Ported from the "Whack Frontpage" mock: same geometry and motion, square cards.
*/

/**
 * One caption per image, in filename order (1.png, 2.png …). Shown on the polaroid strip
 * under each picture and used as the image's alt text. Edit these freely.
 */
const CAPTIONS = [
  'Chip, our mascot',
  'Caption for image 2',
  'Caption for image 3',
  'Caption for image 4',
  'Caption for image 5',
  'Caption for image 6',
]

const TUNING = {
  /** Distinct image slots. The ring repeats them. */
  images: 6,
  /** Cards on the ring. More = denser ring; must be at least `images`. */
  cards: 15,
  /** Idle rotation in degrees per second. 0 to stop. */
  autoSpeed: 4,
  /** Degrees of rotation per pixel dragged. */
  dragFactor: 0.06,
  /** Card width / height. 0.75 = portrait 3:4. Cards keep this shape at every size. */
  aspect: 0.75,
  /** Card height as a share of the carousel's height (the front card shows at about this size). */
  heightShare: 0.74,
  /**
   * Camera distance as a multiple of the ring radius. Lower = stronger fish-eye
   * (small centre card, big side cards). The original mock used 0.91.
   */
  camera: 1.6,
  /** Card height cap in px, so very tall screens don't get giant cards. */
  maxCardHeight: 760,
  /** Gap between cards: 0.9 = cards fill 90% of their slot on the ring. */
  fill: 0.9,
  /** Cards beyond this angle from centre are hidden; the last few degrees fade. */
  maxAngle: 78,
  fadeDegrees: 8,
}

const files = import.meta.glob<string>('../assets/carousel/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default',
})

type Slot = { src?: string; label: string; caption: string }

const SLOTS: Slot[] = (() => {
  const urls = Object.keys(files)
    .sort()
    .slice(0, TUNING.images)
    .map((key) => files[key])
  return Array.from({ length: TUNING.images }, (_, i) => ({
    src: urls[i],
    label: `carousel/${String(i + 1).padStart(2, '0')}.jpg`,
    caption: CAPTIONS[i] ?? '',
  }))
})()

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

    const layout = () => {
      const W = stage.clientWidth
      const H = stage.clientHeight
      const n = TUNING.cards
      const stepA = 360 / n

      // Size the cards from the space available, keeping their shape fixed:
      // as tall as the stage allows, but never so wide the ring overflows a narrow screen.
      const byHeight = Math.min(H * TUNING.heightShare, TUNING.maxCardHeight)
      const byWidth = (W * 0.62) / TUNING.aspect
      const ch = Math.min(byHeight, byWidth)
      const cw = ch * TUNING.aspect

      // The ring radius follows from the card width, and the camera follows the ring,
      // so the 3D look is identical at any size. The front card sits just behind the
      // screen plane, so it shows at nearly its full size.
      const R = (cw * n) / (2 * Math.PI * TUNING.fill)
      const P = R * TUNING.camera
      const z0 = R * 0.96
      stage.style.perspective = `${P}px`

      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i]
        if (!el) continue
        const a = ((((m.rot + i * stepA) % 360) + 540) % 360) - 180
        const abs = Math.abs(a)
        if (abs > TUNING.maxAngle) {
          el.style.visibility = 'hidden'
          continue
        }
        el.style.visibility = 'visible'
        el.style.width = `${cw}px`
        el.style.height = `${ch}px`
        el.style.marginLeft = `${-cw / 2}px`
        el.style.marginTop = `${-ch / 2}px`
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

    const ro = new ResizeObserver(layout)
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
      aria-label="Product images. Drag to turn."
      className={`relative w-full cursor-grab touch-pan-y overflow-hidden select-none ${className}`}
    >
      {Array.from({ length: TUNING.cards }, (_, i) => {
        const slot = SLOTS[i % SLOTS.length]
        return (
          <div
            key={i}
            ref={(el) => {
              cardRefs.current[i] = el
            }}
            /* A polaroid: white frame, the picture in a window, a deeper strip below for the caption. */
            className="invisible absolute top-1/2 left-1/2 flex flex-col border border-ink/15 bg-white px-2.5 pt-2.5 [backface-visibility:hidden] will-change-transform"
          >
            <div className="relative flex-1 overflow-hidden bg-[#eef1f5]">
              {slot.src ? (
                <img
                  src={slot.src}
                  alt={slot.caption}
                  draggable={false}
                  className="pointer-events-none absolute inset-0 size-full object-cover"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-sm text-ink/40">
                  {slot.label}
                </span>
              )}
            </div>
            <p className="flex h-[17%] min-h-10 shrink-0 items-center truncate px-1 text-sm text-ink/75 md:text-[15px]">
              {slot.caption}
            </p>
          </div>
        )
      })}
    </div>
  )
}
