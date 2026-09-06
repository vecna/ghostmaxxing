# (Internal) GlobaLeaks channels and questionnaire specification

Version 2, September 2026. Supersedes the eight-channel specification.

Five questionnaires. GlobaLeaks calls the object you attach to a **Context** a
**Questionnaire**, made of **Steps**, each holding **Fields**. This document
gives, for each context: the name and description to type into the admin
panel, then every field with its exact label, the hint shown under the field,
the field type, whether it is mandatory, and which options reveal further
fields (GlobaLeaks "triggers").

## Why five, and why these five

The previous eight channels were organised by *what kind of evidence* a
person might hold (a contract, a weakness, a sighting). People do not know
themselves that way. They know their **position** relative to the system:
they were on the wrong side of the lens, they built it, they sit in front of
its screen, or they signed the paper that paid for it. Four positions cover
every informed source we can name. The fifth questionnaire exists because a
channel that only accepts what we expected never receives what we did not.

| # | Position | Card title on report.html | Absorbs from v1 |
|---|---|---|---|
| 1 | Chi ha subito | You were stopped, flagged or misidentified. | 8 Affected individuals |
| 2 | Chi implementa | You build, integrate or test the technology. | 1 System overview, 2 Test our countermeasures, 3 Weak spots |
| 3 | Chi la usa | You operate it, day to day. | 5 Operators, the inside half of 3 Weak spots |
| 4 | Chi fa contratti e bandi | You bought it, sold it or signed it off. | 4 Contracts and market, 6 Procurement and officials |
| 5 | Chiunque altro | You noticed something, or none of the above fits. | 7 Public sightings, plus a deliberate catch-all |

Two design rules carried over and one added:

- **Almost nothing is mandatory.** A source who abandons the form at question
  3 is a source we never hear from. The only mandatory fields are the one
  that *is* the report (what happened, what you saw) and, in questionnaire 2,
  the branching question that decides which fields to show.
- **Ask only what that position can answer.** Every field below exists because
  a person in that position can plausibly answer it and because a receiver
  can act on the answer. If neither is true, the field is gone.
- **Every questionnaire ends with the same closing step**, "About this
  report": how the person knows, what would corroborate it, what we must
  not do with it, and whether they will come back. Those four answers are
  what turns a message into evidence a receiver can grade, and what gives the
  source control over publication. See `receiving-submissions.md` for how
  receivers use them.

Questionnaire 2 is the one that does the most work. It replaces three old
channels with one branching question ("What can you tell us about?") whose
options reveal three short sections. The section on **how camouflage
performs against real systems** is the feedback loop the whole lab depends
on: people who have run a published Ghostyle, a workshop look or their own
variant through a system they have access to, and can say what happened,
under which conditions. It sits with the builders because they are the people
who have that access, but the copy on the card names it explicitly so a tester
recognises themselves.

## GlobaLeaks field-type quick reference

| In this document | Pick in GlobaLeaks admin |
|---|---|
| Short text | Single-line text |
| Long text | Multi-line text |
| Single choice | Multiple choice question, "Allow multiple answers" **off** |
| Multiple choice | Multiple choice question, "Allow multiple answers" **on** |
| Date | Date |
| File upload | File upload |

**Triggers.** In a Single/Multiple choice field, each option has a "Trigger"
setting that can reveal another field or a whole step when that option is
selected. Fields marked *(shown when …)* below are hidden by default and
revealed by the named option. Put triggered fields in the same step as their
trigger, or trigger a whole step; both work.

**Order.** Keep "Other", "I don't know" and "Not sure" last.

**Context settings that matter** (Admin → Contexts → the context):

- Description: paste the one-line description under each heading.
- "Allow the whistleblower to add attachments": on for all five.
- "Allow the whistleblower to write comments" (the receipt conversation): on.
- Recipients: see `receiving-submissions.md`, "Who receives what".
- Report expiration: GlobaLeaks defaults to 90 days. Set **180 days**, and
  enable "allow recipients to postpone expiration" so an active case can be
  kept. Say the number on report.html and keep the two in sync.
