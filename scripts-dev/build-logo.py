#!/usr/bin/env python3
"""
build-logo.py — emit the whole Ghostmaxxing logo set from one geometry source.

Every mark, lockup, favicon and touch icon in images/logo/ is generated here.
Never hand-edit the output: change the constants below and re-run, or the
variants drift apart. That drift is what produced three incompatible logo
folders in the first place.

    python3 scripts-dev/build-logo.py

Requires: cairosvg (PNG raster only). SVG output needs nothing.
"""

import os
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "images" / "logo"

# ---- tokens (mirror of styles/tokens.css) --------------------------------
INK = "#050505"
CREAM = "#ffe7a8"
PINK = "#ff2f7a"
BG = "#fd5503"

# ---- geometry ------------------------------------------------------------
# The lens is a fixed 64-unit stack: barrel ring, cream iris, ink pupil.
# The shard sits ON it, clipped to the barrel so the silhouette stays a clean
# circle (needed for avatars, favicons and the maskable icon).
#
# The wedge angles are deliberately biased to the upper-right and leave the
# lower-left of the iris uncovered. That asymmetry is the whole idea: a
# radially even shard reads as a pinwheel or a loading spinner, and the one
# thing this mark must not say is "please wait".
SHARD = [
    "M32 32 L26 -4 L44 0 Z",
    "M32 32 L56 2 L68 18 Z",
    "M32 32 L70 34 L62 52 Z",
    "M32 32 L46 62 L34 64 Z",
]

# Two fat wedges, same bias, no pupil. Below ~32px the four-wedge cluster and
# the pupil turn into one dark smear.
SHARD_SMALL = [
    "M32 32 L22 -6 L50 -2 Z",
    "M32 32 L72 28 L54 62 Z",
]

RING_R = 29.5
RING_W = 2.6
RING_W_SMALL = 4.0
IRIS_R = 21
IRIS_R_SMALL = 23
PUPIL_R = 9.5
CLIP_R = 28.2


DEFS = (
    '<defs><clipPath id="gmClip"><circle cx="32" cy="32" r="%s"/></clipPath>'
    '<mask id="gmPupil"><rect width="64" height="64" fill="#fff"/>'
    '<circle cx="32" cy="32" r="%s" fill="#000"/></mask></defs>'
) % (CLIP_R, PUPIL_R)


def lens_stack(ring, small=False, mono=False, animated=False):
    """The mark's inner geometry, without the <svg> wrapper."""
    paths = SHARD_SMALL if small else SHARD
    shard_paths = "".join('<path d="%s"/>' % p for p in paths)
    cls = ' class="gm-logo-shard"' if animated else ""
    iris_r = IRIS_R_SMALL if small else IRIS_R

    if mono:
        # One colour only. The iris becomes a hairline and the pupil is
        # knocked out of the shard with a mask, so the lens still reads
        # instead of collapsing into a solid blob.
        return (
            '<circle cx="32" cy="32" r="%s" fill="none" stroke="%s" stroke-width="1.4" opacity="0.55"/>'
            '<g%s fill="%s" clip-path="url(#gmClip)" mask="url(#gmPupil)">%s</g>'
        ) % (iris_r, ring, cls, ring, shard_paths)

    pupil = "" if small else '<circle cx="32" cy="32" r="%s" fill="%s"/>' % (PUPIL_R, INK)
    return (
        '<circle cx="32" cy="32" r="%s" fill="%s"/>%s'
        '<g%s fill="%s" clip-path="url(#gmClip)">%s</g>'
    ) % (iris_r, CREAM, pupil, cls, PINK, shard_paths)


ANIM_STYLE = (
    "<style>"
    "@keyframes gm-logo-stutter{"
    "0%,26%{transform:rotate(0deg)}"
    "30%,56%{transform:rotate(58deg)}"
    "60%,72%{transform:rotate(131deg)}"
    "76%,84%{transform:rotate(198deg)}"
    "88%,94%{transform:rotate(291deg)}"
    "100%{transform:rotate(360deg)}}"
    ".gm-logo-shard{transform-origin:32px 32px;"
    "animation:gm-logo-stutter 2.2s infinite steps(1,end)}"
    "@media(prefers-reduced-motion:reduce){.gm-logo-shard{animation:none}}"
    "</style>"
)


def mark(ring, small=False, mono=False, animated=False, title="Ghostmaxxing"):
    w = RING_W_SMALL if small else RING_W
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" '
        'height="64" role="img" aria-label="%s">%s%s%s'
        '<circle cx="32" cy="32" r="%s" fill="none" stroke="%s" stroke-width="%s"/>'
        "</svg>"
    ) % (title, DEFS, ANIM_STYLE if animated else "",
         lens_stack(ring, small, mono, animated), RING_R, ring, w)


# ---- lockups -------------------------------------------------------------
# The wordmark is live <text> in the --serif stack, NOT outlines. That is a
# deliberate tradeoff: on the site the real font is loaded and live text stays
# selectable, searchable and re-colourable. For anything leaving the site —
# print, a partner's deck, a conference badge — run the outline step in
# LOGO.md first, or the recipient sees Georgia.
SERIF = "Newsreader, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"


