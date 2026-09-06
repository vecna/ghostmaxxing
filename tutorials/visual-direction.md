# Ghostmaxxing Visual Direction

Version: 0.9.9  
Status: current internal standard  
Language standard: clear international English; UK and US spelling may coexist  
Last updated: September 2026

## Authority and scope

This document codifies the current Ghostmaxxing visual system.

The following sources are authoritative:

1. `https://ghostmaxxing.vecna.eu/visual-styleguide.html` for live components, visual grammar and implementation contracts;
2. `https://ghostmaxxing.vecna.eu/genealogy.html` for the composed expression of the genealogy system;
3. `styles/tokens.css` for exact colour, type and layout values.

If prose in this document conflicts with a live component, inspect the authoritative page and its source. If a value conflicts with `styles/tokens.css`, the token wins. Page CSS may compose tokens but must not redefine `--gm-*` values.

This version describes the present system only. It is not a decision log and does not document superseded visual directions.

## Working definition

> Activist cultural poster + investigative public lab

Ghostmaxxing begins with privacy activism but does not adopt the visual language of a policy campaign. It is investigative, cultural, public-facing and technically grounded. It reveals systems, documents uncertainty and makes biometric infrastructure readable without pretending that visibility alone solves power.

The project is:

- activist first;
- culturally staged second;
- editorial third;
- investigative;
- public-research oriented;
- anti-biometric;
- design-led;
- technically literate;
- civic-intelligence oriented.

It is not:

- a neutral technology demonstration;
- a policy campaign;
- a cybersecurity product;
- a startup interface;
- a dark terminal aesthetic;
- a tactical or military interface;
- a beauty brand;
- a meme identity;
- an academic repository with branding added later.

## Identity

Ghostmaxxing is the project identity.

Ghostyle is a term introduced within Ghostmaxxing. A Ghostyle is a modular visual intervention and a shareable unit of experiment. It may have its own preview, metadata and state, but it must remain visibly part of the Ghostmaxxing system.

## Core visual logic

The visual system combines four modes:

1. **Poster:** loud public ground, large editorial headlines and immediate visual claims.
2. **Archive:** dossiers, dates, labels, references, conditions and limitations.
3. **Machine:** camera housings, lenses, states, technical overlays and local test interfaces.
4. **Interruption:** a controlled pink signal that marks a counter-move, cut or consequential action.

The result should be attractive at first glance and more unsettling on closer reading. The design invites attention, then makes the surveillance system and its limits legible.

## The genealogy model

Surveillance is presented as a lineage rather than as one timeless machine.

Each era has a technical approach, a body of documents and a public claim. A documented intervention may interrupt one era under stated conditions. The next generation can resume above that interruption. At the top of the genealogy, two lenses remain live. They represent the present problem and must not be styled as spent without a corresponding research finding.

The genealogy is not a victory timeline. It is a sequence of local, conditional and temporary interruptions.

### Semantic elements

| Element | Meaning |
|---|---|
| Dossier | Dates, technical approach, documented intervention, source and limits |
| Stacked documents | The evidence, procurement logic and claims that sustain an era |
| Smoke or plume | The technical lineage continuing through time |
| Pink wind | A documented counter-move or interruption |
| Cut in the plume | The point at which a specific read was interrupted |
| Smoke resuming | A later generation not addressed by the previous intervention |
| Live lenses at the canopy | The present systems for which no documented interruption is being claimed |
| Pyre at the foot | Pattern recognition as the historical ground of the lineage |

### Composition contract

The responsive genealogy uses four independent pieces:

| Piece | Function | Desktop | Mobile |
|---|---|---|---|
| Spine | The vertical trunk or smoke column | Fixed centre track | Fixed centre track |
| Branch | Connects the spine to a camera node | Extends left or right | Removed below the mobile breakpoint |
| Node | Camera and stamp | Side column | Placed on the spine |
| Dossier | Dates, title, result and limits | Opposite column | Full width below the node |

Use three tracks on larger viewports: flexible content, a fixed-width spine and flexible content. Do not scale a fixed artboard to fit a small screen. The spine remains centred on mobile so the composition preserves its logic without shrinking text or redrawing the canopy.

### Genealogy rules

- Keep every interruption tied to a documented result and stated conditions.
- Keep live lenses live until the content changes.
- Keep spent states static and legible in screenshots, print and reduced-motion contexts.
- Do not imply that a counter-move defeated face recognition as a whole.
- Use the plume system on pages that make a substantive claim about time, lineage or accumulated evidence.
- Do not apply the full genealogy composition as generic decoration.

