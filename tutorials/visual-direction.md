# (Internal) Ghostmaxxing Visual Direction

## Working definition

Privacy activist and investigator meets public-research platform.

This visual language starts from privacy activism, but it does not sound like policy advocacy. It is investigative, cultural, and public-facing. It wants to reveal what is hidden, document what is unclear, and make biometric systems readable without pretending that visibility alone solves power.

The project is not a neutral tech demo.
It is not a policy campaign.
It is not a cybersecurity product.
It is a public-facing investigative lab about face recognition, camouflage, and the normalization of biometric surveillance.

## Ordered identity labels

Use these labels in this order:

1. activist
2. cultural / exhibition-like
3. editorial

Secondary labels:

- investigative
- public-research
- anti-biometric
- design-led
- technically grounded
- civic-intelligence oriented

Avoid leading with:

- academic
- cyberlab
- advocacy
- startup
- security product
- hacker tool
- policy campaign

The project can contain academic references, technical tests, and political claims, but the public surface should feel activist first, culturally staged second, editorial third.

## Why not “advocacy”

Avoid “advocacy” as a primary frame.

The tone should not suggest polite policy mediation, institutional lobbying, or reformist optimism. The project may still be useful to journalists, lawyers, researchers, civil society groups, and policy people, but its voice comes from privacy activism and investigation.

Better words:

- investigate
- reveal
- document
- test
- map
- contest
- expose
- report
- inspect
- trace
- verify
- archive
- retest

Use carefully:

- campaign
- public-interest
- civic
- rights
- resistance

Avoid as core identity:

- advocate
- awareness campaign
- policy solution
- compliance
- responsible innovation
- trust framework

## Core metaphor

Surveillance is not one machine. It is a lineage.

Every era of face recognition produced its own technology, its own confident
claim, and its own archive of documents that justified it — procurement
records, accuracy figures, pilot reports, press releases. Those documents are
the fuel. They accumulate. They are what makes the next deployment easy to
approve.

And in each era, something interrupted it. A demonstrated intervention: paint,
prosthetics, printed patterns, adversarial makeup. In this system that
interruption is **a gust of pink wind** crossing the column and putting the
lens out. It is not a victory and it is not permanent — it is a documented
result, under stated conditions, on the technology of that moment.

Then the technology moved. The counter-move that worked against one generation
did not survive the next, and the smoke resumed above the cut.

That sequence — documents accumulate, wind interrupts, technology re-emerges —
repeats up the whole page. At the top, where the column opens out, **two
lenses are still reading.** They have not been defeated by anything
demonstrated so far. They are the present tense of the problem.

> A genealogy of interruptions, and the two that have not been interrupted yet.

Ghostmaxxing is what sits at the end of that column: a public lab for testing
whether the next interruption is possible, in your own browser, under your own
conditions.

### What each element carries

| Element | Means |
|---|---|
| The stacked documents / dossiers | What fuelled the surveillance of that era |
| The smoke column | The technology itself, rising and continuing |
| The pink wind | A documented intervention that interrupted it |
| The cut in the column | The moment the lens went out |
| The smoke resuming above | The next generation, unaffected by the last counter-move |
| The two lenses at the canopy | The undefeated present. Live irises, no cut |
| The pyre at the foot | Where the lineage starts — pattern recognition, 1960s |

### Rules this metaphor imposes

- **Pink only ever marks an interruption.** Wind, the cut on a spent lens, the
  rule under a link. It is never a surface, never body text, and never
  decoration. Its contrast against the orange is around 1.1:1, so it can never
  be the only thing carrying a meaning.
- **The two at the top are never shown defeated.** No cut, no pink ring, live
  yellow irises. The day one of them is genuinely defeated is a content change,
  not a style change.
- **A spent lens is still, and permanent.** No animation. The fact that
  something was defeated is information, and information has to survive a
  screenshot, a print, and `prefers-reduced-motion`.
- **Never claim the wind won.** Every interruption is local, conditional and
  temporary. The visual language may be triumphant for exactly one era at a
  time and never about the whole column.

### What this replaces

The earlier direction was a botanical border at the foot of the page whose
blossoms were CCTV housings — surveillance naturalized as landscape. It shipped
as `images/homepage-camera-band.svg` and `.camera-band`.

It is gone. Both the file and the divs have been removed. The landscape idea
survives in exactly one place — the scattered camera field in the homepage hero
— and that is the whole of it. Do not reintroduce the border, and do not
describe the project as being about naturalization: the argument is now about
lineage and interruption, which is a claim about time rather than about
scenery.

