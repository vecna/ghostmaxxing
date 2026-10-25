# images/icons

This folder contains SVG surveillance-camera icons used by the genealogy, specimen, homepage, and editorial motif demos.

The icon set contains the current surveillance-camera SVG forms used by the surrounding page and editorial demos. The SVG names and available states are the source of truth; this directory does not own Ghostutter CSS or a separate `-alive` variant contract.

The SVG files are excluded from code2prompt because they are visual assets. This description preserves the purpose and naming convention of the omitted icon set.

Genealogy reads these canonical SVG files at build time through `scripts-dev/build-genealogy.py`; camera geometry must not be redefined in that generator. Inline copies in the generated HTML are expected.

Run `python3 scripts-dev/export-camera-icons.py` to regenerate the six coloured, lossless transparent 600 × 600 WebP exports in `webp/`. It reads the SVG geometry, `styles/cameras.css`, and `styles/tokens.css`; every export has at least 30 pixels (5%) of transparent padding on each edge. Requires Inkscape and Pillow.