def lockup_h(ring, word_colour, mono=False):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 64" width="320" '
        'height="64" role="img" aria-label="Ghostmaxxing">%s%s'
        '<circle cx="32" cy="32" r="%s" fill="none" stroke="%s" stroke-width="%s"/>'
        '<text x="80" y="44" font-family="%s" font-size="34" font-weight="500" '
        'letter-spacing="-0.01em" fill="%s">Ghostmaxxing</text></svg>'
    ) % (DEFS, lens_stack(ring, mono=mono), RING_R, ring, RING_W, SERIF, word_colour)


def lockup_v(ring, word_colour, mono=False):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 116" width="220" '
        'height="116" role="img" aria-label="Ghostmaxxing">%s'
        '<g transform="translate(78 0)">%s'
        '<circle cx="32" cy="32" r="%s" fill="none" stroke="%s" stroke-width="%s"/></g>'
        '<text x="110" y="104" text-anchor="middle" font-family="%s" font-size="30" '
        'font-weight="500" letter-spacing="-0.01em" fill="%s">Ghostmaxxing</text></svg>'
    ) % (DEFS, lens_stack(ring, mono=mono), RING_R, ring, RING_W, SERIF, word_colour)


VARIANTS = {
    # name: (ring/ink colour, is-mono)
    "ondark": (CREAM, False),
    "onlight": (INK, False),
    "mono-cream": (CREAM, True),
    "mono-ink": (INK, True),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    written = []

    for name, (ring, mono) in VARIANTS.items():
        (OUT / f"mark-{name}.svg").write_text(mark(ring, mono=mono))
        (OUT / f"mark-small-{name}.svg").write_text(mark(ring, small=True, mono=mono))
        (OUT / f"lockup-horizontal-{name}.svg").write_text(lockup_h(ring, ring, mono))
        (OUT / f"lockup-stacked-{name}.svg").write_text(lockup_v(ring, ring, mono))
        written += [f"mark-{name}.svg", f"mark-small-{name}.svg",
                    f"lockup-horizontal-{name}.svg", f"lockup-stacked-{name}.svg"]

    # animated: only the two full-colour variants. A mono animated mark reads
    # as a loading spinner, which is the one thing the logo must not be.
    for name in ("ondark", "onlight"):
        ring, _ = VARIANTS[name]
        (OUT / f"mark-animated-{name}.svg").write_text(mark(ring, animated=True))
        written.append(f"mark-animated-{name}.svg")

    # ---- raster ----------------------------------------------------------
    # Favicons and the Apple touch icon are the only PNGs. Both must be
    # OPAQUE: iOS composites a transparent touch icon onto black, and the
    # cream ring vanishes on it.
    try:
        import cairosvg
    except ImportError:
        print("cairosvg missing — SVG written, PNGs skipped")
        print(f"{len(written)} files -> {OUT}")
        return

    fav_src = mark(CREAM).replace(
        '<svg xmlns="http://www.w3.org/2000/svg"',
        f'<svg xmlns="http://www.w3.org/2000/svg" style="background:{INK}"',
    )
    fav_small = mark(CREAM, small=True).replace(
        '<svg xmlns="http://www.w3.org/2000/svg"',
        f'<svg xmlns="http://www.w3.org/2000/svg" style="background:{INK}"',
    )

    for size in (16, 32, 48, 180, 512):
        src = fav_small if size <= 48 else fav_src
        target = OUT / f"favicon-{size}.png"
        cairosvg.svg2png(
            bytestring=src.encode(),
            write_to=str(target),
            output_width=size,
            output_height=size,
            background_color=INK,
        )
        written.append(target.name)

    # Apple wants its own filename at the site root; 180x180, opaque, square,
    # no pre-rounded corners (iOS applies the mask itself).
    root = OUT.parent.parent
    cairosvg.svg2png(
        bytestring=fav_src.encode(),
        write_to=str(root / "apple-touch-icon.png"),
        output_width=180,
        output_height=180,
        background_color=INK,
    )
    written.append("../../apple-touch-icon.png")

    # Maskable Android icon: the mark inset to the 80% safe area, because
    # Android crops to a circle and would otherwise clip the lens ring.
    maskable = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
        f'<rect width="64" height="64" fill="{INK}"/>'
        '<g transform="translate(32 32) scale(0.72) translate(-32 -32)">'
        f'{DEFS}{lens_stack(CREAM)}'
        f'<circle cx="32" cy="32" r="{RING_R}" fill="none" stroke="{CREAM}" stroke-width="{RING_W}"/>'
        '</g></svg>'
    )
    cairosvg.svg2png(
        bytestring=maskable.encode(),
        write_to=str(OUT / "icon-maskable-512.png"),
        output_width=512,
        output_height=512,
    )
    written.append("icon-maskable-512.png")

    print(f"{len(written)} files -> {OUT}")


if __name__ == "__main__":
    main()
