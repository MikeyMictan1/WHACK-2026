import { useEffect, useRef, type CSSProperties } from 'react'
import { BlurBackdrop } from './BlurBackdrop.tsx'

/*
  Cursor light for a section that uses <BlurBackdrop />. Place it right after the backdrop.

  THE BEAM
  - the fluted glass partly clears around the pointer (an un-refracted copy of the backdrop
    shown through a soft radial mask)
  - a soft-light lift and a faint screen glow, all with the same long falloff (no rim)

  THE DUST
  Dust is not spawned at the cursor. A persistent field of it fills the whole section, the
  way dust fills a room; you only see the specks the beam lights. That is what makes it
  read as real: motes drift into the light, glint, and drift out again.

  Each speck lives at a depth z (0 far … 1 near):
  - far dust is tiny, sharp and slow; near dust is larger and crosses the screen faster
  - the nearest specks are out of focus and render as soft bokeh discs on a second canvas
    that floats above the page content, so the dust has real depth

  Four kinds:
  - motes   irregular grains (pre-rendered polygon sprites) that rotate and shimmer, and
            stretch into a short streak when the air moves them fast
  - fibres  thin lint strands that curl, flex and turn slowly
  - flakes  flat flecks that tumble; they foreshorten edge-on and flash when face-on
  - bokeh   near motes, defocused into discs with a slightly brighter rim, like a lens

  Motion: every speck relaxes toward the local air velocity, which is the curl of a slowly
  evolving stream function (divergence-free, so the dust swirls in eddies rather than
  bunching up), plus a faint breeze, per-speck buoyancy (some rise, some settle) and a little
  Brownian jitter. A moving pointer drags the air along its path and sheds a small eddy, so
  waving the cursor stirs the dust, which then settles back into the drift.

  Only runs with a fine pointer and hover, never under reduced motion, and the loop stops
  while the section is off screen or the beam is fully faded. Nothing touches React state
  per frame: the beam position goes into CSS variables and the dust draws to canvases.
*/

/** Tuning. Raise or lower these to taste. */
const TUNING = {
  // beam
  radius: 380, // px, outer edge of the falloff
  follow: 0.55, // 0..1 per frame at 60fps; higher sticks closer to the pointer
  clearAt: 0.62, // how much the glass clears at the centre (0..1)
  glowAt: 0.16, // screen glow at the centre (0..1)
  liftAt: 0.35, // soft-light lift at the centre, brightens the colour under the beam (0..1)

  // dust
  dustPerPx: 1 / 3800, // specks per px² of the section
  minDust: 120,
  maxDust: 520,
  dustReach: 1.05, // dust is lit out to this multiple of the beam radius
  dustBrightness: 1.25, // overall dust brightness
  dustFalloff: 1.7, // how quickly dust fades toward the beam edge (higher = tighter pool of light)
  wake: 0.32, // how strongly a moving pointer drags the air (0 = not at all)
  swirl: 0.1, // how strong the eddy behind a moving pointer is
}

const TAU = Math.PI * 2

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

/* ---------------------------------------------------------------- dust model */

const MOTE = 0
const FIBRE = 1
const FLAKE = 2
const BOKEH = 3
type Kind = typeof MOTE | typeof FIBRE | typeof FLAKE | typeof BOKEH

/** Depth beyond which a mote is out of focus and drawn as bokeh, in front of the content. */
const NEAR = 0.74

type Dust = {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  z: number
  /** grain diameter for motes / flakes / bokeh, length for fibres (px) */
  size: number
  angle: number
  spin: number // rad/s
  tumble: number // phase of the 3D tumble, drives shimmer, foreshortening and glints
  tumbleRate: number // rad/s
  buoyancy: number // px/s, positive sinks
  response: number // 1/s, how quickly it follows the air (light things follow faster)
  sprite: number
  bend: number // fibre curvature, px
  frayed: boolean // fibre has a small offshoot
}

