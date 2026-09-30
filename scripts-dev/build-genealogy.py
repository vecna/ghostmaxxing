#!/usr/bin/env python3
"""
build-genealogy.py — generate genealogy.html and styles/genealogy.css.

WHY THIS IS GENERATED
The page used to be a hand-placed collage: a canopy SVG, four copies of a
wind gust, four whirlwind <img>s, eight camera SVGs and four tiled smoke
backgrounds (~1,700 <circle>s), roughly 290 KB, held together by absolute
positioning. It broke at 390 px, and the largest, highest-contrast element on
it — the wind — was byte-identical on every era, so the most prominent thing
on the page encoded nothing.

It is now one diagram drawn from two datasets:

    references/REFERENCES.json   graded documents: papers, code, artworks
    projects/PROJECTS.json       catalogued things: products, prototypes,
                                 artworks, collective practices

Every mark is one entry, placed at the year it was first shown in public, in
the row of the reading technology its `target` tags name. Nothing is
hand-placed, so the page cannot drift away from the archive. Re-run after
editing either file:

    python3 scripts-dev/build-genealogy.py      # or: npm run update:genealogy

Writes genealogy.html and styles/genealogy.css from the repo root. Exits 1,
without writing, when an entry carries a target this script cannot place —
add the tag to ROWS below (and to the dataset's tag_definitions) rather than
letting it fall into a silent bucket. There used to be one ("Not faces"); it
collected object detectors, classifiers and sensor work that plainly belong
on the chart, and it is gone. Target class is now a colour, not a row.

TWO SVGs, NOT ONE, AND WHY
SVG geometry cannot reflow: a 25-year horizontal axis that works at 1440 px
is 300 px wide on a phone, where fifty marks collide. So there are two
<svg> blocks — a landscape chart and a stacked portrait one — and a media
query shows exactly one. They are generated from the same data by the same
functions, so they cannot disagree.

The cameras are inlined into BOTH, rather than defined once as a <symbol>
and referenced with <use>. That is deliberate, and it is the same lesson the
old wind block learned the hard way: CSS selectors do not cross into a <use>
shadow tree, so `[data-lens="spent"] .cam-iris` in cameras.css would never
reach an iris inside a symbol, and every lens would render live. Inlined,
cameras.css applies unchanged and data-lens works.
"""

import datetime
import html
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# 1. The rows: families of face-reading system, oldest first.
#
# `span` is the years that family was the state of the art. Those ranges are
# the ones this page has always published; they are editorial, not derived,
# and they are drawn as the heavy segment of each row line.
#
# `targets` maps `target` tags — the same vocabulary in REFERENCES.json and
# PROJECTS.json — onto a row. A row is a reading technology, so a result
# against a deep person detector lands with the deep face matchers, and a
# thermal or flash intervention lands with the sensor row: same technology
# family, different subject. Whether the subject is a face is a separate
# axis, NON_FACE below, and it is drawn as the ring colour of the mark.
#
# An entry with several targets resolves through ROW_PRECEDENCE: the sensor
# layer first (an NIR paper also lists face-verification and would otherwise
# land with the embeddings), then landmarks, then detection, then the deep
# matchers. "public-space-surveillance" is a deployment context, not a
# reading technology, so it resolves with the matchers it is co-listed with.
# ---------------------------------------------------------------------------
ROWS = [
    dict(
        key="detection", cam="bullet",
        span=(2001, 2009),
        title="Face detection",
        sub="Haar cascades · Viola-Jones",
        body="Rectangles of light and dark slid across the frame. Cheap, fast, "
             "everywhere, and it only ever looked for contrast.",
        targets={"face-detection"},
    ),
    dict(
        key="landmark", cam="dome",
        span=(2010, 2013),
        title="Landmark geometry",
        sub="Eigenfaces · Fisherfaces · 68-point meshes",
        body="The face as a set of distances between named points. The dome "
             "never shows you which way it looks.",
        targets={"face-landmarks"},
    ),
    dict(
        key="embeddings", cam="cube",
        span=(2014, 2016),
        title="Learned embeddings",
        sub="DeepFace · FaceNet · ArcFace · deep detectors",
        body="Systems stop measuring features and start learning them: every "
             "face becomes a vector in a space nobody designed by hand. The "
             "same networks read people, objects and number plates.",
        targets={"face-recognition", "face-verification", "gender-classification",
                 "public-space-surveillance",
                 "person-detection", "object-detection", "image-classification",
                 "traffic-sign-recognition", "certified-defense",
                 "deep-representation", "machine-learning-models",
                 "license-plate-recognition"},
    ),
    dict(
        key="depth", cam="pill",
        span=(2017, 2020),
        title="Depth & near-infrared",
        sub="Dot projectors · NIR sensors · liveness",
        body="The face as 3D geometry, read in the dark, with a liveness check "
             "a photograph cannot pass. Interventions at this layer address "
             "the sensor, not the matcher.",
        targets={"nir-face-recognition", "3d-face-recognition", "depth-face-recognition",
                 "sensor-disturbance", "security-camera", "thermal-imaging",
                 "flash-photography"},
    ),
    dict(
        key="network", cam="pole",
        span=(2020, None), present=True,
        title="Networked readers",
        sub="Pole cameras · shared watchlists",
        body="Fixed cameras stop being cameras and become one queryable index. "
             "The reading is unchanged; the reach is not.",
        targets={"networked-surveillance", "watchlist-matching"},
    ),
    dict(
        key="wearable", cam="glasses",
        span=(2020, None), present=True,
        title="Wearable readers",
        sub="Pervert glasses · body-worn",
        body="The lens moves to eye level and stops looking like a lens. A "
             "different technology from the pole, and a different problem: you "
             "cannot learn to avoid a camera you cannot identify.",
        targets={"wearable-camera", "smart-glasses"},
    ),
]
ROW_BY_KEY = {r["key"]: r for r in ROWS}
ROW_PRECEDENCE = ["depth", "landmark", "detection", "embeddings", "network", "wearable"]
KNOWN_TARGETS = set().union(*(r["targets"] for r in ROWS))

# Targets that are not a face system. An entry aimed only at these is still
# on the chart — it addresses a recognition technology — but its ring is
# yellow rather than pink, so a result against a person detector is never
# read as a result against a face matcher.
NON_FACE = {
    "person-detection", "object-detection", "image-classification",
    "traffic-sign-recognition", "certified-defense", "deep-representation",
    "machine-learning-models", "license-plate-recognition",
    "sensor-disturbance", "security-camera", "thermal-imaging", "flash-photography",
}

# Evidence grade, from REFERENCES.json `reproducibility`. Three tiers, because
# three is what an iris can carry legibly at 18 px.
GRADE = {
    "code-available": "strong", "artifact-available": "strong",
    "build-files-available": "strong",
    "paper-available": "paper", "documented-project": "paper",
    "survey": "context", "artwork-documentation": "context",
}
GRADE_LABEL = {
    "strong": "code, artefact or build files published",
    "paper": "paper or documented project",
    "context": "survey or artwork documentation",
}

# Project kind, from PROJECTS.json `access`. Four buckets, one shape each.
# Unknown access values fall to "other" with a warning, never a crash: a new
# access label should not stop the chart, but it should be placed on purpose.
KIND_BY_ACCESS = {
    "commercial": "commercial",
    "artwork": "art", "exhibition": "art", "collective-practice": "art",
    "research-prototype": "research",
    "free-diy": "other", "free-method": "other", "prototype": "other",
}
KIND_ORDER = ["commercial", "art", "research", "other"]
KIND_LABEL = {
    "commercial": "commercial",
    "art": "art or collective practice",
    "research": "research prototype",
    "other": "open method, DIY build or prototype",
}