## Short style description

Privacy activist and investigator meets public-research platform.

A more visual phrase:

Activist cultural poster + investigative public lab.

A more refined phrase:

Design-led privacy activism with an investigative archive sensibility.

A more international phrase:

An activist, exhibition-like interface for investigating face recognition.

## What this style is

- activist
- culturally staged
- investigative
- editorial
- public-facing
- visually composed
- technically literate
- symbolic
- slightly formal
- direct without being sloganistic
- beautiful but not decorative-only
- unsettling without horror aesthetics

## What this style is not

- cyberpunk
- dark terminal dashboard
- startup SaaS
- academic repository
- policy NGO template
- hacker conference visual identity
- corporate cybersecurity
- beauty brand
- paranoid survival guide
- streetwear-only meme aesthetic
- military/tactical interface

## Visual mood

The mood is:

- bold
- warm
- public
- theatrical
- investigative
- composed
- slightly dissonant
- attractive at first glance
- stranger on second glance

The page should make people feel:
“this is beautiful”
then:
“wait, those flowers are cameras”
then:
“this is about how surveillance becomes ordinary”

## Color direction

**The values are not in this document.** They are in `styles/tokens.css`, which
is the only place a `--gm-*` value may be defined, and this file will drift
from it the moment anyone edits one and not the other.

That is not hypothetical — it already happened. Two `:root` blocks used to sit
in this document, and they specified the v2 orange with the v1 greens, ink,
cream and yellow. Anyone implementing from here got a hybrid that matched
neither stylesheet. Combined with a third copy hiding in `pages.css`, the site
ran three palettes at once and `about.html` rendered a visibly different orange
from `index.html`.

Read the swatches off `visual-styleguide.html` §03 instead. That page reads the
live computed values from the stylesheet at runtime, so it cannot drift.

### The intent, which is what belongs here

- **Orange is the page.** A poster wall, a public notice, a civic warning — not
  neon, not cyberpunk. It is the loudest thing in the system and it is
  deliberately flat.
- **Cream is the surface.** Anything that has to be read at length sits on it.
- **Soil and the greens are the machine.** Housings, lenses, smoke, the ground
  the pyre sits in. Four greens ordered light to dark; nothing picks a green by
  eye.
- **Yellow is a live iris.** Something is reading, right now.
- **Pink is an interruption and nothing else.** See the core metaphor. It is
  reserved, it never carries meaning alone, and it never sits directly on
  orange without cream or dark green underneath.

### One accepted anomaly

The smoke and pyre motifs bake four greens as literal hex across roughly 2,000
`<circle>` elements, and they are the pre-consolidation values. They are
painted files behind `background-image`, so they cannot follow a token.
Re-exporting them to move four dark greens by a few percent was judged not
worth the risk. They are declared as `--gm-smoke-1`…`4` so the values are at
least centralized. Do not use them for anything else.

## Typography

### Headlines

Use a strong black serif display face.

Qualities:
- high contrast
- editorial
- elegant but assertive
- large enough to dominate
- more poster than interface

Good feeling:
- cultural magazine
- exhibition title
- public campaign poster
- manifesto without shouting

Avoid:
- tech sans headlines
- glitch fonts
- fake terminal fonts
- overly nostalgic typewriter styles

### Body text

Use dark navy, not pure black, for body copy.

Qualities:
- readable
- contemporary
- clean
- structured
- precise

Body text should not feel corporate. It should feel like careful public explanation.

### Metadata

Small metadata can use a clean sans or monospace sparingly, but avoid letting the whole page become technical-HUD.

Use monospace only for:
- years
- tags
- reference metadata
- short labels
- testability badges

## Image language

The key image language is contrast between:

1. machine-readable face
2. adversarial / ornamental / human intervention
3. surveillance as naturalized landscape

### Face treatment

The face can be split:

- one side: face-recognition overlay, landmarks, bounding box, confidence markers
- other side: adversarial makeup, dazzle pattern, organic camouflage

Keep it elegant, not sci-fi.

The recognition overlay should be present enough to be legible, but not dominate the aesthetic. Avoid excessive HUD elements, scanline overload, or military target visuals.

### The camera field

Superseded the botanical border. Same instinct — surveillance as
something installed everywhere and looked past — but scattered rather than
botanical, and in the hero rather than the footer.

The homepage builds it at runtime: camera housings of six types, seeded so the
arrangement is stable between loads, rotated slightly, on soil. Tapping one
removes every camera of that type and states a fact about it. The interaction
is the argument — you can clear one kind of camera off the page and the field
is still full.

