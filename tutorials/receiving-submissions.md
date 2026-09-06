# (Internal) Receiving submissions: why the questionnaires look like this, and what to do with what arrives

For the journalists, researchers and activists who are recipients on the
Ghostmaxxing GlobaLeaks node. Version 1, September 2026. Companion to
`globaleaks-submission-channels.md` (the field-level specification) and to the
public page `report.html`, whose promises this document exists to keep.

Two parts. The first explains the design, so that you can defend it to a
source, to a colleague, or to yourself when a report arrives that does not fit.
The second is a working protocol for handling and, eventually, communicating
what we learn. The protocol is a draft: it is written to be argued with before
the first real report, not after.

---

## Part 1. Why five questionnaires, and why these

### The problem we were solving

The first version had eight channels organised by *type of evidence*: a
system overview, a weak spot, a contract, a sighting, and so on. It looked
thorough and it asked the source to do our taxonomy for us. Someone who
installs cameras for a living does not know whether what they hold is "a
system overview" or "a weak spot"; they know they installed the thing and it
does not work the way the brochure said. A form that makes people classify
their own knowledge before they can tell it loses the people we most want.

The second version organises by **position**. There are four positions from
which a face-recognition system can be known first hand, and they are also
the four kinds of knowledge an investigation needs:

| Position | What only they can tell us | Why we need it |
|---|---|---|
| The person it stopped | That it happens, to whom, with what consequences, how it was justified on the spot | Harm is the reason the project exists. It is also the only evidence that does not depend on anyone inside |
| The person who built, integrated or tested it | What is actually deployed (models, thresholds, databases, cloud or edge), where it is weaker than sold, and how camouflage performs against it | The lab tests a browser pipeline. Only this position can say whether anything we find transfers |
| The person who operates it | The gap between procedure and practice: watchlists, overrides, false matches, what staff are told to say | This is where "human in the loop" is either real or a checkbox |
| The person who bought, sold or signed it off | Who paid, how it was awarded, what assessments exist, what oversight was promised | The commercial and administrative layer is the least visible and the most actionable |

The fifth questionnaire is not a position. It is a **safety valve**: sightings
from the street, and anything from anyone who does not recognise themselves
in the other four. A channel that accepts only what we anticipated will never
receive what we did not. Its one mandatory field is a free text box on
purpose.

### Specific and generic at the same time

The tension the design has to hold: a questionnaire should be specific enough
to pre-filter for **motivated and informed** sources (a person who can answer
"what is the match threshold" or "who adds people to the watchlist" is a
different source from one who cannot), yet generic enough not to turn away
someone with something we did not think to ask about.

The compromises made:

- **Specificity lives in optional fields.** Every questionnaire has pointed
  questions (threshold, retention, award procedure, override policy). None of
  them is mandatory. An informed source answers them and thereby identifies
  themselves as informed; an uninformed or casual source skips them, and the
  receiver sees the blanks. The filter works without a gate.
- **Genericity lives in the free text and in the fifth channel.** Every
  questionnaire opens or closes with an open box, and channel 5 is nothing
  but an open box with a location.
- **Questionnaire 2 branches instead of splitting.** Builders, weak-spot
  reporters and people who have tested our camouflage are the same
  population with three things to say. One mandatory multiple-choice question
  ("What can you tell us about?") reveals only the relevant section. The old
  version had three channels for this and one of them was hidden because "we
  do not have the test bundle yet". The bundle exists now: it is every
  published Ghostyle and every approved result in the `@ghostyles` feed. A
  tester picks one and reports what happened.
- **The feedback loop is named on the card.** The public copy for channel 2
  says explicitly "you have run a Ghostyle or a workshop look against a real
  system and can tell us how it performed". That sentence is the most
  important recruitment line on the page. Everything the lab publishes is
  local, conditional and temporary until someone with a real system says
  otherwise, in either direction. A report that says "your pattern did
  nothing against our product" is as valuable as one that says it worked, and
  the form says so.