Y0 = 2001                      # the year axis starts here, always


def row_for(targets, label, problems):
    """Which row an entry belongs to, by ROW_PRECEDENCE. Records a problem
    instead of guessing when no target is known."""
    targets = set(targets)
    unknown = targets - KNOWN_TARGETS
    if unknown:
        problems.append(f"{label}: unknown target(s) {sorted(unknown)}")
    for key in ROW_PRECEDENCE:
        if ROW_BY_KEY[key]["targets"] & targets:
            return key
    problems.append(f"{label}: no target maps to a row ({sorted(targets)})")
    return None


def is_face(targets):
    return any(t not in NON_FACE for t in targets)


def credit(author):
    """`author` in REFERENCES.json is always a list. One name is used as-is,
    two are joined, more become "first et al." — a tooltip is not a citation,
    and the archive entry the mark links to carries the full list."""
    if not author:
        return ""
    if isinstance(author, str):
        return author
    if len(author) == 1:
        return author[0]
    if len(author) == 2:
        return " & ".join(author)
    return f"{author[0]} et al."


def load_marks():
    """Both datasets, as one list of marks. Every mark has year, row, source
    ("ref" or "proj"), face (bool), href, label; refs add grade, projects add
    kind. Exits with the list of problems when a target cannot be placed."""
    with open(os.path.join(ROOT, "references", "REFERENCES.json"), encoding="utf-8") as fh:
        refs = json.load(fh)["references"]
    with open(os.path.join(ROOT, "projects", "PROJECTS.json"), encoding="utf-8") as fh:
        projects = json.load(fh)["projects"]

    problems, marks = [], []
    for ref in refs:
        targets = ref.get("target", [])
        row = row_for(targets, f"reference {ref['slug']}", problems)
        label = f"{ref['title']} ({credit(ref.get('author'))}, {ref['year']})" \
            if ref.get("author") else f"{ref['title']} ({ref['year']})"
        marks.append(dict(
            year=int(ref["year"]), row=row, source="ref", face=is_face(targets),
            grade=GRADE.get(ref.get("reproducibility"), "context"),
            slug=ref["slug"], label=label, sort=ref["title"],
            href=f"/references/#{ref['slug']}",
        ))
    for p in projects:
        targets = p.get("target", [])
        row = row_for(targets, f"project {p['slug']}", problems)
        kind = KIND_BY_ACCESS.get(p.get("access"))
        if kind is None:
            print(f"warning: project {p['slug']}: access '{p.get('access')}' is not in "
                  f"KIND_BY_ACCESS, drawn as 'other'", file=sys.stderr)
            kind = "other"
        if "year" not in p:
            problems.append(f"project {p['slug']}: no year")
            continue
        marks.append(dict(
            year=int(p["year"]), row=row, source="proj", face=is_face(targets),
            kind=kind, slug=p["slug"],
            label=f"{p['name']} ({KIND_LABEL[kind]}, {p['year']})", sort=p["name"],
            href=f"/projects/#{p['slug']}",
        ))

    if problems:
        print("build-genealogy.py: cannot place every entry on the chart:", file=sys.stderr)
        for pr in problems:
            print("  -", pr, file=sys.stderr)
        print("Add the tag to ROWS in scripts-dev/build-genealogy.py and to the dataset's "
              "tag_definitions.target, then re-run.", file=sys.stderr)
        sys.exit(1)

    marks.sort(key=lambda m: (m["year"], m["source"], m["sort"]))
    return refs, projects, marks



# ---------------------------------------------------------------------------
# 2. Cameras. Pulled from the markup that already shipped on this page, so the
#    fleet stays byte-comparable with the footer and the homepage. Authored in
#    a 0 0 100 100 box (the glasses in 0 0 100 74) per the cameras.css
#    contract, and placed with a translate+scale so one definition serves any
#    size.
# ---------------------------------------------------------------------------
CAMS = {
    "bullet": (100, 100, """
<path class="cam-mount" d="M45,30 V12 M32,12 H58" stroke-width="5"/>
<rect class="cam-shell" x="16" y="36" width="66" height="34" rx="5"/>
<path class="cam-mount" d="M12,30 H74 L84,40" stroke-width="5"/>
<circle class="cam-lens" cx="60" cy="51" r="14"/>
<circle class="cam-iris" id="{iid}" cx="60" cy="51" r="6.2"/>
<circle class="cam-glint" cx="55.8" cy="46.8" r="2.4"/>"""),
    "dome": (100, 100, """
<path class="cam-mount" d="M6,29 H94" stroke-width="7"/>
<path class="cam-shell" d="M20,29 A30,30 0 0 0 80,29 Z"/>
<circle class="cam-lens" cx="50" cy="44" r="15"/>
<circle class="cam-iris" id="{iid}" cx="50" cy="44" r="6.6"/>
<circle class="cam-glint" cx="45.5" cy="39.5" r="2.55"/>"""),
    "cube": (100, 100, """
<path class="cam-mount" d="M50,16 V6 M38,6 H62" stroke-width="5"/>
<rect class="cam-shell" x="16" y="16" width="68" height="68" rx="19"/>
<circle class="cam-dot cam-dot--ring" cx="73" cy="26" r="3.4"/>
<circle class="cam-lens" cx="50" cy="50" r="17"/>
<circle class="cam-iris" id="{iid}" cx="50" cy="50" r="7.5"/>
<circle class="cam-glint" cx="44.9" cy="44.9" r="2.9"/>"""),
    "pill": (100, 100, """
<path class="cam-mount" d="M40,36 V22 M28,22 H52" stroke-width="5"/>
<rect class="cam-shell" x="6" y="36" width="88" height="28" rx="14"/>
<g class="cam-dot cam-dot--dark"><circle cx="62" cy="44" r="2"/><circle cx="70" cy="50" r="2"/><circle cx="62" cy="56" r="2"/><circle cx="78" cy="45" r="2"/><circle cx="80" cy="55" r="2"/><circle cx="86" cy="50" r="2"/></g>
<circle class="cam-lens" cx="30" cy="50" r="12"/>
<circle class="cam-iris" id="{iid}" cx="30" cy="50" r="5.3"/>
<circle class="cam-glint" cx="26.4" cy="46.4" r="2"/>"""),
    "pole": (100, 100, """
<path class="cam-mount" d="M80,26 V92" stroke-width="6"/>
<path class="cam-mount" d="M80,30 H44" stroke-width="6"/>
<path class="cam-mount" d="M52,30 V40" stroke-width="5"/>
<rect class="cam-shell" x="10" y="40" width="72" height="30" rx="7"/>
<rect class="cam-panel" x="54" y="47" width="22" height="16" rx="3"/>
<g class="cam-dot"><circle cx="60" cy="51" r="2"/><circle cx="70" cy="51" r="2"/><circle cx="60" cy="59" r="2"/><circle cx="70" cy="59" r="2"/></g>
<circle class="cam-lens" cx="32" cy="55" r="12"/>
<circle class="cam-iris" id="{iid}" cx="32" cy="55" r="5.3"/>
<circle class="cam-glint" cx="28.4" cy="51.2" r="2"/>"""),
    # The glasses take the void iris. cameras.css is explicit about why: the
    # lens body is already cream, so a filled iris turns the pair into welding
    # goggles and eats the figure-of-eight silhouette. The glare bars carry
    # the state instead.
    "glasses": (100, 74, """
<path class="cam-mount" d="M8,44 L2,32 M92,44 L98,32" stroke-width="5"/>
<path class="cam-shell" d="M50,45 C65,25 90,25 90,45 C90,65 65,65 50,45 C35,25 10,25 10,45 C10,65 35,65 50,45 Z" stroke-linecap="round"/>
<path class="cam-glare" d="M22,52 L34,38 M29,53 L37,44"/>
<path class="cam-glare" d="M66,52 L78,38 M73,53 L81,44"/>
<circle class="cam-iris cam-iris--void" id="{iid}-l" cx="28" cy="45" r="9"/>
<circle class="cam-iris cam-iris--void" id="{iid}-r" cx="72" cy="45" r="9"/>"""),
}


