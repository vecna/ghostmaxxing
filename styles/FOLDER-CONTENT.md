# styles

This folder contains project-authored CSS loaded directly by the static HTML pages. There is no production CSS build step; cascade order is controlled by each page's `<link>` order and by `@import` statements in the shared stylesheets.

`tokens.css` defines the Ghostmaxxing color, type, spacing, border, focus, and layout custom properties. `pages.css` imports the local vendor fonts and tokens, then defines the shared editorial page system used by the homepage and content pages. `content-pages.css` layers reusable long-form typography, headers, callouts, resource grids, and content components on top of `pages.css`.

Page and tool skins are split by surface. `lab.css` is the dark lab interface for `lab.html`, including the view bar, readout, action rail, dock, plugin bar, drawers, and upload states. `loader.css` styles the internal video-loader test page. `realtime.css` styles the descriptor-distance calibration/tracking demo. `report-page.css` adds report-specific audience cards, opsec lists, and receipt/secret-code callouts. `references-list.css` adds reference index grouping, ratings, badges, and filters. `logo.css` styles inline or componentized logo marks when the static SVG assets are not enough.

`ghostutter.css` defines the Ghostutter mark, shimmer/stutter motion profiles, hover/focus/script triggers, idle-cursor directive, reduced-motion behavior, and legacy aliases. It is mostly CSS-only; `scripts/ghostutter.js` is needed only for programmatic marks and idle cursor behavior.

The nested `vendor/` folder contains locally mirrored font CSS and font binaries. Those vendor assets are excluded from code2prompt, while this summary and the vendor folder description explain their role.
