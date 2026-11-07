/*
  The mascot, shown crisp and at full resolution in its own spot in the hero.

  IMAGE: one transparent PNG (or webp / avif) in  frontend/src/assets/mascot/ .
  The first file alphabetically is used. With no file, nothing renders.
*/

const files = import.meta.glob<string>('../assets/mascot/*.{png,webp,avif,PNG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default',
})
const MASCOT_URL: string | undefined = Object.keys(files)
  .sort()
  .map((key) => files[key])[0]

export function Mascot({ className = '' }: { className?: string }) {
  if (!MASCOT_URL) return null
  return (
    <img
      src={MASCOT_URL}
      alt="Giddy Up Glitch mascot"
      draggable={false}
      className={`pointer-events-none object-contain select-none ${className}`}
    />
  )
}