def camera(kind, x, y, size, lens, iid):
    """One inlined camera as a positioned group.

    `lens` is the cameras.css state. "spent" where the archive holds a graded
    reference against that family, "live" otherwise. A project alone never
    spends a lens: a catalogue entry is a claim about intent, not a documented
    result, and the lens vocabulary is reserved for results. There is no
    faded, in-between camera any more — a lit lens on an old row and a lit
    lens on a present-day row say the same thing, and the legend says it once.
    """
    vw, vh, body = CAMS[kind]
    scale = size / vw
    return (f'<g class="cam-fig" data-lens="{lens}" '
            f'transform="translate({x:.1f},{y:.1f}) scale({scale:.4f})">'
            f'{body.format(iid=iid).strip()}</g>')


# ---------------------------------------------------------------------------
# 3. The marks. Two sources, told apart by shape; one colour axis, the ring.
#
#    reference   circle — a lens at chart scale, dark barrel, iris = grade
#    project     square / diamond / triangle / hexagon = kind, no iris
#    ring        pink = aimed at a face system, yellow = another target
#
#    Both pink and yellow sit on the dark barrel, which is the seating the
#    palette requires of them; neither ever touches the orange directly.
# ---------------------------------------------------------------------------
def shape(m, r):
    if m["source"] == "ref":
        return (f'<circle class="gen-mark__lens" r="{r:.1f}"/>'
                f'<circle class="gen-mark__iris" r="{r * 0.44:.1f}"/>')
    k = m["kind"]
    if k == "commercial":
        s = r * 0.9
        return f'<rect class="gen-mark__lens" x="{-s:.1f}" y="{-s:.1f}" width="{2 * s:.1f}" height="{2 * s:.1f}"/>'
    if k == "art":
        d = r * 1.22
        return f'<polygon class="gen-mark__lens" points="0,{-d:.1f} {d:.1f},0 0,{d:.1f} {-d:.1f},0"/>'
    if k == "research":
        R = r * 1.3
        return (f'<polygon class="gen-mark__lens" points="0,{-R + r * 0.15:.1f} '
                f'{R * 0.866:.1f},{R * 0.5 + r * 0.15:.1f} {-R * 0.866:.1f},{R * 0.5 + r * 0.15:.1f}"/>')
    R = r * 1.1   # other: hexagon
    pts = " ".join(f"{R * c:.1f},{R * s:.1f}" for c, s in
                   ((1, 0), (0.5, 0.866), (-0.5, 0.866), (-1, 0), (-0.5, -0.866), (0.5, -0.866)))
    return f'<polygon class="gen-mark__lens" points="{pts}"/>'


def mark(cx, cy, m, r):
    cls = ["gen-mark", f"gen-mark--{m['source']}"]
    cls.append(f"gen-mark--{m['grade']}" if m["source"] == "ref" else f"gen-mark--{m['kind']}")
    if not m["face"]:
        cls.append("gen-mark--adjacent")
    label = html.escape(m["label"], quote=True)
    return (
        f'<a class="gen-marklink" href="{m["href"]}" aria-label="{label}">'
        f'<title>{label}</title>'
        f'<g class="{" ".join(cls)}" transform="translate({cx:.1f},{cy:.1f})">'
        f'<circle class="gen-mark__hit" r="{r + 6:.1f}"/>'
        f'{shape(m, r)}'
        f'</g></a>'
    )


def stacked(marks_in_row, x, gap):
    """Marks that would overlap step away from the line. A mark takes the
    lowest level whose last occupant is at least `gap` to its left; marks
    arrive in year order, so one greedy pass is enough. Same-year entries
    stack, and on the narrow chart so do neighbouring years, where a year is
    narrower than a mark. Returns (mark, level) pairs and the highest level."""
    out, last = [], []
    for m in marks_in_row:
        cx = x(m["year"])
        for level, right_edge in enumerate(last):
            if cx - right_edge >= gap:
                break
        else:
            level = len(last)
            last.append(None)
        last[level] = cx
        out.append((m, level))
    return out, len(last) - 1


def row_layout(marks, x, r, up, down, first_down):
    """Vertical budget of one row. References sit on the line and step up;
    projects hang under it and step down. Returns (refs, projs, above, below)
    where above/below are the extents past the line in chart units."""
    gap = 2 * r + 4
    refs, ref_top = stacked([m for m in marks if m["source"] == "ref"], x, gap)
    projs, proj_top = stacked([m for m in marks if m["source"] == "proj"], x, gap)
    above = r + (ref_top * up if ref_top > 0 else 0)
    below = (first_down + proj_top * down + r) if projs else r
    return refs, projs, above, below


def year_axis(marks):
    """Y1 is the later of this year and the newest entry, so a mark can never
    fall off the right edge and the ruler never stops short of today."""
    return max(datetime.date.today().year, max(m["year"] for m in marks))


def chart_desc(by_row, present_rows):
    n_ref = sum(1 for ms in by_row.values() for m in ms if m["source"] == "ref")
    n_proj = sum(1 for ms in by_row.values() for m in ms if m["source"] == "proj")
    empty = [ROW_BY_KEY[k]["title"].lower() for k in present_rows if not by_row[k]]
    tail = (f" The present-day rows, {' and '.join(empty)}, carry no marks."
            if len(empty) == len(present_rows) else "")
    return (f"{len(ROWS)} rows, oldest system first. The heavy segment of each row is "
            f"the years that family led. Circles on a line are the {n_ref} graded "
            f"entries of the reference archive; squares, diamonds, triangles and "
            f"hexagons under it are the {n_proj} catalogued projects. Each sits at the "
            f"year it was first shown in public.{tail}")