## Colour system

The palette is the Institutional Poster system. Exact values live in `styles/tokens.css`.

### Core tokens

| Token | Value | Role |
|---|---:|---|
| `--gm-bg` | `#f26a1b` | Main page ground, surveillance orange |
| `--gm-bg-deep` | `#d95a12` | Deeper orange when a composition requires it |
| `--gm-ink` | `#0a0a08` | Headings, borders and high-contrast structure |
| `--gm-text` | `#0a2540` | Body copy, dark navy |
| `--gm-muted` | `#35526e` | Secondary explanatory text |
| `--gm-green-soft` | `#2f7a5c` | Light machine surface |
| `--gm-green` | `#0b4a3c` | Machine lines and structural drawing |
| `--gm-green-deep` | `#072e26` | Lens barrels and dense machine forms |
| `--gm-green-night` | `#061f1a` | Ground and deepest machine field |
| `--gm-yellow` | `#f0c24a` | Live iris state |
| `--gm-cream` | `#fff1cf` | Reading surface and text on dark ground |
| `--gm-pink` | `#ff5f8f` | Interruption, spent residue and primary consequential action |
| `--gm-soil` | `#0a2b23` | Dark field beneath cameras and protected surfaces |

Use semantic aliases in page CSS when they state intent more clearly:

- `--surface-page`
- `--surface-panel`
- `--surface-card`
- `--text-heading`
- `--text-body`
- `--text-muted`
- `--text-on-dark`
- `--accent`
- `--accent-live`
- `--accent-spent`

### Colour meanings

- **Orange is the public wall.** It reads as a poster, public notice or civic warning. It is warm and institutional, not neon or cyberpunk.
- **Cream is the reading surface.** Use it for cards, long-form material and high-legibility areas.
- **Soil and greens are the machine.** They carry housings, lenses, smoke, protected areas and the ground of the system.
- **Yellow means live.** Use it for an active iris, meaning a system is reading now. Do not spend yellow on unrelated decoration or Fediverse branding.
- **Pink means interruption.** Use it for the wind, the residue of a spent lens, selected accents and the single consequential CTA.
- **Ink creates structure.** It carries headings, borders and the edge that makes low-contrast accents perceivable.
- **Dark navy carries body text.** Do not replace it with pure black in long reading surfaces.

### Pink seating rule

Pink has very low contrast against the orange ground. It must be seated on cream, soil or dark green, or bounded by an ink structure that carries the visible edge.

Use pink for:

- the documented interruption in the genealogy;
- the residue ring of a spent lens;
- the wind in the project mark;
- short accents such as rules, tags or link underlines on an appropriate surface;
- the filled reporting CTA, with ink text and a 2px ink border.

Never use pink:

- as body text;
- as a page ground;
- bare on orange when it is the only carrier of meaning;
- as general decoration detached from interruption or action.

### Green order

Use the green ramp by role, not by visual guesswork:

1. `--gm-green-soft` for surfaces;
2. `--gm-green` for lines;
3. `--gm-green-deep` for lens barrels and dense machine forms;
4. `--gm-green-night` for ground.

The smoke and pyre assets contain their own named smoke ramp. Those values exist to support those assets only. Do not use the smoke tokens as an alternative general palette.

## Typography

The system uses three families, each with one job.

| Role | Family | Use |
|---|---|---|
| Display | Newsreader | Poster headlines, section headings, wordmark and pull quotes |
| Reading and interface | Atkinson Hyperlegible | Body copy, navigation, controls, instructions and labels that must be read |
| Metadata | JetBrains Mono | Years, tags, section numbers, testability badges and compact technical metadata |

### Rules

- Use Newsreader for editorial force, not for buttons or body paragraphs.
- Use Atkinson Hyperlegible at weights 400 and 700 only.
- Use JetBrains Mono sparingly and never for body copy.
- Fluid scaling belongs to display sizes. Reading sizes remain stable.
- Prefer short line lengths on cream reading surfaces.
- Do not simulate a technical interface by filling the page with monospaced text.
- Do not use glitch fonts, fake terminal fonts or generic technology sans headlines.

Headline language can be sharp, exuberant and anti-surveillance. Humour may name the social function of a technology, as in "perv glasses", but it must remain accurate, intentional and legible to an international audience.

## Shape and surface

The system is poster and archive, not a software dashboard.

Use:

- square corners on cards and panels;
- solid 2px ink borders as primary separators;
- flat orange, cream and soil fields;
- offset flat blocks if a raised hierarchy is ever needed;
- generous poster-like spacing;
- visible composition rather than container decoration.

Avoid:

- drop shadows;
- rounded cards or panels;
- generic coloured side borders;
- glassmorphism;
- dashboard card stacks;
- decorative gradients;
- a second accent colour with no semantic role.

The page background is a flat `var(--gm-bg)`. Do not add a radial or linear body gradient.

The filled CTA is the only rounded component in the content system. Its exception creates its priority. It is not permission to round other elements.

## The mark

The primary mark contains:

- a top rail with two stems;
- two live lenses with yellow irises;
- a pink gust beneath them;
- one spent lens with a pink residue ring and dark iris;
- a small green flame above the spent lens.

The mark compresses the genealogy argument into one object. The live lenses represent the present. The gust represents an intervention. The spent lens represents a documented interruption. The flame connects that interruption to the continuing lineage.

### Mark rules

- Use the full-colour mark at 32px and above when the surface allows it.
- Use the small cut at approximately 28px and below.
- Choose painted light or dark variants according to the surface.
- Preserve clear space equal to one lens radius on every side.
- Never show the two upper lenses as spent.
- Never put another mark or sigil inside a camera lens.
- Never rotate, flip or recolour the live lenses independently.
- If motion is used, only the gust may move.
- The static mark must carry the full meaning without motion.

## Camera system

Ghostmaxxing uses one custom fleet of camera drawings. Cameras are machines and evidence objects, not flowers, eyes or generic decorative icons.

The current fleet includes six models associated with the genealogy:

- street pole surveillance camera;
- outward-facing wearable glasses;
- depth sensor array;
- edge AI cube;
- ceiling dome;
- bullet CCTV camera.

### Anatomy contract

Camera SVGs use a `0 0 100 100` viewBox and a shared class-driven drawing order:

1. mount;
2. shell;
3. lens barrel;
4. iris;
5. glint or model-specific detail.

The component defines the camera drawing and lens state. The page defines placement. Do not put page-specific positioning into the camera component.

Iris geometry should be derived from the lens radius rather than adjusted by eye:

- iris radius: `0.44` times the lens radius;
- glint radius: `0.17` times the lens radius;
- glint offset: `0.30` times the lens radius, up and left.

### Lens states

| State | Visual treatment | Meaning |
|---|---|---|
| Live | Yellow iris, glint visible | Still reading |
| Reading | Pink iris, no glint | Transient state during a transition |
| Spent | Dark iris, thin pink residue ring, no glint | A documented interruption exists |

State is set with `data-lens` on the SVG or an ancestor. Do not create separate image files for states.

Lens changes are instant. A spent state is information and must survive print, screenshots and reduced-motion settings.

### Camera captions

Use one caption system, `.gm-stamp`, for camera labels. Curvature is a property of the stamp, not a second label type. On narrow screens, render the same label flat when curved text would reduce legibility.

### SVG delivery

- Use painted SVGs through `<img>` when their colours are intentionally embedded.
- Inline class-driven camera SVGs so site CSS can reach their parts and states.
- Do not expect `currentColor` from a host page to enter an SVG loaded through `<img>`.
- Keep camera IDs unique when a model appears more than once on a page.
- Use meaningful `aria-label` text when an SVG conveys information. Mark decorative instances appropriately.

## Image language

The key visual tension is between:

1. the machine-readable face;
2. a human or adversarial intervention;
3. the infrastructure that performs and normalises the read.

### Faces

A face composition may contrast a recognition layer with an adversarial intervention. Useful elements include landmarks, a bounding region, confidence or state indicators and the visible intervention itself.

Keep the treatment elegant and legible. Avoid scanline overload, military targeting graphics, generic HUD decoration and science-fiction surveillance clichés.

Where a real person's face is used, consent, context and the right to withdraw take priority over visual continuity.

### Camera fields

A camera field can represent infrastructure that is installed everywhere and easily overlooked. Use the six established housings on soil, with green and cream forms and semantically correct lens states.

A field may be interactive when the interaction makes a research point, such as removing one camera type while leaving the wider infrastructure visible. It should still communicate that point as a static composition.

Suitable uses include:

- the homepage hero;
- an explanatory block about deployments;
- social cards and posters;
- a reporting-page bridge between observed devices and institutional evidence.

Do not place a camera field on orange if the cream housings lose their structure. Keep every camera recognisable as a specific machine.

### Plume and pyre

Use the plume, wind, dossiers and pyre when the page is making a claim about time, lineage or evidence accumulating across technical eras.