- Order the five contexts as numbered here; the submission page lists them in
  that order.

---

## Shared closing step: "About this report"

Add this as the **last step of every questionnaire**. Identical labels
everywhere, so receivers read the same four answers in the same place.

| Field label | Hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| How do you know this? | Pick the closest. It changes how we can use what you wrote, not whether we read it. | Single choice: I saw it or did it myself · Someone directly involved told me · I worked it out from documents or data I have seen · I read or heard it second-hand · Prefer not to say | No |
| What would confirm it? | Other people in a position to know (roles, not names), documents that exist, places one could look. We use this to corroborate before anything is used. | Long text | No |
| Anything we must not do with this? | Select everything that applies. We follow these even when they make the story weaker. | Multiple choice: Use it only as a lead, never publish any detail from it · Do not quote my words · Do not name the country or city · Do not name the organisation · Do not contact anyone about this before asking me through the receipt · No restrictions beyond your published rules | No |
| Will you come back with your receipt code? | We may have questions, and a source who keeps the thread open helps far more than a single message. | Single choice: Yes, I will check back · Maybe · No, this is a one-off | No |

---

## 1. You were stopped, flagged or misidentified

**Context name:** Stopped, flagged or misidentified
**Context description:** For anyone who was personally stopped, questioned,
denied entry or service, or wrongly identified by a system that reads faces.
You do not need technical details. Your experience is the evidence.

| Field label | Hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What happened? | In your own words: where you were, what was said or done, how it ended. | Long text | **Yes** |
| Where? | City, venue or address, as precise as you are comfortable with. | Short text | No |
| When? | An approximate date is fine. | Date | No |
| Who ran the system, if you know? | The shop, transport company, police force, stadium, employer, event. | Short text | No |
| How do you know face recognition was involved? | Pick the closest. | Single choice: Staff told me · A sign or notice said so · I saw the camera, screen or alert myself · I am not certain, but it looked like it · Other | No |
| What did they say, and who said it? | Their role is enough (security guard, police officer, ticket staff). Names are not needed. | Long text | No |
| What happened as a result? | Select everything that applies. | Multiple choice: Questioned or detained · Denied entry or service · Asked to show ID · Escorted out · Nothing further · Consequences are still ongoing · Other | No |
| Did you challenge or appeal it? | | Single choice: Yes, successfully · Yes, unsuccessfully · Yes, still ongoing · No · I did not know I could | No |
| Did you see others treated the same way? | Same place, same day, or a pattern over time. | Long text | No |
| Attach anything you were given | A denial letter, an incident number, a photo of the sign. Check the file does not contain more about you than you intend. | File upload | No |
| Would you talk to a journalist or an advocate about this? | | Single choice: Yes · Maybe, ask me through the receipt first · No | No |

Then the closing step.

---

## 2. You build, integrate or test the technology

**Context name:** Build, integrate or test
**Context description:** For anyone who knows how a specific face-recognition
system is assembled or deployed, where one falls short of its spec sheet, or
who has run a camouflage pattern against a real system and can tell us how it
performed. Tell us which of those you can speak to and the form shows only
those questions.

### Step 1: Your position

| Field label | Hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What is your relationship to the technology? | | Single choice: I work for a vendor (engineering, product, support) · I install or integrate systems for clients · I run in-house IT or security for an organisation that uses one · I research or audit these systems independently · I test systems professionally (red team, pentest, QA) · Other | No |
| What can you tell us about? | Select everything that applies. Each choice opens a short set of questions below. | Multiple choice: How a system is built and deployed → *reveals step 2a* · Where a deployment is weaker than it should be → *reveals step 2b* · How camouflage performs against a real system → *reveals step 2c* | **Yes** |

### Step 2a: How it is built *(shown when "How a system is built and deployed")*

