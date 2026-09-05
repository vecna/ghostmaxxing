# images

This folder contains static image assets used by the public pages, lab-adjacent demos, logo specimen page, social previews, and report pages.

Root-level assets include social cards and homepage imagery. The nested folders split reusable brand/logo files, homepage process illustrations, Ghostutter shard art, surveillance icon sets, editorial motifs, report illustrations, and social profile/header media.

`home/` contains the square, stylised face sequence used by the homepage “How it works” steps: local baseline, visible intervention, and optional upload. These are painted standalone SVGs loaded through `<img>`, so their palette is embedded rather than inherited from page CSS. Keep the three files visually coherent and language-independent.

Image binaries are excluded from code2prompt because uploading SVG, PNG, and WebP assets is usually not useful for chatbot code review. The folder descriptions in this tree are included so the chatbot still receives asset intent, usage, and ownership context.