function seedDust(width: number, height: number): Dust[] {
  const count = Math.round(
    Math.min(TUNING.maxDust, Math.max(TUNING.minDust, width * height * TUNING.dustPerPx)),
  )
  const list: Dust[] = []
  for (let i = 0; i < count; i++) {
    const roll = Math.random()
    let kind: Kind = roll < 0.11 ? FIBRE : roll < 0.19 ? FLAKE : MOTE
    // skewed toward far: most dust is small and distant, a few specks are close
    let z = Math.random() ** 1.6
    if (kind !== MOTE) z = Math.min(z, NEAR - 0.06) // fibres and flakes stay in focus
    if (kind === MOTE && z >= NEAR) kind = BOKEH

    const size =
      kind === FIBRE
        ? 8 + Math.random() * 14 + z * 8
        : kind === FLAKE
          ? 1.5 + z * 2.6 + Math.random() * 0.8
          : kind === BOKEH
            ? 8 + ((z - NEAR) / (1 - NEAR)) * 16 + Math.random() * 5
            : 0.9 + z ** 1.1 * 2.6 + Math.random() * 0.7

    list.push({
      kind,
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0,
      z,
      size,
      angle: Math.random() * TAU,
      spin: (Math.random() - 0.5) * (kind === FIBRE ? 0.45 : 1.6),
      tumble: Math.random() * TAU,
      tumbleRate: (Math.random() - 0.5) * (kind === FLAKE ? 3.4 : 2.2),
      buoyancy: (Math.random() - 0.45) * (kind === FIBRE ? 3.5 : 6.5),
      response: kind === FIBRE ? 3.4 : kind === FLAKE ? 1.3 : 2.1,
      sprite: Math.floor(Math.random() * SPECK_VARIANTS),
      bend: (Math.random() - 0.5) * 7,
      frayed: Math.random() < 0.45,
    })
  }
  // far to near, so nearer specks draw on top
  return list.sort((a, b) => a.z - b.z)
}

/* ---------------------------------------------------------------- air */

const AIR = { x: 0, y: 0 }
const K1 = TAU / 900
const K2 = TAU / 700
const K3 = TAU / 430
const K4 = TAU / 520

/**
 * Air velocity at (x, y) at time t, in px/s, written into AIR.
 * It is the curl of a stream function made of two drifting sinusoid layers, so it is
 * divergence-free: dust swirls in slow eddies and never piles up in one place.
 */
function airAt(x: number, y: number, t: number) {
  const s1 = 9 // px/s, large slow eddies
  const s2 = 5 // px/s, smaller eddies on top
  const a = K1 * x + 0.05 * t
  const b = K2 * y + 0.07 * t
  const c = K3 * x - 0.04 * t + 1.7
  const d = K4 * y + 0.06 * t
  const sa = Math.sin(a)
  const ca = Math.cos(a)
  const sb = Math.sin(b)
  const cb = Math.cos(b)
  const sc = Math.sin(c)
  const cc = Math.cos(c)
  const sd = Math.sin(d)
  const cd = Math.cos(d)
  // vx = dψ/dy, vy = -dψ/dx
  AIR.x = s1 * sa * cb - s2 * sc * sd + 2.5 * Math.sin(t * 0.031) // + a faint wandering breeze
  AIR.y = -(s1 * (K1 / K2) * ca * sb + s2 * (K3 / K4) * cc * cd) - 1.2 + Math.sin(t * 0.023 + 1)
}

/* ---------------------------------------------------------------- sprites */

const SPECK = 32 // sprite size, px
const SPECK_GRAIN = 0.32 // grain diameter as a share of the sprite (the rest is scatter halo)
const SPECK_VARIANTS = 6

type Sprites = { specks: HTMLCanvasElement[]; bokeh: HTMLCanvasElement }

function canvas(size: number) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return c
}

/** An irregular grain with a faint scatter halo. Some variants are a touch cooler. */
function makeSpeck(cool: boolean) {
  const c = canvas(SPECK)
  const g = c.getContext('2d')
  if (!g) return c
  const mid = SPECK / 2
  const rgb = cool ? '236,244,255' : '255,250,242'

  const halo = g.createRadialGradient(mid, mid, 0, mid, mid, mid)
  halo.addColorStop(0, `rgba(${rgb},0.32)`)
  halo.addColorStop(0.3, `rgba(${rgb},0.1)`)
  halo.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = halo
  g.fillRect(0, 0, SPECK, SPECK)

  const verts = 5 + Math.floor(Math.random() * 4)
  const radius = (SPECK * SPECK_GRAIN) / 2
  const squash = 0.55 + Math.random() * 0.4
  g.beginPath()
  for (let i = 0; i < verts; i++) {
    const a = (i / verts) * TAU + Math.random() * 0.7
    const r = radius * (0.45 + Math.random() * 0.55)
    const px = mid + Math.cos(a) * r
    const py = mid + Math.sin(a) * r * squash
    if (i === 0) g.moveTo(px, py)
    else g.lineTo(px, py)
  }
  g.closePath()
  g.fillStyle = `rgb(${rgb})`
  g.fill()
  return c
}

