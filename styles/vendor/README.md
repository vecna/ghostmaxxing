Vendor asset inventory for locally mirrored web fonts.

`styles/pages.css` and `styles/lab.css` import `newsreader.css` and `atkinson.css`, which provide the self-hosted display and UI font faces used across the site so development and local demos do not fetch font assets from a third-party network.

## Local font files

| Local file | Font family | Notes |
|---|---|---|
| `newsreader.css` | `Newsreader` | Display serif for headlines and the wordmark. |
| `atkinson.css` | `Atkinson Hyperlegible` | Sans-serif body, nav, and small-print text. |

## Font files downloaded

The self-hosted setup uses `.woff2` files in this directory with the names expected by the CSS.

| Font family | Local files |
|---|---|
| `Newsreader` | `newsreader-latin.woff2`, `newsreader-latin-ext.woff2`, `newsreader-italic-latin.woff2`, `newsreader-italic-latin-ext.woff2` |
| `Atkinson Hyperlegible` | `atkinson-latin.woff2`, `atkinson-latin-ext.woff2`, `atkinson-bold-latin.woff2`, `atkinson-bold-latin-ext.woff2`, `atkinson-italic-latin.woff2`, `atkinson-italic-latin-ext.woff2` |

## Update rule

When the font families or file names change, update the corresponding CSS file and verify the app no longer requests `fonts.googleapis.com` or `fonts.gstatic.com` during local use.
