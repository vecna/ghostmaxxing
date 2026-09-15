# images

This folder contains static image assets used by the public pages, lab-adjacent demos, logo specimen page, social previews, and report pages.

Root-level assets include social cards and homepage imagery. The nested folders split reusable brand/logo files, homepage process illustrations, Ghostutter shard art, surveillance icon sets, editorial motifs, report illustrations, and social profile/header media.

`projects/` contains normalized documentary images for the complementary-projects table. These remain third-party works: source, credit, and rights-review information are recorded in `projects/PROJECTS.json` and must be checked before deployment.

`home/` contains the square, stylised face sequence used by the homepage “How it works” steps: local baseline, visible intervention, and optional upload. These are painted standalone SVGs loaded through `<img>`, so their palette is embedded rather than inherited from page CSS. Keep the three files visually coherent and language-independent.

`home/story/` holds the eight cards of the homepage story carousel. Six are photographs put through the lab by `node scripts-dev/lab-capture.cjs render`, so the detection box and the Ghostyle are drawn by the lab rather than painted on afterwards, and the clean and Ghostyle frames of a pair are the same frame. Two are painted SVGs, `ghostyle-1.svg` and `ghostyle-3.svg`: a face outline on cream carrying a pattern and no photograph, which is why they have no skin tone and need no AI Gen label. The numbers quoted in the captions are typed into `index.html` by hand from what render printed; there is no data file behind the carousel, because the cards are chosen rather than generated. Replacing a card means overwriting the file of the same name and correcting its caption.

Image binaries are excluded from code2prompt because uploading SVG, PNG, and WebP assets is usually not useful for chatbot code review. The folder descriptions in this tree are included so the chatbot still receives asset intent, usage, and ownership context.
