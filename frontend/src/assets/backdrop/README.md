# Backdrop image

Drop one image here (`.png`, `.jpg`, `.webp` or `.avif`). It's placed behind the fluted glass on
the front-page hero and the login and register screens, blurred, among the blue colour fields.
Inside the cursor light it blurs less, so it reads a little sharper there.

- A PNG with a transparent background (a product cut-out, a device, an object) works best: it
  becomes a soft shape floating in the blue.
- With several files, the first one alphabetically is used.
- Delete the file to go back to the plain blue.

Tune it with `BACKDROP_IMAGE` in `src/components/visual/BlurBackdrop.tsx`:

| Setting       | What it does                                                         |
| ------------- | -------------------------------------------------------------------- |
| `fit`         | `contain` keeps the whole image, `cover` fills the background        |
| `position`    | where it sits, e.g. `'70% 55%'`, `'center'`, `'right bottom'`        |
| `inset`       | margin around the image box when `fit` is `contain`                  |
| `blur`        | blur behind the glass, in px                                         |
| `blurInLight` | blur inside the cursor light                                         |
| `opacity`     | 0 to 1                                                               |
| `blend`       | `normal` keeps its colours, `luminosity` keeps everything ocean blue |

Reload the page after adding the file.