Reusable as: the homepage hero, social cards, stickers and posters.

Green and yellow on soil. Never on orange — the housings are cream-shelled and
they need a dark ground to read against.

### The plume

The footer and the genealogy both use the smoke column instead: pyre at the
foot, smoke rising, the wind cutting across it, the two lenses at the canopy.
That is the lineage argument, and it belongs anywhere the page is making a
claim about time. See the core metaphor.

## Interaction

No animation is required.

The mockup proves that the idea works through composition, title, claim, and image.

Use animation only when it clarifies the concept or creates a small intentional gesture. Do not depend on it to make the landing understandable.

For the landing:

Preferred:
- static, immediate CTA
- strong hero image
- clear title
- optional subtle hover/mouse reveal
- no mandatory unlock mechanism

Avoid:
- hidden primary link
- long reveal interaction
- friction that blocks access
- interaction needed to understand the page

A small interaction can remain as an enhancement:
- hover reveals more makeup
- pointer movement shifts recognition/camouflage balance
- reduced-motion users see final state immediately

But the page should work perfectly as a poster.

## Landing page direction

### Primary headline

Strong options:

- Disrupt the read.
- Make the read visible.
- The face is not a truth.
- Recognition is a system output.
- Test the face-reading machine.
- Camouflage the pipeline.

The current strongest option:

Disrupt the read.

It is short, technical enough, and visually powerful. It does not overclaim.

### Supporting claim

Use:

Ghostmaxxing tests face-recognition camouflage through browser-based overlays and local experiments. Knowledge stays with you.

For the international version:

Ghostmaxxing tests face-recognition camouflage through browser-based overlays, local experiments, and a public archive of anti-biometric techniques.

### CTA hierarchy

Primary:
- Open the lab

Secondary:
- Explore references
- Report a deployment
- View source

Avoid:
- Become invisible
- Beat surveillance
- Protect yourself
- Hack your face

### Layout

- top nav with wordmark
- large serif headline on the left
- face image on the right or centered-right
- body text below headline
- primary CTA button
- secondary text link
- the camera field as the hero, on soil
- pyre + soil-edge footer anchored at the bottom
- generous whitespace
- strong orange field

The page should feel like a poster that happens to be interactive.

## References page direction

The references page should inherit the new style but become more structured.

Use:
- orange or cream background sections
- black serif titles
- dark navy explanatory text
- card layout
- tags in navy/green/yellow
- camera-flower motif in header or footer
- less HUD, more archive

The references page is not a cyberlab database.
It is an investigative archive.

Each card should answer:
- What is this?
- What did it demonstrate?
- Why does it matter?
- Can Ghostmaxxing/Ghostmaxxing retest it?
- What are the limitations?
- Where can I read more?

## Report / whistleblowing page direction

This page should feel calm, careful, and investigative.

Use the same color system, but reduce spectacle.

Tone:
- protective
- precise
- serious
- not heroic
- not paranoid
- not urgent in a manipulative way

Key claim:

Seen facial recognition in public space? Help document where it appears, who operates it, what technology is used, and what safeguards or abuses are present.

Use the camera field more literally here: the deployments a reader is being
asked to document are the same housings the hero is full of. What the reporting
node collects becomes the documents at the foot of the next era's column — that
is the connection worth making visible on this page.

## App / Ghostmaxxing interface direction

The actual lab interface can be more technical than the landing, but should not revert entirely to cyberlab aesthetics.

Use the new visual direction as a layer:

- dark navy panels instead of pure black cyber panels
- orange/yellow accents
- serif only for major labels or title areas
- clean sans for controls
- recognition overlays can remain technical
- Ghostyle overlays can be more ornamental
- status language should stay precise

The lab can still look like a tool.
But it should belong to the same world as the landing.

## Naming architecture

### Italian context

Use:

Ghòstati

Why:
- works as a direct imperative in Italian
- carries the “become ghost / stay ghosted” resonance
- fits the local NINA context
- feels rooted and specific

Italian pages can remain more locally contextual and speak to the audience already explored:
- public-space deployments
- Italian legal/political context
- NINA reporting node
- workshop/festival language

### International context

Use:

Ghostmaxxing

Why:
- meme-aware and contemporary
- immediately suggests “becoming more ghost-like”
- funny and unexpected
- legible to internet-native audiences
- less dependent on Italian wordplay
- can carry a lighter public-entry tone without weakening the technical work

