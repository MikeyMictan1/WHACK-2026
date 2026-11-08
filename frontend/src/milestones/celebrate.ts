import confetti from 'canvas-confetti'

// The site's own colours (styles/index.css): signal lime, ink, sky and white.
const COLOURS = ['#d4ff3a', '#0b1a2e', '#1d3050', '#c9dcf0', '#ffffff']
const DURATION_MS = 3000

/** A big confetti burst for reaching a milestone: one blast from the middle, then cannons from both sides.
 *  Skipped for people who ask their system for reduced motion. */
export function celebrate() {
  const base = { colors: COLOURS, zIndex: 1000, disableForReducedMotion: true }

  confetti({ ...base, particleCount: 180, spread: 110, startVelocity: 55, origin: { y: 0.6 }, scalar: 1.2 })

  const end = Date.now() + DURATION_MS
  const frame = () => {
    confetti({ ...base, particleCount: 6, angle: 60, spread: 60, startVelocity: 60, origin: { x: 0, y: 0.7 } })
    confetti({ ...base, particleCount: 6, angle: 120, spread: 60, startVelocity: 60, origin: { x: 1, y: 0.7 } })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()

  // A last big pop from the top as the cannons finish.
  window.setTimeout(() => {
    confetti({ ...base, particleCount: 140, spread: 160, startVelocity: 35, origin: { y: 0.2 }, ticks: 300 })
  }, DURATION_MS - 600)
}