/** A defocused disc with a slightly brighter rim, like real lens bokeh. */
function makeBokeh() {
  const size = 64
  const c = canvas(size)
  const g = c.getContext('2d')
  if (!g) return c
  const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, 'rgba(255,255,255,0.42)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.48)')
  grad.addColorStop(0.82, 'rgba(255,255,255,0.7)')
  grad.addColorStop(0.93, 'rgba(255,255,255,0.22)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.beginPath()
  g.arc(r, r, r, 0, TAU)
  g.fill()
  return c
}

function makeSprites(): Sprites {
  return {
    specks: Array.from({ length: SPECK_VARIANTS }, (_, i) => makeSpeck(i >= 4)),
    bokeh: makeBokeh(),
  }
}

/* ---------------------------------------------------------------- drawing */

function drawMote(ctx: CanvasRenderingContext2D, dpr: number, p: Dust, light: number, sprite: HTMLCanvasElement) {
  // tumbling grains catch the light unevenly
  const shimmer = 0.6 + 0.4 * Math.sin(p.tumble) ** 2
  // fast-moving dust smears into a short streak along its path (motion blur)
  const speed = Math.hypot(p.vx, p.vy)
  const stretch = 1 + Math.min(speed / 140, 1.6)
  const angle = stretch > 1.15 ? Math.atan2(p.vy, p.vx) : p.angle
  const alpha = (light * (0.72 + 0.28 * (1 - p.z)) * shimmer) / Math.sqrt(stretch)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const size = p.size / SPECK_GRAIN
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.setTransform(c * dpr * stretch, s * dpr * stretch, -s * dpr, c * dpr, p.x * dpr, p.y * dpr)
  ctx.drawImage(sprite, -size / 2, -size / 2, size, size)
}

function drawFlake(ctx: CanvasRenderingContext2D, dpr: number, p: Dust, light: number, sprite: HTMLCanvasElement) {
  // 1 = facing us, 0 = edge-on. It foreshortens as it tumbles and flashes when face-on.
  const face = Math.abs(Math.cos(p.tumble))
  const glint = face ** 18
  const alpha = light * (0.14 + 0.95 * glint)
  const squash = Math.max(0.14, face)
  const c = Math.cos(p.angle)
  const s = Math.sin(p.angle)
  const size = p.size / SPECK_GRAIN
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.setTransform(c * dpr, s * dpr, -s * dpr * squash, c * dpr * squash, p.x * dpr, p.y * dpr)
  ctx.drawImage(sprite, -size / 2, -size / 2, size, size)
}

function drawFibre(ctx: CanvasRenderingContext2D, dpr: number, p: Dust, light: number) {
  const alpha = Math.min(1, light * 0.5)
  const half = p.size / 2
  const c = Math.cos(p.angle)
  const s = Math.sin(p.angle)
  // the strand flexes slightly as it drifts
  const bend = p.bend * (0.7 + 0.3 * Math.sin(p.tumble))
  const x0 = p.x - c * half
  const y0 = p.y - s * half
  const x1 = p.x + c * half
  const y1 = p.y + s * half
  const cx = p.x - s * bend
  const cy = p.y + c * bend

  ctx.globalAlpha = 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, 'rgba(255,250,244,0)')
  g.addColorStop(0.3, `rgba(255,250,244,${alpha.toFixed(3)})`)
  g.addColorStop(0.75, `rgba(255,250,244,${(alpha * 0.8).toFixed(3)})`)
  g.addColorStop(1, 'rgba(255,250,244,0)')
  ctx.strokeStyle = g
  ctx.lineWidth = 0.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.quadraticCurveTo(cx, cy, x1, y1)
  ctx.stroke()

  if (p.frayed) {
    // a short offshoot partway along, like a frayed thread
    const t = 0.62
    const u = 1 - t
    const bx = u * u * x0 + 2 * u * t * cx + t * t * x1
    const by = u * u * y0 + 2 * u * t * cy + t * t * y1
    const a = p.angle + 0.55
    const len = half * 0.45
    ctx.strokeStyle = `rgba(255,250,244,${(alpha * 0.55).toFixed(3)})`
    ctx.lineWidth = 0.45
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len)
    ctx.stroke()
  }
}

