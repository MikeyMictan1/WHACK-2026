import { cardArt } from './cardArt.ts'

/** The card's artwork at its real shape (the files are cropped to the card). */
export function CardImage({ cardId, name, className = '' }: { cardId: string; name: string; className?: string }) {
  return <img src={cardArt(cardId)} alt={`${name} card`} className={`block aspect-[860/601] w-full object-contain ${className}`} />
}