### The closing step is where evidence is made

Every questionnaire ends with the same four questions. They are the part of
the form written for you rather than for the source.

**How do you know this?** Distinguishes first-hand knowledge, direct
testimony, inference from documents, and hearsay. This is the single most
useful field for triage. A first-hand operator account and a second-hand
rumour can contain the same sentence; they are not the same evidence.

**What would confirm it?** Asks the source to do the first step of
corroboration for us: name roles (not people), documents that exist, places
to look. A source who can answer this is usually reliable; one who cannot may
still be right, but the report is a lead, not a finding.

**Anything we must not do with this?** Gives the source control over
publication before we have anything to publish. The options are concrete
(lead only; do not quote; do not name country or city; do not name the
organisation; ask before contacting anyone). These are binding on us. The
public page says "we follow these even when they weaken the story". A report
whose restrictions make it unusable is still a report we read and honour.

**Will you come back?** Sets expectations on both sides. GlobaLeaks
conversations through the receipt are where most investigations actually
happen; a one-off drop is rarely enough on its own.

### What we deliberately do not ask

Names of colleagues or individuals, except roles. Exact timestamps paired
with locations. Employee identifiers. Anything that would let a report be
matched to an access log. Where a document is requested, the hint suggests
describing it instead. The public page tells sources not to go and obtain new
material, and not to exceed their normal access: an offence committed to help
us is a trail that leads to them and a liability for everyone.

---

## Part 2. Handling protocol (draft for discussion)

### Who receives what

GlobaLeaks assigns recipients per context. Proposed starting configuration:

| Context | Recipients |
|---|---|
| 1 Stopped, flagged, misidentified | Core editorial pair + one advocate with experience of supporting affected people |
| 2 Build, integrate, test | Core editorial pair + the lab maintainer (for the camouflage-performance branch) |
| 3 Operators | Core editorial pair |
| 4 Contracts, tenders, sign-off | Core editorial pair + one journalist partner |
| 5 Sightings and everything else | Core editorial pair |

"Core editorial pair" means two named people who see everything, so that no
report depends on one person's availability and no one is alone with a
difficult decision. Every recipient is named on the submission screen before a
source sends; GlobaLeaks does this by default, keep it on.

### Recipient hygiene

- Recipient accounts with two-factor authentication. A PGP key on the account
  so that email notifications are encrypted or, better, notifications reduced
  to "a new report exists" with no content.
- Read reports inside GlobaLeaks. Do not download attachments onto a work or
  shared machine; if you must, use a dedicated device and delete after use.
  Do not forward content by email, do not paste it into Signal groups, do not
  screenshot it into a chat. The reporting system is the only place a report
  lives in full.
- Notes about a report (your own analysis, who you asked, what you checked)
  go in the GlobaLeaks internal comments for that report, not in a shared
  document. When the report expires, the notes expire with it.
- Never try to identify a source, even out of curiosity, and never confirm
  or deny to a third party that a report exists.

### Cadence

- New reports are read within seven days. That number is on the public page;
  if it stops being true, change the page.
- Acknowledge every report through the receipt conversation, even with one
  line. Silence is the main reason sources do not return.
- Expiration is 180 days by default (also on the public page). Postpone only
  for a report that is actively being worked on. Ask the source, through the
  receipt, before extending.

### Triage: grading a report

The site uses a claims ladder for everything it publishes (see
`brand-voice.md`). Reports get the same discipline, applied to evidence rather
than to claims:

| Grade | What it means | What you may do with it |
|---|---|---|
| **Lead** | Single source, or second-hand, or unverifiable as it stands | Investigate. Design a test. Ask the source questions. Publish nothing from it, not even in aggregate |
| **Corroborated** | Confirmed by an independent second source, or consistent with public documents you have located yourself | May inform public findings in aggregate, without detail that identifies the source or that only the source could know |
| **Documented** | Supported by a document or record whose existence and content you have verified, and whose circulation is wide enough that citing it does not identify the source | May be cited, with the source's restrictions applied |