| Field label | Hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| Where is it deployed? | Pick the closest. | Single choice: Retail · Transport and transit · Policing · Airport or border · Stadium or events · Workplace or building access · Education · Smart glasses or consumer device · Other | No |
| Country or region | City is useful, country alone is still useful. | Short text | No |
| Vendor or product, if you know | Commercial name of the system or the company that built or sold it. You can add this later through the receipt if you prefer not to yet. | Short text | No |
| How does the pipeline work? | Camera type (visible, infrared, depth), the detection and matching models if known, on-device or cloud, the match threshold, what database it compares against. | Long text | No |
| Scale | Number of cameras, sites or people covered. Rough is fine. | Short text | No |
| Who sees the matches? | Roles or departments with access to alerts, footage or the watchlist. Job titles, not names. | Long text | No |
| How long is data kept? | Policy if you know it, otherwise your estimate. | Short text | No |
| Is there a human check before anyone acts on a match? | | Single choice: Yes, always · Sometimes · No · I don't know | No |

### Step 2b: Where it is weak *(shown when "Where a deployment is weaker than it should be")*

| Field label | Hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What kind of weakness? | Select everything that applies. | Multiple choice: Misconfiguration · Outdated software or models · Poor physical security of the hardware · Data kept longer or wider than allowed · Missing or nominal human review · It does not work as sold (accuracy, false matches) · Other | No |
| Describe it | What specifically is wrong, and how you know. | Long text | No |
| How current is this? | | Single choice: Confirmed recently · Confirmed a while ago, may have changed · Second-hand | No |
| How would someone recognise this deployment from outside? | Housing, mounting, branding, signage, indicator lights. What lets another person spot the same setup elsewhere. | Long text | No |
| Where else does the same setup exist? | Other sites, clients or cities using the same configuration. | Long text | No |
| Attach a photo, if it was safe to take | Only if you were not clearly recorded taking it. | File upload | No |

### Step 2c: How camouflage performs *(shown when "How camouflage performs against a real system")*

| Field label | Hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What did you test? | | Single choice: A Ghostyle from the lab or the @ghostyles feed · A look from a workshop or photo · My own variant · Something else | No |
| Which one? | The Ghostyle name or slug, a link to the post, or a description of the pattern. | Short text | No |
| Against what? | Product or vendor if known, otherwise the kind of system and where it is used. | Short text | No |
| Which stage did it affect? | Select everything that applies. | Multiple choice: Detection (it did not find a face) · Alignment or landmarks · Matching against a known identity · Liveness or anti-spoofing · None, it worked as normal · Not sure | No |
| What happened? | Detected as usual, failed, behaved unpredictably. Confidence scores or distances if you can see them. A pattern that did nothing is as useful to us as one that worked. | Long text | No |
| Under which conditions? | Camera and distance, light, pose, whether the face was enrolled, threshold if known. Results without conditions cannot be compared. | Long text | No |
| Attach a redacted result, if you can | Screenshot or log. Remove your name, employee ID, and any exact timestamp paired with a location. | File upload | No |
| Could you test more through your receipt code? | We would send you nothing that could identify you or the system. | Single choice: Yes · Maybe · No | No |

Then the closing step.

---

## 3. You operate it, day to day

**Context name:** Operators and frontline staff
**Context description:** For security staff, control-room operators, shop or
venue managers, help-desk staff: anyone whose work involves watching, acting
on, dismissing or logging what a face-recognition system flags.

| Field label | Hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What is your role in relation to the system? | Security guard, control-room operator, store manager, help desk, supervisor. | Short text | No |
| Where is it used? | Kind of place and, if you are comfortable, city or organisation. | Short text | No |
| What happens when it flags someone? | Walk us through it: who is notified, what the written procedure says, what actually happens. | Long text | No |
| How often is it wrong, in your experience? | | Single choice: Often · Occasionally · Rarely · I don't know · We are not told | No |
| Can staff override or dismiss a match? | | Single choice: Yes, easily · Yes, but it is discouraged · No · I don't know | No |
| Who is on the watchlist, and how do they get there? | Who adds people, on what grounds, whether anyone is ever removed. | Long text | No |
| What training or instructions did you receive? | Including what you were told about accuracy, and about what to say to people who are flagged. | Long text | No |
| Have you raised a concern internally? | What you raised, and what happened. | Long text | No |
| What does the manual not mention? | Workarounds, things that are switched off, things that are never checked. | Long text | No |
| Attach a redacted screenshot or document, if safe | Remove your name, employee ID and any exact timestamp paired with a location. | File upload | No |