function drawBokeh(ctx: CanvasRenderingContext2D, dpr: number, p: Dust, light: number, sprite: HTMLCanvasElement) {
  ctx.globalAlpha = Math.min(1, light * 0.17 * (0.8 + 0.2 * Math.sin(p.tumble)))
  ctx.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr)
  ctx.drawImage(sprite, -p.size / 2, -p.size / 2, p.size, p.size)
}

/* ---------------------------------------------------------------- component */

type Sim = {
  width: number
  height: number
  dpr: number
  targetX: number
  targetY: number
  lastTargetX: number
  lastTargetY: number
  x: number
  y: number
  pointerVX: number
  pointerVY: number
  inside: boolean
  intensity: number
  raf: number
  visible: boolean
  lastTime: number
  time: number
  dust: Dust[]
  drew: boolean
}

const MAX_POINTER_SPEED = 1600 // px/s

/** `image`: also show the backdrop image in the clear view (match the BlurBackdrop beside it). */
export function Flashlight({ image = false }: { image?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLCanvasElement>(null)
  const frontRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const back = backRef.current
    const front = frontRef.current
    const host = root?.parentElement
    if (!root || !back || !front || !host) return

    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!canHover || reduced) return

    const backCtx = back.getContext('2d')
    const frontCtx = front.getContext('2d')
    if (!backCtx || !frontCtx) return

    const sprites = makeSprites()
    const sim: Sim = {
      width: 0,
      height: 0,
      dpr: 1,
      targetX: 0,
      targetY: 0,
      lastTargetX: 0,
      lastTargetY: 0,
      x: 0,
      y: 0,
      pointerVX: 0,
      pointerVY: 0,
      inside: false,
      intensity: 0,
      raf: 0,
      visible: true,
      lastTime: 0,
      time: 0,
      dust: [],
      drew: false,
    }

    const resize = () => {
      const rect = host.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const oldArea = sim.width * sim.height
      const newArea = rect.width * rect.height
      sim.width = rect.width
      sim.height = rect.height
      sim.dpr = dpr
      for (const c of [back, front]) {
        c.width = Math.round(rect.width * dpr)
        c.height = Math.round(rect.height * dpr)
      }
      // re-seed only when the area changes meaningfully, so a small resize doesn't reset the dust
      if (sim.dust.length === 0 || Math.abs(newArea - oldArea) > 0.15 * Math.max(oldArea, 1)) {
        sim.dust = seedDust(rect.width, rect.height)
      }
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)

    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      sim.targetX = e.clientX - rect.left
      sim.targetY = e.clientY - rect.top
      if (!sim.inside) {
        // jump on entry, and don't read the jump as a fast pointer swipe
        sim.x = sim.lastTargetX = sim.targetX
        sim.y = sim.lastTargetY = sim.targetY
      }
      sim.inside = true
    }
    const onLeave = () => {
      sim.inside = false
    }
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)

    const clear = () => {
      backCtx.setTransform(1, 0, 0, 1, 0, 0)
      backCtx.clearRect(0, 0, back.width, back.height)
      frontCtx.setTransform(1, 0, 0, 1, 0, 0)
      frontCtx.clearRect(0, 0, front.width, front.height)
    }

    const step = (dt: number) => {
      const { width: w, height: h, dpr } = sim
      const t = sim.time
      const reach = TUNING.radius * TUNING.dustReach
      const reach2 = reach * reach
      const wake2 = (TUNING.radius * 0.75) ** 2
      const pointerSpeed = Math.hypot(sim.pointerVX, sim.pointerVY)
      const margin = 30

      clear()
      backCtx.globalCompositeOperation = 'lighter'
      frontCtx.globalCompositeOperation = 'lighter'

      for (const p of sim.dust) {
        // the air here, with parallax: nearer dust crosses the screen faster
        airAt(p.x, p.y, t)
        const depth = 0.45 + 0.9 * p.z

        // the pointer drags the air along its path and sheds an eddy beside it
        const dx = p.x - sim.x
        const dy = p.y - sim.y
        const d2 = dx * dx + dy * dy
        const wake = pointerSpeed > 1 ? Math.exp(-d2 / wake2) : 0
        const side = sim.pointerVX * dy - sim.pointerVY * dx > 0 ? 1 : -1
        const inv = 1 / Math.sqrt(d2 + 100)
        const swirl = pointerSpeed * TUNING.swirl * wake * side

        const airX = AIR.x * depth + sim.pointerVX * TUNING.wake * wake - dy * inv * swirl
        const airY = AIR.y * depth + sim.pointerVY * TUNING.wake * wake + dx * inv * swirl + p.buoyancy

        // relax toward the air, plus a little Brownian jitter
        const follow = Math.min(1, p.response * dt)
        p.vx += (airX - p.vx) * follow + (Math.random() - 0.5) * 40 * dt
        p.vy += (airY - p.vy) * follow + (Math.random() - 0.5) * 40 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt

        // wrap with a margin so dust never pops in at an edge
        if (p.x < -margin) p.x += w + 2 * margin
        else if (p.x > w + margin) p.x -= w + 2 * margin
        if (p.y < -margin) p.y += h + 2 * margin
        else if (p.y > h + margin) p.y -= h + 2 * margin

        // stirred dust spins and tumbles faster
        p.angle += (p.spin + swirl * 0.01) * dt
        p.tumble += p.tumbleRate * dt * (1 + wake * 2)

        // only dust inside the beam is visible, brightest at the centre, no edge
        const l2 = d2 / reach2
        if (l2 >= 1) continue
        const light = (1 - l2) ** TUNING.dustFalloff * sim.intensity * TUNING.dustBrightness
        if (light < 0.008) continue

        if (p.kind === BOKEH) drawBokeh(frontCtx, dpr, p, light, sprites.bokeh)
        else if (p.kind === FIBRE) drawFibre(backCtx, dpr, p, light)
        else if (p.kind === FLAKE) drawFlake(backCtx, dpr, p, light, sprites.specks[p.sprite])
        else drawMote(backCtx, dpr, p, light, sprites.specks[p.sprite])
      }
      sim.drew = true
    }

    const tick = (now: number) => {
      const dt = sim.lastTime ? Math.min((now - sim.lastTime) / 1000, 0.05) : 1 / 60
      sim.lastTime = now
      sim.time += dt

      // beam follows the pointer (frame-rate independent easing)
      const follow = 1 - (1 - TUNING.follow) ** (dt * 60)
      sim.x += (sim.targetX - sim.x) * follow
      sim.y += (sim.targetY - sim.y) * follow
      sim.intensity += ((sim.inside ? 1 : 0) - sim.intensity) * (1 - 0.93 ** (dt * 60))

      // pointer velocity, smoothed; it decays to zero when the pointer rests
      const rawVX = (sim.targetX - sim.lastTargetX) / dt
      const rawVY = (sim.targetY - sim.lastTargetY) / dt
      sim.lastTargetX = sim.targetX
      sim.lastTargetY = sim.targetY
      const rawSpeed = Math.hypot(rawVX, rawVY)
      const cap = rawSpeed > MAX_POINTER_SPEED ? MAX_POINTER_SPEED / rawSpeed : 1
      const smooth = 1 - 0.75 ** (dt * 60)
      sim.pointerVX += (rawVX * cap - sim.pointerVX) * smooth
      sim.pointerVY += (rawVY * cap - sim.pointerVY) * smooth

      root.style.setProperty('--fx', `${sim.x.toFixed(1)}px`)
      root.style.setProperty('--fy', `${sim.y.toFixed(1)}px`)
      root.style.setProperty('--fi', sim.intensity.toFixed(3))

      if (sim.intensity > 0.003) {
        step(dt)
      } else if (sim.drew) {
        // beam has faded: clear once, then idle (the dust waits where it is)
        clear()
        sim.drew = false
      }

      if (sim.visible) sim.raf = requestAnimationFrame(tick)
    }
    sim.raf = requestAnimationFrame(tick)

    const io = new IntersectionObserver(([entry]) => {
      const wasVisible = sim.visible
      sim.visible = entry.isIntersecting
      if (sim.visible && !wasVisible) {
        sim.lastTime = 0
        sim.raf = requestAnimationFrame(tick)
      }
    })
    io.observe(host)

    return () => {
      cancelAnimationFrame(sim.raf)
      io.disconnect()
      resizeObserver.disconnect()
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
      {/* in-focus dust, behind the page content */}
      <canvas ref={backRef} className="absolute inset-0 size-full mix-blend-screen" />
      {/* out-of-focus near dust, floating in front of the content */}
      <canvas ref={frontRef} className="absolute inset-0 z-10 size-full mix-blend-screen" />
    </div>
  )
}
