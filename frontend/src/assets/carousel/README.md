# Carousel images

Put up to **6** images here for the front-page carousel: `.jpg`, `.png`, `.webp` or `.avif`.

- They're used in filename order, so name them `01.jpg` … `06.jpg`.
- The ring has 15 cards, so the 6 images repeat around it.
- A slot with no file shows a grey placeholder labelled with the expected name.
- Cards are portrait, about 3:4 on a wide screen. Crop to roughly that ratio and keep the
  subject centred, since the image is cropped to fill the card.

Reload the dev server page after adding files. Vite bundles them at build time.

To change the number of slots, the number of cards, or the speed, edit `TUNING` in
`src/front-page/Carousel.tsx`.