Ghostmaxxing should not become unserious. The meme should open the door; the project should remain rigorous.

### Relationship between names

Recommended architecture:

- Ghòstati: Italian/local name and original project root
- Ghostmaxxing: international-facing name for the same project universe
- Ghostyle: plugin/style unit, usable in both contexts

Possible wording:

Ghostmaxxing is the international name for Ghòstati: a browser-based lab for testing face-recognition camouflage and documenting anti-biometric appearance design.

Or:

Ghòstati / Ghostmaxxing is a public lab for testing how faces become machine-readable — and how that reading can be disrupted.

### Avoid confusion

Do not present Ghostmaxxing as a separate fork unless it actually becomes one.

Use:
- “international name”
- “international-facing version”
- “English-language presentation”
- “same project universe”

Avoid:
- “rebrand” too early
- “new project” unless architecture changes
- “meme project”
- “funny version”

## Ghostmaxxing tone

Ghostmaxxing can be slightly more internet-native, but not unserious.

It can use:
- sharper headlines
- cleaner English
- clearer CTAs
- a bit more playfulness
- stronger visual identity

It should still avoid:
- anonymity promises
- overclaiming
- “beat face recognition”
- meme overload
- ironic detachment

Good phrase:

Ghostmaxxing is not about becoming invisible. It is about making face-recognition systems visible enough to test.

## Copy examples

### Landing

Disrupt the read.

Ghostmaxxing tests face-recognition camouflage through browser-based overlays and local experiments. Explore the archive, build a Ghostyle, or report where facial recognition appears in public space.

### References

The archive maps artistic, technical, and activist work around face obfuscation, adversarial makeup, and physical-world attacks on computer vision systems. Each entry explains what was demonstrated, what remains limited, and whether the idea can be retested in Ghostmaxxing.

### Report page

Seen facial recognition in public space? Help document where it appears, who operates it, what technology is used, and what safeguards or abuses are present. Share only what is safe for you to share.

### App disclaimer

Local tests are not protection claims. Results depend on model, camera, light, pose, distance, and context.

## Design principles

### 1. Beauty first, unease second

The page should attract before it disturbs.

The flowers should be beautiful. Then the viewer notices they are cameras.

### 2. No false safety

Never imply that a Ghostyle makes someone safe from surveillance.

### 3. Make systems visible

The visual language should reveal pipelines, infrastructures, and hidden arrangements.

### 4. Less cyber, more public

Avoid the cliché of surveillance represented only through dark screens and green grids.

Surveillance is not just in computers. It is in streets, schools, stadiums, shops, airports, phones, buildings, and public administration.

### 5. The archive is part of the interface

References are not an appendix.
They are evidence of lineage, repetition, and accumulated knowledge.

### 6. Investigation over advocacy

The project should invite people to look, test, report, and verify — not merely agree.

## Visual checklist

Before publishing a page, check:

- Does it feel activist first?
- Does it have cultural/exhibition quality?
- Does it feel editorially composed?
- Does it avoid old cyberlab tropes?
- Does it use strong contrast?
- Does it include the camera-as-landscape metaphor when appropriate?
- Is the CTA obvious?
- Is the page readable without animation?
- Are claims precise and limited?
- Is the reporting node visible where it matters?
- Would the design still work as a poster?
- Would the page make sense to a developer, an investigator, and a curious person?

## Practical CSS direction

Removed. It carried a second verbatim copy of the token block and duplicated
`styles/tokens.css`, `base.css` and `cameras.css` in prose.

The implementation is:

- `styles/styles.css` — the one stylesheet every page links. Fonts, tokens,
  reset, components, in that order.
- `styles/tokens.css` — every colour, type and layout value.
- `visual-styleguide.html` — every component as the live thing, plus §12 on
  when an SVG may be an `<img>` and when it must be inlined.

This document says what the system is for. That one says what it is.

## Future tasks

The previous list was eight items, all checked, several describing work that
has since been undone or redone. Reset to what is actually open:

- [ ] Re-express the era dossiers so the "documents that fuelled it" reading
      is legible without the caption.
- [ ] Decide whether the two undefeated lenses get named, or stay anonymous.
- [ ] Social cards still use the old camera-flower composition.
- [ ] `styles/lab.css` runs its own scoped dark palette. Deliberate, but it
      has never been reconciled with the poster system on paper.
- [ ] The `era__wind` block is inlined four times, 140 KB. Deduplicating it
      needs a mechanism that keeps CSS reach — it has no fill attributes of
      its own.