# ---------------------------------------------------------------------------
# 4. Landscape chart — rows of system families against a year axis.
# ---------------------------------------------------------------------------
def chart_landscape(by_row, Y1):
    W, H_TOP, H_BOT = 1240, 66, 34
    LEFT, RIGHT = 392, 46          # RIGHT clears a mark sitting on Y1
    R, UP, DOWN, FIRST_DOWN = 9, 22, 20, 21
    HEAD_ABOVE, HEAD_BELOW, MIN_ROW = 40, 22, 82   # the three-line row header
    plot = W - LEFT - RIGHT
    present = [r["key"] for r in ROWS if r.get("present")]

    def x(year):
        return LEFT + (year - Y0) / (Y1 - Y0) * plot

    layouts = []
    for row in ROWS:
        refs, projs, above, below = row_layout(by_row[row["key"]], x, R, UP, DOWN, FIRST_DOWN)
        above, below = max(above, HEAD_ABOVE), max(below, HEAD_BELOW)
        h = max(MIN_ROW, above + below + 16)
        layouts.append((refs, projs, above, below, h))
    H = H_TOP + sum(l[4] for l in layouts) + H_BOT

    o = [f'<svg class="gen-chart gen-chart--wide" viewBox="0 0 {W} {H}" '
         f'role="img" aria-labelledby="genChartTitle genChartDesc">',
         '<title id="genChartTitle">Documented counter-moves and catalogued projects, '
         'by year and by the family of reading system they address</title>',
         f'<desc id="genChartDesc">{html.escape(chart_desc(by_row, present))}</desc>']

    # year ruler
    for year in range(Y0, Y1 + 1):
        major = year % 5 == 0 or year == Y0
        o.append(f'<line class="gen-tick{" gen-tick--major" if major else ""}" '
                 f'x1="{x(year):.1f}" y1="{H_TOP - 22}" x2="{x(year):.1f}" y2="{H - H_BOT}"/>')
        if major:
            o.append(f'<text class="gen-year" x="{x(year):.1f}" y="{H_TOP - 32}" '
                     f'text-anchor="middle">{year}</text>')

    ytop = H_TOP
    for row, (refs, projs, above, below, h) in zip(ROWS, layouts):
        yc = ytop + (h - (above + below)) / 2 + above
        lens = "spent" if refs else "live"

        # the row line, faint across the axis, then the era span, heavy
        o.append(f'<line class="gen-line" x1="{LEFT:.1f}" y1="{yc:.1f}" x2="{W - RIGHT}" y2="{yc:.1f}"/>')
        s, e = row["span"]
        o.append(f'<line class="gen-span{" gen-span--open" if e is None else ""}" '
                 f'x1="{x(s):.1f}" y1="{yc:.1f}" x2="{x(e if e else Y1):.1f}" y2="{yc:.1f}"/>')

        # header: camera, then span, title and subtitle
        cw = 74 if row["cam"] != "glasses" else 78
        o.append(camera(row["cam"], 24, yc - cw / 2 * (0.74 if row["cam"] == "glasses" else 1),
                        cw, lens, f'gen-iris-{row["key"]}'))
        tx = 118
        # 23px serif has ~17px of cap height above its baseline, so the mono
        # span label needs to sit 32 up, not 25, or the two boxes touch.
        o.append(f'<text class="gen-rowtitle" x="{tx}" y="{yc - 6:.1f}">{html.escape(row["title"])}</text>')
        o.append(f'<text class="gen-rowsub" x="{tx}" y="{yc + 16:.1f}">{html.escape(row["sub"])}</text>')
        o.append(f'<text class="gen-rowspan" x="{tx}" y="{yc - 32:.1f}">'
                 f'{s}&#8211;{e if e else "now"}</text>')

        # marks: references on the line and up, projects under it and down
        for m, level in refs:
            o.append(mark(x(m["year"]), yc - level * UP, m, R))
        for m, level in projs:
            o.append(mark(x(m["year"]), yc + FIRST_DOWN + level * DOWN, m, R))
        if not refs and not projs:
            note = "No documented counter-move." if row.get("present") else "Nothing in the archive yet."
            o.append(f'<text class="gen-empty" x="{x(s) + 16:.1f}" y="{yc - 12:.1f}">'
                     f'{html.escape(note)}</text>')
        ytop += h

    o.append('</svg>')
    return "\n".join(o)


# ---------------------------------------------------------------------------
# 5. Portrait chart — the same rows, stacked, sharing one ruler. Not a rotation
#    of the landscape one: at 390 px a 25-year axis is 300 px wide and fifty
#    marks collide, so each row gets its own full-width strip, and the strip
#    grows with what lands in it.
# ---------------------------------------------------------------------------
def chart_portrait(by_row, Y1):
    W, TOP, BOT = 380, 50, 18
    L, R_ = 14, 24                 # R_ clears a mark sitting on Y1
    R, UP, DOWN, FIRST_DOWN = 6.5, 17, 16, 17
    HEAD = 48                      # camera, title and span above the line
    plot = W - L - R_
    present = [r["key"] for r in ROWS if r.get("present")]

    def x(year):
        return L + (year - Y0) / (Y1 - Y0) * plot

    layouts = []
    for row in ROWS:
        refs, projs, above, below = row_layout(by_row[row["key"]], x, R, UP, DOWN, FIRST_DOWN)
        h = HEAD + max(above, 14) + below + 12
        layouts.append((refs, projs, above, below, h))
    H = TOP + sum(l[4] for l in layouts) + BOT

    o = [f'<svg class="gen-chart gen-chart--narrow" viewBox="0 0 {W} {H}" '
         f'role="img" aria-labelledby="genChartTitleN genChartDescN">',
         '<title id="genChartTitleN">Documented counter-moves and catalogued projects, '
         'by year and by the family of reading system they address</title>',
         f'<desc id="genChartDescN">{html.escape(chart_desc(by_row, present))}</desc>']

    majors = [y for y in range(Y0, Y1 + 1) if y % 5 == 0 or y == Y0]
    for year in majors:
        o.append(f'<line class="gen-tick gen-tick--major" x1="{x(year):.1f}" '
                 f'y1="{TOP - 16}" x2="{x(year):.1f}" y2="{H - BOT}"/>')
        # The last label is right-anchored when it sits within two years of
        # the edge, or it would run out of the box.
        anchor = ("start" if year == Y0 else
                  "end" if year == majors[-1] and Y1 - year <= 2 else "middle")
        # 2001 and 2005 are four years apart, which is 47 px of axis on a
        # 320 px screen — narrower than the two labels. 2005 is the one that
        # gets dropped there; its gridline stays.
        cls = "gen-year gen-year--crowded" if year == 2005 else "gen-year"
        o.append(f'<text class="{cls}" x="{x(year):.1f}" y="{TOP - 24}" '
                 f'text-anchor="{anchor}">{year}</text>')

    y0 = TOP
    for row, (refs, projs, above, below, h) in zip(ROWS, layouts):
        yc = y0 + HEAD + max(above, 14)
        lens = "spent" if refs else "live"
        s, e = row["span"]

        o.append(camera(row["cam"], L, y0 + 4, 42, lens, f'gen-iris-n-{row["key"]}'))
        tx = L + 52
        o.append(f'<text class="gen-rowtitle gen-rowtitle--narrow" x="{tx}" y="{y0 + 22}">'
                 f'{html.escape(row["title"])}</text>')
        o.append(f'<text class="gen-rowspan" x="{tx}" y="{y0 + 40}">'
                 f'{s}&#8211;{e if e else "now"}</text>')

        o.append(f'<line class="gen-line" x1="{L}" y1="{yc:.1f}" x2="{W - R_}" y2="{yc:.1f}"/>')
        o.append(f'<line class="gen-span{" gen-span--open" if e is None else ""}" '
                 f'x1="{x(s):.1f}" y1="{yc:.1f}" x2="{x(e if e else Y1):.1f}" y2="{yc:.1f}"/>')

        for m, level in refs:
            o.append(mark(x(m["year"]), yc - level * UP, m, R))
        for m, level in projs:
            o.append(mark(x(m["year"]), yc + FIRST_DOWN + level * DOWN, m, R))
        if not refs and not projs:
            # On the span-label line, right-anchored: shorter than the wide
            # chart's wording so it clears a two-word row title at 320 px.
            note = "None documented." if row.get("present") else "None yet."
            o.append(f'<text class="gen-empty gen-empty--narrow" x="{W - R_}" '
                     f'y="{y0 + 40}" text-anchor="end">{html.escape(note)}</text>')
        y0 += h

    o.append('</svg>')
    return "\n".join(o)