Two rules that override the grades. **A detail only one person could know
is never published**, whatever its grade. **A restriction set by the source
is never overridden**, whatever the grade.

### Verification by channel

Channel 1, affected people: corroborate the *system*, not the person. Was
face recognition in use at that place at that time (signage, procurement
records, press, the operator's own marketing, other reports)? Look for
patterns across reports before treating a single account as representative.
Never ask a source for identity documents. If they want to be connected with
a journalist or advocate, that is their choice at the end of the form; make
the introduction through the receipt conversation, never by passing on
anything that identifies them.

Channel 2, builders and testers: technical claims can often be verified
without the source. Vendor documentation, model cards, public tenders and
conference talks confirm or contradict architecture claims. For camouflage
performance reports, treat the result exactly as the lab treats its own: a
local, conditional observation. Record the stated conditions. A report with
no conditions is a lead. Offer to send test material through the receipt
only if it cannot identify the source or the system (a published Ghostyle
already is public; that is why it is the default test object).

Channel 3, operators: procedure documents, training materials and job
descriptions are often public or obtainable by freedom-of-information
request, and confirm or contradict what an operator describes. Two operators
at different sites describing the same workaround is a pattern.

Channel 4, contracts: this is the most verifiable channel. Public
procurement portals, transparency registers, council minutes, freedom-of-
information requests and company registries exist for exactly this. The
source often only needs to point; you can then obtain the public version
yourself and cite that, which protects them.

Channel 5, sightings: cross-reference with existing maps and datasets of
camera deployments, local press, and the operator's own signage or privacy
notices. A sighting becomes evidence when a second, independent sighting or
a document lands on the same place.

### Weakness reports are dual-use

Channel 2 asks where deployments are weak, and channel 3 asks what the manual
does not say. Both can produce information that helps people evade a system,
which is part of what this project does in public, and information that helps
people attack it in ways we do not want (physical tampering, unauthorised
access). Rule: **what we publish about a weakness is what changes the
reading**, in the sense the lab uses (detection, matching, threshold), never
how to gain access to a system, its network or its data. A report about poor
physical security or exposed credentials is evidence for the accountability
argument, not content for the lab, and is handled as documented misconduct:
grade it, corroborate it, and consider whether responsible disclosure to the
operator or a regulator is the right route. The vulnerability-disclosure
practice in ISO/IEC 29147 is the reference frame, with the added constraint
that a disclosure to the operator can itself expose the source; the source's
restrictions and the "only one person could know" rule decide.

### The protocol for external communication (open questions first)

We have not yet decided how findings from reports reach the outside. What
follows is a proposal with the questions marked.

**Three exits, in increasing order of exposure.**

1. *Back into the lab.* A report changes a test: a new Ghostyle to try, a
   result to retest under stated conditions, a reference entry to correct.
   Nothing about the source or the deployment leaves the reporting system;
   only the research question does. This exit needs no consent beyond the
   source's stated restrictions and should be the default for channel 2.
2. *Aggregated public finding.* Several reports agree, or a report is
   corroborated by public documents. The finding is published through the
   project's own channels (`@news`, the reference archive, an article) in
   aggregate, redacted, after editorial and security review. The brand voice
   already says confidential reports never go to the Fediverse directly;
   this is the only way they go there at all.
3. *Handoff to a newsroom or an advocacy organisation.* A report is a story
   or a case, and it needs resources and legal cover we do not have. The
   source is asked first, through the receipt, and told what will be shared
   with whom. Nothing is passed on without a yes. The introduction is made in
   a way that lets the source decide whether to identify themselves to the
   partner; we do not do it for them.

**Rules proposed for all three.**

- Two independent sources, or one source plus a document you verified
  yourself, before anything moves past exit 1.
- Right of reply: an operator or vendor named in a public finding is
  contacted for comment before publication. Time the contact so that it
  cannot be traced to a moment when only one insider had the information
  (delay, aggregate, wait for a second source). If a right-of-reply request
  would plausibly trigger an internal hunt for a source, the finding is
  delayed or published without naming, and the source is told why.
- Redaction is not only names. Dates paired with places, exact figures, verbatim
  phrasing from internal documents and the sequence in which things were
  learned all identify people. Reduce precision until the finding still
  stands and the source no longer does.
- Findings carry their grade and their conditions, like everything else the
  project publishes. "Operators at two sites report that overrides are
  discouraged" is a finding. "The system is unusable" is a slogan.
- One person signs off on each external communication and one other person
  reads it against this document first. The sign-off is recorded in the
  GlobaLeaks internal comments of the reports it draws on.

**Questions to settle before the first real report.**

- Who are the two named core recipients, and who is the journalist partner
  for channel 4? These names appear on the public submission screen.
- Do we accept reports about deployments outside Italy and the EU, and if
  so, do we have partners who can verify there?
- What is our position when a report describes a crime in progress against
  a person (a specific misidentification with consequences unfolding)? The
  public page says we cannot intervene; we should decide what we do instead.
- Legal: what are our own obligations as recipients of personal data in
  reports (GDPR, journalistic exemption where applicable, the Italian
  transposition of the whistleblowing directive), and who is the lawyer we
  call? The public page tells sources that reporting to us is usually not a
  legally protected route; we should be able to tell them what is.

---

## Sources and further reading

On working with whistleblowers as a journalist or researcher:

- Perugia Principles for Journalists Working with Whistleblowers in the
  Digital Age (Blueprint for Free Speech, 2019). Twelve principles, from
  "protect your sources, defend anonymity" to "explain the risks of digital
  exposure". The closest thing to a professional standard for what we are
  doing. https://www.blueprintforfreespeech.net/en/perugia-principles
- Freedom of the Press Foundation, digital security guides for sources and
  for the people who receive them. https://freedom.press/digisec/
- Global Investigative Journalism Network, resource centre on whistleblowers
  and secure communication. https://gijn.org/resource/
- Whistleblowing International Network, directory of national support and
  legal-advice organisations. https://whistleblowingnetwork.org/

On the tool:

- GlobaLeaks application security documentation: what the receipt is, what
  is encrypted, what the platform does and does not protect against.
  https://docs.globaleaks.org/en/stable/technical/security/application-security.html
- GlobaLeaks user documentation for recipients (reading reports, comments,
  expiration, identity requests). https://docs.globaleaks.org/en/stable/user/

On the legal frame:

- Directive (EU) 2019/1937 on the protection of persons who report breaches
  of Union law. Note Article 10 (external reporting to competent authorities)
  and Article 15 (public disclosure, conditional): reporting to an NGO or a
  research project is not itself one of the protected channels.
  https://eur-lex.europa.eu/eli/dir/2019/1937/oj
- Italy: Decreto Legislativo 10 marzo 2023, n. 24, and ANAC's guidelines on
  external reporting. ANAC runs the national external channel.
  https://www.anticorruzione.it/-/whistleblowing
- EDRi, how to fight biometric mass surveillance after the AI Act, for the
  regulatory context our findings feed into.
  https://edri.org/our-work/how-to-fight-biometric-mass-surveillance-after-the-ai-act-a-legal-and-practical-guide/

On handling weaknesses responsibly:

- ISO/IEC 29147, vulnerability disclosure. The reference model for how a
  finding about a weakness reaches the party able to fix it. Adapt, do not
  adopt: our sources are more exposed than the typical security researcher.

On the house rules:

- `brand-voice.md`, sections "Reporting closes the loop", "Reporting
  anonymity and access" and the claims ladder. Public copy about the
  reporting node must satisfy the publication checklist there.