Then the closing step.

---

## 4. You bought it, sold it or signed it off

**Context name:** Contracts, tenders and sign-off
**Context description:** For anyone who has seen the paperwork behind a
face-recognition deployment, on either side of the table: sales and bid
teams, procurement, budget holders, legal and data-protection officers,
auditors and oversight bodies, consultants.

| Field label | Hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| Which side were you on? | | Single choice: Vendor sales, bid or partnership team · Buyer procurement or tender evaluation · Budget or political approval · Legal, compliance or data protection sign-off · Oversight body, auditor or ombudsman · Consultant or adviser · Other | No |
| What do you know about? | Select everything that applies. | Multiple choice: A contract or tender · A budget · A vendor pitch or lobbying · An impact assessment (DPIA, fundamental rights, ethics) or legal opinion · Oversight, audit or complaints after deployment · Verbal knowledge only, no document | No |
| Vendor or contractor | | Short text | No |
| Buyer or client organisation | | Short text | No |
| Value or budget, if known | Approximate is fine. | Short text | No |
| Dates or duration | Signing date, term, renewal or pilot end date. | Short text | No |
| What does the agreement cover? | Hardware, software licences, maintenance, data hosting, analytics, training, watchlist provision. | Long text | No |
| How was it awarded? | | Single choice: Competitive tender · Tender with a single bidder · Direct award · Through a framework or another authority's contract · Free pilot or trial · I don't know | No |
| Was an impact assessment carried out? | | Single choice: Yes, and I can share it · Yes, but I cannot share it · No · I don't know | No |
| What oversight exists after deployment? | Audits, public reporting, a complaints route, a review or renewal date. Or none. | Long text | No |
| How did the deal come together? | Competing bidders, exclusivity, prior relationships, lobbying, who pushed for it. | Long text | No |
| What about this concerned you? | | Long text | No |
| Attach a document, if you can share it safely | Consider describing it instead if the document is something only a few people have seen. | File upload | No |

Then the closing step.

---

## 5. You noticed something, or none of the above fits

**Context name:** Sightings and everything else
**Context description:** The lowest-barrier form. A camera, a kiosk, a sign,
a badge, a pair of glasses you did not expect. Or something about face
recognition that the other four questionnaires do not ask for. No inside
access or technical knowledge needed.

| Field label | Hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What did you notice, or what do you want to tell us? | In your own words. If none of the other questionnaires fits you, say here how you relate to face recognition and what you know. | Long text | **Yes** |
| Where? | City, neighbourhood or address. Approximate is useful. | Short text | No |
| When? | | Date | No |
| What did it look like? | Camera type, mounting, branding or model numbers, screens, signage, who seemed to operate it. | Long text | No |
| Was its use disclosed? | | Single choice: Clear signage · Vague or hard to find signage · No signage · Did not check · Not applicable | No |
| Attach a photo, if it was safe to take one | Avoid your own face and bystanders' faces. | File upload | No |

Then the closing step.

---

## Migrating from the eight contexts

1. Create the five contexts above and their questionnaires. Build the closing
   step once as a separate questionnaire step template if your GlobaLeaks
   version supports step reuse; otherwise copy it into each.
2. Assign recipients per context (see `receiving-submissions.md`).
3. Copy each context's submission URL
   (`https://raccontaci.nina.watch/#/submission?context=<uuid>`) into the
   matching `.audience-card` `href` in `report.html`. The cards are in the
   same order as this document.
4. Disable (do not delete) the eight old contexts so that any open report
   under them keeps working until it expires; hide them from the public
   submission page.
5. Update `about.html`, which still lists seven positions in its "Informed
   sources welcome" section, to the five titles above.
6. Publish the Onion Service address and the HTTPS address side by side on
   `report.html` (the placeholder is marked). The brand voice requires both
   to be visible before a person starts a submission.