# ---------------------------------------------------------------------------
# 6. Page chrome. Lifted verbatim from the shipping header and the footer that
#    every other page carries.
# ---------------------------------------------------------------------------
HEADER = """    <header class="gm-site-header">
      <a class="gm-site-wordmark" href="/" aria-label="Ghostmaxxing homepage">
        <img class="gm-site-wordmark__mark" src="/images/logo/mark-color.svg"
          width="40" height="40" alt aria-hidden="true" />
        <span class="gm-site-wordmark__text">
          <span class="gm-site-wordmark__title">Ghostmaxxing</span>
          <span class="gm-site-wordmark__sub">A public lab for testing
            camouflage</span>
        </span>
      </a>
      <nav class="gm-site-nav" aria-label="Primary">
        <a class="gm-site-chip" href="/fediverse.html">in the Fediverse</a>
        <div class="gm-site-nav__group">
          <button class="gm-site-nav__trigger" aria-expanded="false"
            aria-controls="gmSiteMenu">Know more <span
              aria-hidden="true">&#9662;</span></button>
          <div class="gm-site-menu" id="gmSiteMenu">
            <div>
              <p class="gm-site-menu__kicker">Informative</p>
              <ul>
                <li><a href="/about.html">Vision &amp; about</a></li>
                <li><a href="/genealogy.html" aria-current="page">Genealogy</a></li>
                <li><a href="/report.html">Report a deployment</a></li>
                <li><a href="/workshops.html">Workshops</a></li>
              </ul>
            </div>
            <div>
              <p class="gm-site-menu__kicker">Technology</p>
              <ul>
                <li><a href="/lab.html">Open the lab &#8599;</a></li>
                <li><a href="/projects/">Related projects</a></li>
                <li><a href="/docs/">Docs</a></li>
                <li><a href="https://github.com/vecna/ghostmaxxing">Code</a></li>
              </ul>
            </div>
          </div>
        </div>
        <a class="gm-site-cta" href="/report.html">Leak to us &#8599;</a>
      </nav>
    </header>"""

FOOTER = """  <footer class="gm-site-footer">
    <div class="gm-site-footer__pyre" data-mode="full">
      <img src="/images/motifs/pyre.svg" alt aria-hidden="true" />
    </div>
    <img class="gm-site-footer__edge" src="/images/motifs/soil-edge.svg" alt
      aria-hidden="true" />
    <div class="gm-site-footer__row">
      <div class="gm-site-footer__cams">
        <svg class="cam" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <path class="cam-mount" d="M6,29 H94" stroke-width="7"></path>
          <path class="cam-shell" d="M20,29 A30,30 0 0 0 80,29 Z"></path>
          <circle class="cam-lens" cx="50" cy="44" r="15"></circle>
          <circle class="cam-iris" id="iris-foot-dome" cx="50" cy="44" r="6.6"></circle>
          <circle class="cam-glint" cx="45.5" cy="39.5" r="2.55"></circle>
        </svg>
        <svg class="cam" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <path class="cam-mount" d="M80,26 V92" stroke-width="6"></path>
          <path class="cam-mount" d="M80,30 H44" stroke-width="6"></path>
          <path class="cam-mount" d="M52,30 V40" stroke-width="5"></path>
          <rect class="cam-shell" x="10" y="40" width="72" height="30" rx="7"></rect>
          <rect class="cam-panel" x="54" y="47" width="22" height="16" rx="3"></rect>
          <g class="cam-dot"><circle cx="60" cy="51" r="2"></circle><circle cx="70" cy="51" r="2"></circle><circle cx="60" cy="59" r="2"></circle><circle cx="70" cy="59" r="2"></circle></g>
          <circle class="cam-lens" cx="32" cy="55" r="12"></circle>
          <circle class="cam-iris" id="iris-foot-street" cx="32" cy="55" r="5.3"></circle>
          <circle class="cam-glint" cx="28.4" cy="51.2" r="2"></circle>
        </svg>
        <svg class="cam" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <path class="cam-mount" d="M8,44 L2,32 M92,44 L98,32" stroke-width="5"></path>
          <path class="cam-shell" d="M50,45 C65,25 90,25 90,45 C90,65 65,65 50,45 C35,25 10,25 10,45 C10,65 35,65 50,45 Z" stroke-linecap="round"></path>
          <path class="cam-glare" d="M22,52 L34,38 M29,53 L37,44"></path>
          <path class="cam-glare" d="M66,52 L78,38 M73,53 L81,44"></path>
          <circle class="cam-iris cam-iris--void" id="iris-foot-glasses-l" cx="28" cy="45" r="9"></circle>
          <circle class="cam-iris cam-iris--void" id="iris-foot-glasses-r" cx="72" cy="45" r="9"></circle>
        </svg>
        <svg class="cam" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <path class="cam-mount" d="M45,30 V12 M32,12 H58" stroke-width="5"></path>
          <rect class="cam-shell" x="16" y="36" width="66" height="34" rx="5"></rect>
          <path class="cam-mount" d="M12,30 H74 L84,40" stroke-width="5"></path>
          <circle class="cam-lens" cx="60" cy="51" r="14"></circle>
          <circle class="cam-iris" id="iris-foot-bullet" cx="60" cy="51" r="6.2"></circle>
          <circle class="cam-glint" cx="55.8" cy="46.8" r="2.4"></circle>
        </svg>
      </div>
      <div class="gm-site-footer__links">
        <a href="/docs/">Technical documentation</a>
        <a href="https://github.com/vecna/ghostmaxxing">Code</a>
        <a href="/loader.html">Video Loader</a>
      </div>
    </div>
  </footer>"""


def key_lens():
    """A live dome lens at legend size. The row-header cameras use the same
    lens vocabulary as the marks on purpose — a spent lens and a reference
    mean the same thing — so the legend names the lit one, which is the state
    a reader has to be told how to read."""
    vw, vh, body = CAMS["dome"]
    return ('<svg class="gen-key__mark gen-key__mark--cam" viewBox="0 0 100 100" '
            'aria-hidden="true" focusable="false">'
            '<g class="cam-fig" data-lens="live">'
            + body.format(iid="gen-iris-key").strip() + '</g></svg>')


def key_mark(**kw):
    """One legend swatch, drawn by the same shape() the chart uses."""
    m = dict(source="ref", grade="strong", kind="commercial", face=True)
    m.update(kw)
    cls = ["gen-mark", f"gen-mark--{m['source']}",
           f"gen-mark--{m['grade']}" if m["source"] == "ref" else f"gen-mark--{m['kind']}"]
    if not m["face"]:
        cls.append("gen-mark--adjacent")
    return (f'<svg class="gen-key__mark" viewBox="-13 -13 26 26" aria-hidden="true" '
            f'focusable="false"><g class="{" ".join(cls)}">{shape(m, 8.5)}</g></svg>')


def key_span():
    return ('<svg class="gen-key__mark" viewBox="0 0 26 26" aria-hidden="true" '
            'focusable="false"><line class="gen-span" x1="1" y1="13" x2="25" y2="13"/></svg>')


def plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"


