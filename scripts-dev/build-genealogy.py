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
import re
import xml.etree.ElementTree as ET
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
        body="Facial geometry described through distances between landmarks.",
        targets={"face-landmarks"},
    ),
    dict(
        key="embeddings", cam="cube",
        span=(2014, 2016),
        title="Learned embeddings",
        sub="DeepFace · FaceNet · ArcFace · deep detectors",
        body="Neural networks learn numerical representations for comparison. "
             "Related architectures also detect people, objects and number plates.",
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
        body="Networked cameras feed shared, searchable indexes.",
        targets={"networked-surveillance", "watchlist-matching"},
    ),
    dict(
        key="wearable", cam="glasses",
        span=(2020, None), present=True,
        title="Wearable readers",
        sub="Pervert glasses · body-worn",
        body="Wearable cameras record at eye level and can be difficult to notice.",
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
# 2. Cameras. Geometry is read from images/icons, never maintained here.
#    Copies in generated genealogy.html are build output. The glasses retain
#    the existing 74-unit layout height; their source viewBox remains 100x100.
# ---------------------------------------------------------------------------
def load_camera(name, layout_height=100):
    path = os.path.join(ROOT, "images", "icons", f"cam-{name}.svg")
    with open(path, encoding="utf-8") as source:
        svg = source.read()
    root = ET.fromstring(svg)
    vx, vy, vw, vh = map(float, root.attrib["viewBox"].split())
    if (vx, vy, vw, vh) != (0, 0, 100, 100):
        raise ValueError(f"Unexpected camera viewBox in {path}")
    body = re.sub(r"^.*?<svg\b[^>]*>", "", svg, count=1, flags=re.S)
    body = re.sub(r"</svg>\s*$", "", body).strip()
    ids = re.findall(r'\bid="([^"]+)"', body)
    for original in ids:
        suffix = "" if len(ids) == 1 else "-" + original.rsplit("-", 1)[-1]
        target = "{iid}" + suffix
        body = body.replace(f'id="{original}"', f'id="{target}"')
        body = body.replace(f'url(#{original})', f'url(#{target})')
        body = body.replace(f'href="#{original}"', f'href="#{target}"')
    return vw, layout_height, body


CAMS = {
    "bullet": load_camera("bullet"),
    "dome": load_camera("dome"),
    "cube": load_camera("cube"),
    "pill": load_camera("pill"),
    "pole": load_camera("street"),
    "glasses": load_camera("glasses", layout_height=74),
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
HEADER = """    <!-- NAVIGATION: intentionally duplicated in pages and generators. See tutorials/navigation-maintenance.md. -->
<header class="gm-site-header">
  <a class="gm-site-wordmark" href="/" aria-label="Ghostmaxxing homepage">
    <img class="gm-site-wordmark__mark" src="/images/logo/mark-color.svg" width="40" height="40" alt="" aria-hidden="true">
    <span class="gm-site-wordmark__text"><span class="gm-site-wordmark__title">Ghostmaxxing</span><span class="gm-site-wordmark__sub">A public lab for testing camouflage</span></span>
  </a>
  <button class="gm-site-nav-toggle" type="button" aria-expanded="false" aria-controls="gmPrimaryNav" hidden>Menu</button>
  <nav class="gm-site-nav" id="gmPrimaryNav" aria-label="Primary">
<details class="gm-site-nav__group gm-site-nav__group--tools">
  <summary class="gm-site-nav__trigger" aria-controls="gmToolsMenu">Tools <span aria-hidden="true">▾</span></summary>
  <div class="gm-site-menu" id="gmToolsMenu"><ul>
  <li><a href="/lab.html">Camouflage lab</a><small>Apply Ghostyles and compare local results.</small></li>
  <li><a href="/loader.html">Video analyser</a><small>Analyse a recorded makeup video.</small></li>
  <li><a href="/realtime.html">Makeup Explorer</a><small>See how makeup changes face descriptors in real time.</small></li>
</ul></div>
</details>
<details class="gm-site-nav__group ">
  <summary class="gm-site-nav__trigger" aria-controls="gmExploreMenu">Explore <span aria-hidden="true">▾</span></summary>
  <div class="gm-site-menu" id="gmExploreMenu"><div><p class="gm-site-menu__kicker">Understand</p><ul>
  <li><a href="/about.html">About Ghostmaxxing</a></li>
  <li><a href="/genealogy.html" aria-current="page">Genealogy</a></li>
  <li><a href="/references/">Research references</a></li>
  <li><a href="/projects/">Related projects</a></li>
</ul></div><div><p class="gm-site-menu__kicker">Use and contribute</p><ul>
  <li><a href="/docs/">Documentation</a></li>
  <li><a href="/gallery.html">Gallery</a></li>
  <li><a href="/fediverse.html">Fediverse integration</a></li>
  <li><a href="https://github.com/vecna/ghostmaxxing">Source code ↗</a></li>
</ul></div></div>
</details>
<details class="gm-site-nav__group gm-site-nav__group--nina">
  <summary class="gm-site-nav__trigger" aria-controls="gmNinaMenu">Ghòstati! / NINA <span aria-hidden="true">▾</span></summary>
  <div class="gm-site-menu" id="gmNinaMenu"><div><p class="gm-site-menu__intro">Workshops, collective action and confidential reporting, organised by NINA’s Universal Union.</p><ul>
  <li><a href="https://sindacato.nina.watch/it/blog/">Union blog · Italiano ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/blog/">Union blog · English ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/initiatives/ghostati/">Ghòstati! initiative &amp; workshops ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/ghostati/report/">Confidential reporting at NINA ↗</a></li>
</ul></div></div>
</details>
  </nav>
  <a class="gm-site-cta" href="/lab.html">Open the lab</a>
</header>"""

FOOTER = """  <!-- FOOTER: intentionally duplicated; update the generator copies too. -->
<footer class="gm-site-footer">
  <div class="gm-site-footer__pyre" data-mode="cropped"><img src="/images/motifs/pyre.svg" alt="" aria-hidden="true"></div>
  <img class="gm-site-footer__edge" src="/images/motifs/soil-edge.svg" alt="" aria-hidden="true">
  <div class="gm-site-footer__inner">
    <a class="gm-site-footer__brand" href="/"><img src="/images/logo/mark-ondark.svg" width="32" height="32" alt="" aria-hidden="true">Ghostmaxxing</a>
    <nav class="gm-site-footer__columns" aria-label="Footer">
<section><h2>Tools</h2><ul>
  <li><a href="/lab.html">Camouflage lab</a></li>
  <li><a href="/loader.html">Video analyser</a></li>
  <li><a href="/realtime.html">Makeup Explorer</a></li>
</ul></section>
<section><h2>Research</h2><ul>
  <li><a href="/genealogy.html" aria-current="page">Genealogy</a></li>
  <li><a href="/references/">Research references</a></li>
  <li><a href="/projects/">Related projects</a></li>
</ul></section>
<section><h2>Project</h2><ul>
  <li><a href="/about.html">About Ghostmaxxing</a></li>
  <li><a href="/gallery.html">Gallery</a></li>
<li><a href="/docs/">Documentation</a></li>
  <li><a href="/docs/jsdoc/">API reference</a></li>
  <li><a href="/fediverse.html">Fediverse integration</a></li>
  <li><a href="https://github.com/vecna/ghostmaxxing">Source code ↗</a></li>
  <li><a href="https://github.com/vecna/gstmxx-backend">Backend source ↗</a></li>
</ul></section>
<section><h2>Ghòstati! at NINA</h2><ul>
  <li><a href="https://sindacato.nina.watch/it/blog/">Union blog · Italiano ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/blog/">Union blog · English ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/initiatives/ghostati/">Ghòstati! initiative &amp; workshops ↗</a></li>
  <li><a href="https://sindacato.nina.watch/en/ghostati/report/">Confidential reporting at NINA ↗</a></li>
</ul></section>
    </nav>
    <p class="gm-site-footer__responsibility">Ghostmaxxing develops the software. Ghòstati!, part of <a href="https://sindacato.nina.watch/en/">NINA’s Universal Union ↗</a>, organises workshops and handles confidential reporting.</p>
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
    page_description = "A timeline linking face-reading systems to documented research, artworks and projects."
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
        "author": {
            "@type": "Person",
            "@id": "https://me.vecna.eu/#vecna",
            "name": "Claudio Agosti",
            "alternateName": "vecna",
            "url": "https://me.vecna.eu/",
            "sameAs": ["https://github.com/vecna", "https://retro.pizza/@vecna"],
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
  <meta property="og:image" content="{site_url}/images/social/ghostmaxxing-pole.jpg" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Orange Ghostmaxxing preview card with an illustrated camera pole." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{html.escape(page_title, quote=True)}" />
  <meta name="twitter:description" content="{html.escape(page_description, quote=True)}" />
  <meta name="twitter:image" content="{site_url}/images/social/ghostmaxxing-pole.jpg" />
  <meta name="twitter:image:alt" content="Orange Ghostmaxxing preview card with an illustrated camera pole." />
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

    <!--
    <p class="gen-note gm-prose">Dates mark first web appearances. Reference entries describe test conditions;
      reproducibility is not assured. Projects include products, prototypes, artworks and practices.
      The archive contains {n_ref} references ({strong} with code or artefacts)
      and {n_proj} projects ({commercial} commercial).
      <a href="/about.html">Suggest a project</a>.
    </p>
    -->
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
