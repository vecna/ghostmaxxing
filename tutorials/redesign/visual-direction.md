# Ghostmaxxing Visual Direction

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

Surveillance has become part of the landscape.

It grows everywhere.
It is installed as infrastructure.
It is normalized as safety, convenience, and administration.
It becomes background scenery before people have understood who operates it, what it sees, what it stores, and who can access it.

The “camera flowers” motif captures this:
from a distance, the bottom of the page looks decorative, almost botanical.
On closer inspection, the flowers are cameras.

This is the central visual metaphor:

> Surveillance is naturalized as landscape.

The design should make that naturalization feel beautiful, unsettling, and legible.

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

Primary palette:

- hot orange background
- black serif headlines
- dark navy body text
- green and yellow botanical/camera illustration
- occasional cream or pale yellow accent
- occasional deep green shadow

Suggested palette names, not strict values:

- surveillance orange
- ink black
- institutional navy
- leaf green
- warning yellow
- faded cream

Example CSS tokens:

:root {
  --gm-bg: #f26a1b;
  --gm-bg-deep: #df5512;
  --gm-ink: #050505;
  --gm-text: #071a33;
  --gm-muted: #253a54;
  --gm-green: #063f32;
  --gm-green-soft: #1e6b4f;
  --gm-yellow: #f3c747;
  --gm-cream: #ffe7a8;
  --gm-border: rgba(5, 5, 5, 0.28);
}

The orange should feel like a poster wall, a public notice, a heat field, or institutional alarm color — not neon cyberpunk.

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

### Camera flowers

The bottom illustration should be SVG-like and aligned to the bottom of the page.

It should resemble a field of flowers at first glance:
- stems
- leaves
- repeated shapes
- irregular heights
- botanical rhythm

But the blossoms are:
- CCTV cameras
- sensor boxes
- camera housings
- small lenses

Use green and yellow on orange.

The motif should be reusable across pages:
- landing footer
- report page divider
- references header detail
- social cards
- stickers/posters

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
- camera flowers anchored at bottom
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

Use the camera flowers motif more literally here:
the surveillance landscape is what the reporting node tries to map.

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

Use global design tokens for the new visual system:

:root {
  --gm-bg: #f26a1b;
  --gm-bg-deep: #df5512;
  --gm-ink: #050505;
  --gm-text: #071a33;
  --gm-muted: #253a54;
  --gm-green: #063f32;
  --gm-green-soft: #1e6b4f;
  --gm-yellow: #f3c747;
  --gm-cream: #ffe7a8;
  --gm-border: rgba(5, 5, 5, 0.28);
  --gm-panel: rgba(255, 231, 168, 0.16);
}

Typography direction:

- display serif for h1/h2/wordmark
- readable sans for body and nav
- small monospace only for tags, years, and metadata

Layout direction:

- poster-scale hero
- clear CTA cluster
- bottom-aligned illustrated motif
- large type on desktop
- compressed but still dramatic type on mobile

## Future tasks

- [x] Build a static SVG camera-flower border.
- [x] Replace the cyberlab landing prototype with a static editorial landing prototype.
- [] Update brand-voice.md to include Ghostmaxxing and the new visual direction.
- [] Adapt references.css away from cyberlab toward investigative archive.
- [x] Create a report.html design using the same visual system.
- [] Define international copy around Ghostmaxxing.
- [] Create social cards using the orange/camera-flower/serif system.
- [] Build reusable CSS tokens and components for the broader site.