# ---------------------------------------------------------------------------
# 7. Assemble the page.
# ---------------------------------------------------------------------------
def build_html(refs, projects, marks, by_row, Y1):
    site_url = "https://ghostmaxxing.vecna.eu"
    page_url = f"{site_url}/genealogy.html"
    page_title = "Genealogy of Face Surveillance — Ghostmaxxing"
    page_description = (
        "What has been shown against which family of face-reading system, and when. "
        "Every mark is an entry in the reference archive or the projects catalogue."
    )
    structured_data = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": f"{page_url}#webpage",
        "name": page_title,
        "description": page_description,
        "url": page_url,
        "inLanguage": "en",
        "isPartOf": {
            "@type": "WebSite",
            "@id": f"{site_url}/#website",
            "url": f"{site_url}/",
            "name": "Ghostmaxxing",
        },
        "publisher": {
            "@type": "Organization",
            "@id": "https://nina.watch/#organization",
            "name": "NINA / Universal Digital Union",
            "url": "https://nina.watch/",
        },
        "mainEntity": {
            "@type": "ItemList",
            "numberOfItems": len(marks),
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": position,
                    "item": {
                        "@type": "CreativeWork",
                        "name": mark["label"],
                        "url": f"{site_url}{mark['href']}",
                        "datePublished": str(mark["year"]),
                    },
                }
                for position, mark in enumerate(marks, start=1)
            ],
        },
    }
    structured_json = json.dumps(structured_data, ensure_ascii=False, indent=2).replace("<", "\\u003c")
    n_ref, n_proj = len(refs), len(projects)
    strong = sum(1 for m in marks if m["source"] == "ref" and m["grade"] == "strong")
    commercial = sum(1 for m in marks if m["source"] == "proj" and m["kind"] == "commercial")
    present = [r for r in ROWS if r.get("present")]
    p_ref = sum(1 for r in present for m in by_row[r["key"]] if m["source"] == "ref")
    p_proj = sum(1 for r in present for m in by_row[r["key"]] if m["source"] == "proj")
    present_names = " and ".join(r["title"].lower() for r in present)

    # The one sentence that states the finding. Generated, so it stays true
    # when the archive catches up with the present-day rows.
    if p_ref == 0 and p_proj == 0:
        punch = (f"{present_names.capitalize()}: no graded reference, no catalogued "
                 f"project.")
    elif p_ref == 0:
        punch = (f"{present_names.capitalize()}: {plural(p_proj, 'catalogued project')}, "
                 f"no graded reference.")
    else:
        punch = (f"{present_names.capitalize()}: {plural(p_ref, 'graded reference')}, "
                 f"{plural(p_proj, 'catalogued project')}.")

    cards = []
    for row in ROWS:
        ms = by_row[row["key"]]
        nr = sum(1 for m in ms if m["source"] == "ref")
        np_ = sum(1 for m in ms if m["source"] == "proj")
        classes = ["gen-row"] + (["gen-row--present"] if row.get("present") else [])
        s, e = row["span"]
        kicker = f"{s}&#8211;{e}" if e else f"{s}&#8211;now"
        verdict = (f"{'No reference' if nr == 0 else plural(nr, 'reference')}, "
                   f"{'no project' if np_ == 0 else plural(np_, 'project')}.")
        cards.append(
            f'      <article class="{" ".join(classes)}">\n'
            f'        <p class="gen-row__kicker">{kicker}</p>\n'
            f'        <h2 class="gen-row__title">{html.escape(row["title"])}</h2>\n'
            f'        <p class="gen-row__sub">{html.escape(row["sub"])}</p>\n'
            f'        <p class="gen-row__body">{html.escape(row["body"])}</p>\n'
            f'        <p class="gen-row__verdict">{verdict}</p>\n'
            f'      </article>'
        )

    key_refs = "\n".join(
        f'          <dd>{key_mark(grade=g)} {GRADE_LABEL[g]}</dd>' for g in ("strong", "paper", "context"))
    key_projs = "\n".join(
        f'          <dd>{key_mark(source="proj", kind=k)} {KIND_LABEL[k]}</dd>' for k in KIND_ORDER)

    return f"""<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(page_title)}</title>
  <meta name="description"
    content="{html.escape(page_description, quote=True)}" />
  <link rel="canonical" href="{page_url}" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#14100c" />
  <link rel="icon" type="image/svg+xml" href="/images/logo/mark-color.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="/images/logo/favicon-32.png" />
  <link rel="apple-touch-icon" href="/images/logo/favicon-180.png" />
  <meta property="og:title" content="{html.escape(page_title, quote=True)}" />
  <meta property="og:description" content="{html.escape(page_description, quote=True)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{page_url}" />
  <meta property="og:image" content="{site_url}/images/social/ghostmaxxing-generic.jpg" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Ghostmaxxing: test face-recognition camouflage in your browser." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{html.escape(page_title, quote=True)}" />
  <meta name="twitter:description" content="{html.escape(page_description, quote=True)}" />
  <meta name="twitter:image" content="{site_url}/images/social/ghostmaxxing-generic.jpg" />
  <meta name="twitter:image:alt" content="Ghostmaxxing: test face-recognition camouflage in your browser." />
  <script type="application/ld+json">
{structured_json}
  </script>

  <!-- One shared stylesheet, then one page stylesheet. -->
  <link rel="stylesheet" href="/styles/styles.css" />
  <link rel="stylesheet" href="/styles/genealogy.css" />
</head>

<body>

<!-- ---------------------------------------------------------------------------
     GENERATED FILE. Do not hand-edit.

       python3 scripts-dev/build-genealogy.py      (npm run update:genealogy)

     Every mark below is placed from references/REFERENCES.json and
     projects/PROJECTS.json, so the page cannot drift away from the archive
     it cites. Edit a dataset, or edit ROWS in the build script, and re-run.
     ------------------------------------------------------------------------ -->

<div class="gm-page">
{HEADER}

  <div class="wrap">
    <section class="gen-hero">
      <div class="gen-hero__lede">
        <h1>Genealogy of Face Surveillance</h1>
        <p class="gen-hero__statement">Which interventions affected earlier
          systems, where they stopped working, and what is still untested
          against today&#8217;s pipelines.</p>
      </div>
      <div class="gen-hero__how">
        <p class="gen-hero__kicker">How to read this</p>
        <p>One row per family of face-reading system, oldest first. The heavy
          segment is the years that family led. Circles on the line are graded
          entries in the <a href="/references/">reference archive</a>; the
          shapes under it are catalogued <a href="/projects/">projects</a>.
          Each sits at the year it was first shown in public and links to its
          entry.</p>
        <p class="gen-hero__punch">{punch}</p>
      </div>
    </section>
  </div>

  <div class="wrap">
    <figure class="gen-figure">
{chart_landscape(by_row, Y1)}
{chart_portrait(by_row, Y1)}
      <figcaption>
        <dl class="gen-key">
        <div class="gen-key__group">
          <dt>References, on the line</dt>
{key_refs}
        </div>
        <div class="gen-key__group">
          <dt>Projects, under the line</dt>
{key_projs}
        </div>
        <div class="gen-key__group">
          <dt>Ring</dt>
          <dd>{key_mark(grade="paper")} aimed at a face system</dd>
          <dd>{key_mark(grade="paper", face=False)} aimed at another target: a person or object detector, a plate reader, a sensor, a camera flash</dd>
        </div>
        <div class="gen-key__group">
          <dt>Row</dt>
          <dd>{key_span()} years this family led</dd>
          <dd>{key_lens()} lit lens: no graded reference against this family</dd>
        </div>
        </dl>
      </figcaption>
    </figure>

    <div class="gen-rows">
{chr(10).join(cards)}
    </div>

    <p class="gen-note gm-prose">Dates comes from first web appearance.
      A reference is a documented result under stated conditions; the
      conditions should be in the archive entry, but reproduceability isn't assured. A project is a
      catalogued product, prototype, artwork or practice. Those products should be tested and ranked. Ghostmaxxing wants to be an hub for such evaluations.
      Currently considered are {n_ref} references, {strong} of them with code or
      artefacts published. {n_proj} projects, {commercial} of them commercial.
      <a href="/about.html">If you know any project that should be referenced here, please get in touch</a>.</p>
  </div>
</div>

{FOOTER}

  <script src="/pages-js/nav.js" defer></script>
</body>

</html>
"""


