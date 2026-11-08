import arcade from '../assets/decor/arcade.png'
import cat from '../assets/decor/cat.png'
import plant from '../assets/decor/plant.png'
import trading from '../assets/decor/trading.png'

/**
 * Artwork for the in-game decor items, matched on words in the item's title (the shop's
 * example items are "Potted plant", "Arcade machine", "Calico cat" and "Trading screens").
 * Items a parent adds themselves have no art and show their initial instead.
 */
const ART: [RegExp, string][] = [
  [/plant|dino/i, plant],
  [/arcade|game/i, arcade],
  [/cat|kitten/i, cat],
  [/trad|stock|chart|screen/i, trading],
]

export function decorArt(title: string): string | null {
  return ART.find(([re]) => re.test(title))?.[1] ?? null
}