Suitable uses include:

- the genealogy page;
- a compact About-page diagram of how evidence feeds later research;
- a footer transition into the archive;
- an editorial illustration for a dated research finding.

Do not use the plume as a generic divider. Its meaning is specific enough that decorative repetition would weaken it.

## Interaction and motion

Every page must work as a static poster. Motion is an enhancement, never the carrier of essential meaning.

Use interaction when it:

- reveals a test state;
- compares before and after conditions;
- exposes supporting evidence;
- lets a person inspect or remove a class of machine;
- clarifies the relationship between an intervention and a read.

Avoid:

- hidden primary links;
- mandatory reveal sequences;
- long entrance animations;
- friction before a person can understand the page;
- smooth decorative movement that implies progress;
- motion that prevents a state from surviving a screenshot.

Under `prefers-reduced-motion`, show the final informative state immediately. Preserve visible state markers rather than removing them with the animation.

## Site chrome

All content pages use the shared Ghostmaxxing header and footer.

### Header

The shared header contains:

- the Ghostmaxxing lockup;
- a square Fediverse chip;
- the Know more navigation group;
- one pink reporting CTA.

Commitment rises from left to right:

1. follow the public presence;
2. read more about the project;
3. share consequential information.

Keep the reporting CTA last. If the navigation grows, preserve it as the terminal and strongest action while reviewing keyboard order and mis-tap risk.

### Actions

| Component | Shape and colour | Use |
|---|---|---|
| `.gm-site-chip` | Transparent, square, 2px ink border, ink text, small dot | Secondary destinations such as the Fediverse |
| `.gm-site-cta` | Filled pink pill, 2px ink border, ink text | One consequential action per page |

The ink border is structural, not decorative. It gives the pink CTA a perceivable edge against orange. CTA text is ink, not cream.

### Footer

The content-page footer uses a pyre band, a soil edge and a link row with subdued inline camera icons. Keep informational camera graphics inline when their classes or states depend on site CSS.

### Tool-page exception

`lab.html`, `loader.html` and `realtime.html` are full-screen camera surfaces. They use a small fixed back link and scoped dark tool chrome so the poster header does not compete with the camera stage.

The tool chrome is a deliberate functional exception. Do not use it as an alternative theme for content pages.

## Spaces and grounds

Ghostmaxxing distinguishes its public spaces by ground rather than by inventing new accent colours.

| Space | Ground | Accent | Meaning |
|---|---|---|---|
| Main site | Orange | Pink | Public wall, poster and notice |
| Reporting node | Soil | Pink | Anonymous, consequential point of interruption |
| Fediverse infrastructure | Cream | Green-soft | Federated data, updates, reading and exchange |

Never give the Fediverse presence a yellow identity. Yellow means a live lens and would imply that the social presence is reading the viewer.

Use `rel="me"` on the Fediverse link so the domain can verify the account.

## Page directions

### Homepage

Lead with one poster-scale claim, one clear route into the lab and a camera-field composition that makes infrastructure visible. The page should reveal the research loop without turning the hero into an architecture diagram.

Potential interaction: removing one camera type reveals a fact about that device while the wider field remains. Preserve the argument when JavaScript or motion is unavailable.

### About

Use an editorial reading structure with a compact visual account of the theory of change:

> Ghostyles and test records -> Fediverse backend -> lab updates and public distribution -> anonymous reporting -> verified evidence -> new tests

The visual may reuse established components by function:

- a Ghostyle preview for the experiment;
- a cream reading surface for the bidirectional Fediverse data layer;
- a soil reporting panel for consequential contact;
- a dossier for evidence returning to the archive;
- a branch or spine relationship when the loop connects to historical research.

Do not introduce a new visual metaphor for the loop. The current components already express experiment, distribution, reporting and evidence.

### References

Treat the page as an investigative archive.

Use:

- cream reading cards on orange or soil sections;
- square 2px borders;
- Newsreader titles;
- dark navy explanatory text;
- monospace years, tags and testability grades;
- semantically correct lens states or dossiers when a reference belongs to a genealogy era.

Each card should make the source, demonstration, conditions, limits and retest opportunity scannable.

### Reporting node

Use soil as the ground and reduce spectacle. Continue pink from the site-wide CTA to show that this is the point of consequential interruption.

Visual priorities:

- calm reading order;
- clear channel choice;
- a visible choice between HTTPS access and the Onion Service through Tor Browser;
- visible safety and data-minimisation guidance;
- no decorative urgency;
- no heroic portraiture;
- a clear source-anonymity statement tied specifically to the GlobaLeaks channel;
- no anonymity claim that extends beyond the protection provided by GlobaLeaks, Tor and the source's own handling of identifying material.

A small, literal camera-field reference may connect observed devices to the evidence being requested. Dossiers can represent contracts, technical details or verified observations, provided the page never encourages unsafe collection.

### Workshops

Use the poster system for invitation and cream panels for practical details. Visualise activities as methods or materials, not as lifestyle imagery. Clearly separate what participants will do, what is processed locally, what may be documented and what requires consent.

### Fediverse page

Use cream as the primary reading ground with green-soft accents. Keep the Ghostmaxxing mark and typography, but lower the visual pressure so ActivityPub objects, feeds, account verification, follow instructions and data provenance are easy to read.

The page must present the target Fediverse infrastructure with two directions:

1. the lab publishes Ghostyles, test records, references and project updates to the federated backend;
2. the lab receives updates and candidate research inputs from ActivityPub actors, subject to validation and moderation.

Use object type, author or actor, publication time, provenance and moderation state as visible metadata when they help a reader understand the data flow. Do not make the page look like a generic social-media feed.

Until both directions are implemented, distinguish live functions from planned ones in copy and interface state. Do not render a planned inbound flow as if data were already being consumed by the lab.

Suitable interactive enhancement: a small explainer that shows how one public update can be followed from different ActivityPub applications. Use real interface labels only when the implementation can keep them current.

### Genealogy

The genealogy page is the keeper composition for the temporal system. Preserve its central plume, alternating dossiers, camera nodes, live and spent states, pink interruptions and pyre ground. New eras should extend the same data and component contracts rather than introduce a new timeline style.

### Lab and technical tools

Prioritise the camera stage, local state, control clarity and immediate feedback. Use the scoped dark tool chrome. Bring poster-system elements into the tool only when they improve orientation or explain a finding.

## Future-page hypotheses

Future pages should extend established visual grammar rather than invent a page-specific identity.

| Page need | Recommended established elements | Constraint |
|---|---|---|
| A dated research result | Dossier, testability grade, lens state | Conditions and limits must remain visible |
| A new Ghostyle detail page | Face preview, Ghostyle metadata, before and after state | Do not imply protection or universal transfer |
| A deployment case file | Soil ground, camera housing, cream dossiers | Separate observation from inference |
| A Fediverse data view | Cream ground, green-soft destination markers, object and provenance metadata | Show both publication and validated inbound updates; do not use yellow as social branding |
| A theory-of-change explainer | Ghostyle preview, surface shift, reporting panel, returning dossier | Keep the loop readable without animation |
| A historical or technical timeline | Spine, branches, nodes and dossiers | Use only when lineage is the actual argument |
| A poster or social card | Headline, mark, one machine or interruption element | Preserve semantic colours and source context |

## Accessibility and resilience

- Maintain a visible `:focus-visible` outline using `--gm-focus-ring`.
- Do not rely on hue alone to distinguish actions or states. Pair colour with shape, border, label or residue.
- Keep body text on high-legibility surfaces and use the intended text token.
- Provide text alternatives for informative graphics.
- Mark repeated decorative cameras as decorative.
- Preserve information under `prefers-reduced-motion`.
- Ensure core content and primary actions work without JavaScript.
- Do not scale text as part of a fixed illustration.
- Test layouts at narrow mobile widths and at the `1440px` content maximum.
- Review keyboard order whenever navigation items change.
- Treat consent and context as part of the image system when faces or personal evidence appear.

## Implementation checklist

Before publishing a page, check:

- Does it use Ghostmaxxing consistently as the project identity?
- Does it extend the poster, archive, machine or interruption modes already defined?
- Are exact values coming from `styles/tokens.css`?
- Are colour meanings preserved?
- Is pink properly seated and paired with structure?
- Is yellow used only for a live reading state?
- Are cards square, flat and free of drop shadows?
- Is the single rounded CTA the only rounded content component?
- Are type families confined to their roles?
- Are camera SVGs using the shared anatomy and state contract?
- Are informational SVGs inlined when their state depends on CSS?
- Does the page remain understandable without motion?
- Are reduced motion, focus visibility, contrast and keyboard order intact?
- Does any genealogy element make a real claim about time or evidence?
- Are conditions and limits visible wherever the design presents a research result?
- Is every camera presented as a specific machine or evidence object?
- Is the English consistent and free of em dashes?