# ---------------------------------------------------------------------------
# 8. The page stylesheet. Layer: PAGE. Placement only — every colour and every
#    type step comes from tokens.css, and the cameras and the site chrome are
#    drawn by cameras.css and chrome.css.
# ---------------------------------------------------------------------------
CSS = """/* ============================================================================
   genealogy.css — placement for genealogy.html.

   Layer: PAGE. Depends on tokens.css for every value, cameras.css for the
   camera fleet and its lens states, chrome.css for the header and footer.
   Defines no --gm-* token and draws no component.

   GENERATED by scripts-dev/build-genealogy.py together with genealogy.html.
   Edit the CSS string in that script, not this file.

   WHAT THIS REPLACED
   The previous file placed a collage: a plume column built from three tiled
   background SVGs, a canopy, four absolutely positioned wind slots, four
   whirlwind <img>s and a pyre strip, with per-breakpoint overrides holding
   them in register. Roughly 290 KB, and at 390 px the wind was display:none.

   There are no background images in this file. Everything is either type,
   a rule, or geometry inside one of the two <svg> charts.

   Contents
     1. Page shell
     2. Hero
     3. The chart, and the orientation swap
     4. Chart parts: ruler, rows, spans, marks, legend
     5. Row cards
     6. Note
     7. Narrow
     8. Reduced motion, forced colours, print
   ========================================================================= */


/* --- 1. Page shell --------------------------------------------------------- */

.gm-page {
  background: var(--gm-bg);
  overflow-x: hidden;
}

.wrap {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 0 clamp(18px, 4vw, 40px);
}


/* --- 2. Hero ---------------------------------------------------------------
   Two columns: the claim, and how to read the thing that supports it. The
   legend sits under the chart, where the marks it describes are. */

.gen-hero {
  display: grid;
  gap: clamp(1.5rem, 4vw, 3.5rem);
  grid-template-columns: 1fr;
  padding: clamp(1.5rem, 4vw, 3rem) 0 clamp(1.75rem, 4vw, 2.75rem);
}

@media (min-width: 62rem) {
  .gen-hero {
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    align-items: end;
  }
}

.gen-hero h1 {
  margin: 0 0 0.6rem;
  font-family: var(--serif);
  font-weight: 700;
  font-size: var(--t-h1);
  line-height: var(--lh-heading);
  letter-spacing: var(--ls-display);
  color: var(--gm-ink);
}

.gen-hero__statement {
  margin: 0;
  max-width: 32ch;
  font-family: var(--serif);
  font-weight: 700;
  font-size: var(--t-lead);
  line-height: var(--lh-lead);
  color: var(--gm-ink);
}

.gen-hero__how {
  max-width: 46ch;
}

.gen-hero__how p {
  margin: 0 0 0.7rem;
  font-size: var(--t-body);
  line-height: var(--lh-body);
  color: var(--gm-text);
}

/* base.css strips underlines site-wide. These two links are the route from
   the chart to what it cites, so they get theirs back. */
.gen-hero__how a {
  color: var(--gm-green-deep);
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.15em;
}

.gen-hero__kicker {
  font-family: var(--mono);
  font-size: var(--t-meta);
  font-weight: 600;
  letter-spacing: var(--ls-meta);
  text-transform: uppercase;
  color: var(--gm-green-deep);
}

/* The one sentence that states the finding. Ink on cream, because the same
   sentence on the orange is the mistake the old page made with its Limits
   lines: 2.65:1 and nobody read them. Scoped through the parent so it beats
   `.gen-hero__how p` on specificity rather than on !important. */
.gen-hero__how .gen-hero__punch {
  padding: 0.7rem 0.9rem;
  background: var(--gm-cream);
  border: 2px solid var(--gm-ink);
  box-shadow: 4px 4px 0 rgba(10, 10, 8, 0.16);
  font-weight: 700;
  color: var(--gm-ink);
}


/* --- 3. The chart ----------------------------------------------------------
   Two <svg> blocks, one shown at a time. SVG geometry cannot reflow: a
   25-year horizontal axis that reads at 1440 px is 300 px wide on a phone,
   where fifty marks collide. So the wide chart is rows against one axis and
   the narrow one is the same rows as stacked strips, generated from the same
   data by the same code. */

.gen-figure {
  margin: 0;
}

.gen-chart {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.gen-chart--narrow {
  display: none;
  /* Capped, or a 1024 px screen stretches a 380-unit viewBox to 944 px and
     every label with it: the 12 px year ruler would render at 30 px. Centred
     so the cap reads as a decision rather than as a broken float. */
  max-width: 34rem;
  margin-inline: auto;
}

/* The switch is set by the smallest type in the wide chart, not by a device.
   Its mono labels are 12 units in a 1240-unit box, so they render at
   12 x (content width / 1240). Below about 1120 px of viewport the content box
   is near 1040 px and that lands at 10 px, which is the floor for a
   letter-spaced mono label. Under it, the stacked chart takes over. */
@media (max-width: 70rem) {
  .gen-chart--wide { display: none; }
  .gen-chart--narrow { display: block; }
}


/* --- 4. Chart parts -------------------------------------------------------- */

.gen-tick {
  stroke: var(--gm-ink);
  stroke-opacity: 0.14;
  stroke-width: 1;
}

.gen-tick--major {
  stroke-opacity: 0.34;
}

.gen-year {
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  fill: var(--gm-green-deep);
}

/* The row line runs the whole axis so a mark landing before or after a
   family led still has a line to land on — which is the point of drawing the
   span separately. */
.gen-line {
  stroke: var(--gm-ink);
  stroke-opacity: 0.3;
  stroke-width: 2;
}

.gen-span {
  stroke: var(--gm-ink);
  stroke-width: 5;
  stroke-linecap: butt;
}

/* An open-ended span has no end date, so it must not read as one. */
.gen-span--open {
  stroke-dasharray: 26 7;
}

.gen-rowtitle {
  font-family: var(--serif);
  font-weight: 700;
  font-size: 23px;
  letter-spacing: -0.02em;
  fill: var(--gm-ink);
}

.gen-rowtitle--narrow {
  font-size: 16px;
}

.gen-rowsub,
.gen-rowspan {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.05em;
  fill: var(--gm-green-deep);
}

.gen-rowspan {
  font-weight: 600;
  letter-spacing: var(--ls-meta);
}

/* An empty row is the finding, so it says so in words rather than by being
   blank. Serif italic, not the mono of a label: it is a sentence. */
.gen-empty {
  font-family: var(--serif);
  font-style: italic;
  font-size: 17px;
  fill: var(--gm-ink);
}

.gen-empty--narrow {
  font-size: 13px;
  font-style: normal;
  font-family: var(--mono);
  fill: var(--gm-green-deep);
}


/* --- 4b. Marks -------------------------------------------------------------
   One mark is one entry. Two sources, told apart by shape, and one colour
   axis, the ring:

     reference   circle: a spent lens at chart scale — dark barrel, ring,
                 and an iris that carries the evidence grade
                   strong   iris in the ring colour   code, artefact or build files
                   paper    dark iris                 paper or documented project
                   context  cream iris                survey or artwork documentation
     project     square / diamond / triangle / hexagon = kind, no iris
     ring        pink    aimed at a face system
                 yellow  aimed at another target (person or object detector,
                         plate reader, sensor, camera flash)

   Pink and yellow both sit on the dark barrel. That is the seating the
   palette requires of them; neither touches the orange. */

.gen-marklink {
  cursor: pointer;
}

.gen-mark__hit {
  fill: transparent;
}

.gen-mark__lens {
  fill: var(--gm-green-deep);
  stroke: var(--gm-pink);
  stroke-width: 3;
  stroke-linejoin: round;
}

.gen-mark__iris {
  fill: var(--gm-pink);
}

.gen-mark--adjacent .gen-mark__lens {
  stroke: var(--gm-yellow);
}

.gen-mark--adjacent .gen-mark__iris {
  fill: var(--gm-yellow);
}

.gen-mark--paper .gen-mark__iris {
  fill: var(--gm-green-deep);
}

.gen-mark--context .gen-mark__iris {
  fill: var(--gm-cream);
}

.gen-marklink:hover .gen-mark__lens,
.gen-marklink:focus-visible .gen-mark__lens {
  stroke-width: 6;
}

.gen-marklink:focus-visible {
  outline: var(--gm-focus-ring);
  outline-offset: 4px;
}


/* --- 4c. Legend ------------------------------------------------------------
   A definition list in four groups, so the two shape vocabularies and the
   one colour rule read as three separate decisions rather than one long row
   of swatches. */

.gen-key {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 0.9rem 1.9rem;
  margin: 0.5rem 0 0;
  padding: 1.1rem 0 0;
  border-top: 2px solid var(--gm-ink);
}

.gen-key dt {
  margin: 0 0 0.35rem;
  font-family: var(--mono);
  font-size: var(--t-meta);
  font-weight: 600;
  letter-spacing: var(--ls-meta);
  text-transform: uppercase;
  color: var(--gm-green-deep);
}

.gen-key dd {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0 0 0.3rem;
  font-size: var(--t-small);
  line-height: 1.4;
  color: var(--gm-text);
}

.gen-key__mark {
  width: 22px;
  height: 22px;
  flex: none;
  overflow: visible;
  margin-top: -0.05rem;
}

.gen-key__mark--cam {
  width: 26px;
  height: 26px;
}


/* --- 5. Row cards ----------------------------------------------------------
   The prose that used to be the era dossiers. It stays in HTML rather than in
   the SVG because SVG <text> does not wrap. */

.gen-rows {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(16.5rem, 1fr));
  margin: clamp(2rem, 5vw, 3.25rem) 0 0;
}

.gen-row {
  border-top: 2px solid var(--gm-ink);
  padding-top: 0.7rem;
}

.gen-row__kicker {
  margin: 0;
  font-family: var(--mono);
  font-size: var(--t-meta);
  font-weight: 600;
  letter-spacing: var(--ls-meta);
  text-transform: uppercase;
  color: var(--gm-green-deep);
}

.gen-row__title {
  margin: 0.15rem 0 0.1rem;
  font-family: var(--serif);
  font-weight: 700;
  font-size: var(--t-h3);
  line-height: var(--lh-heading);
  letter-spacing: -0.02em;
  color: var(--gm-ink);
}

.gen-row__sub {
  margin: 0 0 0.5rem;
  font-family: var(--mono);
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  color: var(--gm-green-deep);
}

.gen-row__body {
  margin: 0 0 0.6rem;
  font-size: var(--t-small);
  line-height: 1.5;
  color: var(--gm-text);
}

.gen-row__verdict {
  margin: 0;
  font-size: var(--t-small);
  font-weight: 700;
  color: var(--gm-ink);
}

/* The two present-day rows carry the finding, so they get the surface. Absence
   set in the same typography as presence is the argument. */
.gen-row--present {
  padding: 0.9rem 1.05rem 1.05rem;
  background: var(--gm-cream);
  border: 2px solid var(--gm-ink);
  box-shadow: 4px 4px 0 rgba(10, 10, 8, 0.16);
}


/* --- 6. Note ---------------------------------------------------------------
   The claims-grading footnote. Ink on cream, 12:1. */

.gen-note {
  max-width: 62ch;
  margin: clamp(2rem, 5vw, 3rem) 0 clamp(2.5rem, 6vw, 4rem);
  padding: 1.1rem 1.25rem;
  background: var(--gm-cream);
  border-inline-start: 5px solid var(--gm-ink);
  font-size: var(--t-small);
  line-height: 1.55;
  color: var(--gm-ink);
}

.gen-note a {
  color: var(--gm-green);
}


/* --- 7. Narrow ------------------------------------------------------------- */

@media (max-width: 42rem) {
  .gen-hero {
    padding-top: 1.25rem;
  }

  .gen-key {
    grid-template-columns: 1fr;
    gap: 0.8rem;
  }

  .gen-rows {
    grid-template-columns: 1fr;
  }
}

/* A 320 px screen leaves the stacked chart 284 px, where its 12.5-unit year
   ruler renders at 9 px. Give the gutter back and raise the ruler: 300 px of
   chart puts it at 11.8 px. This is the only tier that needs the exception. */
@media (max-width: 24rem) {
  .wrap {
    padding-inline: 10px;
  }

  .gen-chart--narrow .gen-year {
    font-size: 15px;
  }

  .gen-chart--narrow .gen-year--crowded {
    display: none;
  }

  .gen-chart--narrow .gen-rowspan {
    font-size: 14px;
  }
}


/* --- 8. Reduced motion, forced colours, print ------------------------------ */

@media (prefers-reduced-motion: reduce) {
  .gen-mark__lens,
  .cam-fig .cam-iris,
  .cam-fig .cam-glint {
    transition: none;
  }
}

/* In forced-colours mode the palette is the OS's. Shape still tells the two
   sources apart; the ring colour cannot, so the other-target ring goes
   dashed instead. */
@media (forced-colors: active) {
  .gen-mark__lens,
  .gen-span,
  .gen-line {
    stroke: CanvasText;
  }

  .gen-mark--adjacent .gen-mark__lens {
    stroke-dasharray: 3 2;
  }

  .gen-mark__iris {
    fill: CanvasText;
  }

  .gen-mark--context .gen-mark__iris {
    fill: Canvas;
  }

  .gen-hero__punch,
  .gen-row--present,
  .gen-note {
    border-color: CanvasText;
    box-shadow: none;
  }
}

@media print {
  .gm-page,
  .gen-hero__punch,
  .gen-row--present,
  .gen-note {
    background: #fff;
  }

  .gm-site-header,
  .gm-site-footer {
    display: none;
  }

  /* The wide chart is the one that fits a sheet of paper. */
  .gen-chart--wide { display: block; }
  .gen-chart--narrow { display: none; }
  .gen-figure { break-inside: avoid; }

  .gen-rows {
    grid-template-columns: repeat(2, 1fr);
  }
}
"""


def main():
    refs, projects, marks = load_marks()
    by_row = {r["key"]: [m for m in marks if m["row"] == r["key"]] for r in ROWS}
    Y1 = year_axis(marks)

    out_html = os.path.join(ROOT, "genealogy.html")
    out_css = os.path.join(ROOT, "styles", "genealogy.css")
    with open(out_html, "w", encoding="utf-8") as fh:
        fh.write(build_html(refs, projects, marks, by_row, Y1))
    with open(out_css, "w", encoding="utf-8") as fh:
        fh.write(CSS)

    print(f"genealogy.html       {os.path.getsize(out_html):>7,} B")
    print(f"styles/genealogy.css {os.path.getsize(out_css):>7,} B")
    print(f"axis {Y0}-{Y1}; {len(refs)} references + {len(projects)} projects -> "
          + ", ".join(f"{r['key']}:{sum(1 for m in by_row[r['key']] if m['source'] == 'ref')}"
                      f"+{sum(1 for m in by_row[r['key']] if m['source'] == 'proj')}" for r in ROWS)
          + "  (references+projects)")
    lit = [r["title"] for r in ROWS if not any(m["source"] == "ref" for m in by_row[r["key"]])]
    print("lit lenses (no graded reference):", "; ".join(lit) or "none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
