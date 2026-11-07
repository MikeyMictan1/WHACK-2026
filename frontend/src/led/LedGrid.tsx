const SIZE = 16
const OFF = '#132235' // an unlit LED, a touch lighter than the panel

/** Draws a 16x16 LED frame (256 pixels as rrggbb hex, row by row) like the real board. */
export function LedGrid({ frame, small = false, label }: { frame: string; small?: boolean; label: string }) {
  const pixels = Array.from({ length: SIZE * SIZE }, (_, i) => {
    const hex = frame.slice(i * 6, i * 6 + 6)
    return hex.length === 6 && hex !== '000000' ? `#${hex}` : OFF
  })

  return (
    <div
      role="img"
      aria-label={label}
      className={`grid aspect-square w-full grid-cols-16 bg-ink ${small ? 'gap-px p-1.5' : 'gap-[3px] p-3 md:p-4'}`}
    >
      {pixels.map((color, i) => (
        <span key={i} className="block aspect-square" style={{ backgroundColor: color }} />
      ))}
    </div>
  )
}
