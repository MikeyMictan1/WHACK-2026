import { useId } from 'react'

/*
  Site backdrop: soft fields of deep and light blue (ocean blue around #249de3, lighter sky cyan, a deeper sea blue) seen through
  fluted glass.

  The glass is real distortion, not stripes drawn on top: an SVG displacement map of thin
  vertical gradient strips shifts the pixels sideways inside each strip. Because the colour
  behind it is soft and uneven, the ribs come out as gentle bends in the light. A faint
  sheen adds a highlight per rib.

  IMAGE: drop a png / jpg / webp / avif into  frontend/src/assets/backdrop/  and it is placed
  behind the glass, blurred, on backdrops that ask for it (<BlurBackdrop image />: the hero and
  the login screens). The first file alphabetically is used. Tune it with BACKDROP_IMAGE.
*/

/** How the background image sits. */
const BACKDROP_IMAGE = {
  /** 'contain' keeps the whole image (good for a PNG cut-out); 'cover' fills the area. */
  fit: 'contain' as 'contain' | 'cover',
  /** CSS object-position, e.g. 'center', '75% 60%', 'right bottom'. */
  position: '70% 55%',
  /** Share of the backdrop the image box takes, as an inset from each edge (only for 'contain'). */
  inset: '8%',
  /** Blur in px behind the glass. */
  blur: 28,
  /** Blur inside the cursor light, so it reads a little sharper there. */
  blurInLight: 10,
  /** 0..1 */
  opacity: 0.8,
  /**
   * 'normal' keeps the image's own colours.
   * 'luminosity' keeps only its light and shade, so everything stays ocean blue.
   * 'soft-light' blends it in gently.
   */
  blend: 'normal' as 'normal' | 'luminosity' | 'soft-light',
}

const images = import.meta.glob<string>('../../assets/backdrop/*.{png,jpg,jpeg,webp,avif,PNG,JPG,JPEG,WEBP}', {
  eager: true,
  query: '?url',
  import: 'default',
})
const IMAGE_URL: string | undefined = Object.keys(images)
  .sort()
  .map((key) => images[key])[0]


/** Tuning for the glass. Lower values = softer lines. */
const GLASS = {
  /** px per rib, in the map's own 1440-wide space. */
  rib: 18,
  /** How far pixels are pushed inside each rib. */
  strength: 55,
  /** 0..1, opacity of the highlight sheen on each rib. */
  sheen: 0.28,
}

const MAP = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="16" preserveAspectRatio="none">` +
    `<defs><linearGradient id="g"><stop offset="0" stop-color="rgb(0,128,128)"/><stop offset="1" stop-color="rgb(255,128,128)"/></linearGradient>` +
    `<pattern id="p" width="${GLASS.rib}" height="16" patternUnits="userSpaceOnUse"><rect width="${GLASS.rib}" height="16" fill="url(#g)"/></pattern></defs>` +
    `<rect width="1440" height="16" fill="url(#p)"/></svg>`,
)}`

type Props = {
  className?: string
  /** Apply the glass. Off for the flashlight's clear view, so the light wipes the ribs away. */
  refract?: boolean
  /** Place the image from assets/backdrop/ behind the glass, if there is one. */
  image?: boolean
}

function BackdropImage({ src, sharper }: { src: string; sharper: boolean }) {
  const contain = BACKDROP_IMAGE.fit === 'contain'
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={`absolute ${contain ? 'object-contain' : 'object-cover'}`}
      style={{
        inset: contain ? BACKDROP_IMAGE.inset : 0,
        width: contain ? `calc(100% - 2 * ${BACKDROP_IMAGE.inset})` : '100%',
        height: contain ? `calc(100% - 2 * ${BACKDROP_IMAGE.inset})` : '100%',
        objectPosition: BACKDROP_IMAGE.position,
        opacity: BACKDROP_IMAGE.opacity,
        mixBlendMode: BACKDROP_IMAGE.blend,
        filter: `blur(${sharper ? BACKDROP_IMAGE.blurInLight : BACKDROP_IMAGE.blur}px)`,
      }}
    />
  )
}

export function BlurBackdrop({ className = '', refract = true, image = false }: Props) {
  const filterId = `fluted-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <svg className="absolute size-0">
        <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage href={MAP} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale={GLASS.strength} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {/* everything in here is seen through the glass */}
      <div className="absolute -inset-[6%]" style={refract ? { filter: `url(#${filterId})` } : undefined}>
        {/* ground: ocean blue around #249de3, lighter top left, deeper bottom right */}
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#5fb6ea_0%,#36a3e5_42%,#249de3_70%,#1d8bd0_100%)]" />
        {/* deeper ocean blue, top right */}
        <div className="absolute -top-[25%] -right-[10%] h-[85%] w-[60%] rounded-full bg-[#1677bd] opacity-60 blur-[120px]" />
        {/* light sky cyan, left */}
        <div className="absolute top-[15%] -left-[15%] h-[70%] w-[50%] rounded-full bg-[#74c3ef] opacity-70 blur-[110px]" />
        {/* mid ocean blue, centre */}
        <div className="absolute top-[20%] left-[35%] h-[60%] w-[35%] rounded-full bg-[#2fa0e2] opacity-45 blur-[110px]" />
        {/* lighter blue lift along the bottom, kept dark enough for white text */}
        <div className="absolute -bottom-[30%] left-[5%] h-[65%] w-[90%] rounded-full bg-[#86cbf2] opacity-45 blur-[120px]" />

        {image && IMAGE_URL && <BackdropImage src={IMAGE_URL} sharper={!refract} />}
      </div>

      {refract && (
        <div
          className="absolute inset-0 mix-blend-soft-light"
          style={{
            opacity: GLASS.sheen,
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(255,255,255,0) 0px, rgba(255,255,255,0.6) 2px, rgba(255,255,255,0) 9px, rgba(20,40,90,0.10) 17px, rgba(255,255,255,0) 18px)',
            backgroundSize: '1.25vw 100%',
          }}
        />
      )}
    </div>
  )
}
