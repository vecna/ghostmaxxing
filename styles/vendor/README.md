Vendor asset inventory for locally mirrored Google Fonts assets.

`styles/pages.css` and `styles/lab.css` import `google-fonts.css`, which mirrors the Google Fonts CSS manifests locally so development and local demos do not fetch font assets from a third party network which only reason d'etre is surveillance.

## Source manifests

| Local file | Source URL | Notes |
|---|---|---|
| `google-fonts.css` | `https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&family=JetBrains+Mono:wght@400;700&display=swap` | App UI fonts used by shared page and lab styles. |
| `google-fonts.css` | `https://fonts.googleapis.com/css2?family=League+Script&family=Outfit:wght@400;600;700;800;900&display=swap` | Documented landing-page families, mirrored here for local use too. |

## Font files downloaded

Google Fonts currently serves only `.woff2` files for the browser user-agent used to mirror these assets, so there are no additional `.woff` or `.ttf` files in this directory.

| Font family | Local files |
|---|---|
| `Inter` | `UcCo3FwrK3iLTcvvYwYL8g.woff2`, `UcCo3FwrK3iLTcvmYwYL8g.woff2`, `UcCo3FwrK3iLTcvuYwYL8g.woff2`, `UcCo3FwrK3iLTcvhYwYL8g.woff2`, `UcCo3FwrK3iLTcvtYwYL8g.woff2`, `UcCo3FwrK3iLTcvsYwYL8g.woff2`, `UcCo3FwrK3iLTcviYwY.woff2` |
| `JetBrains Mono` | `tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx3cwhsk.woff2`, `tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxTcwhsk.woff2`, `tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxPcwhsk.woff2`, `tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx_cwhsk.woff2`, `tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx7cwhsk.woff2`, `tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwg.woff2` |
| `League Script` | `CSR54zpSlumSWj9CGVsoBZdeWNReuQ.woff2` |
| `Outfit` | `QGYvz_MVcBeNP4NJuktqQ4E.woff2`, `QGYvz_MVcBeNP4NJtEtq.woff2` |

## Update rule

When the font manifest URLs or families change, refresh `google-fonts.css`, re-download every referenced asset into this directory, and verify the app no longer requests `fonts.googleapis.com` or `fonts.gstatic.com` during local use.
