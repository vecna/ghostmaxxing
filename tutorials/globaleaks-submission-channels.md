# (Internal) GlobaLeaks channels & specification

Eight questionnaires (GlobaLeaks calls the object you attach to a "Context" a
**Questionnaire**, made of one or more **Steps**, each holding **Fields**).
This document gives you, for each one: the context name and description to
type into the GlobaLeaks admin panel, then every field with its exact label,
the hint/description text shown under the field, the GlobaLeaks field type to
pick from the dropdown, and whether to mark it mandatory.

**Design principle used throughout:** almost nothing is mandatory. A
whistleblower who abandons the form because question 3 of 9 is a hard
stop is a whistleblower we never hear from. Where a field is marked
mandatory below, it's because the answer is needed to make the rest of the
submission usable (e.g. "can you actually test this" gates the whole
Ghostyle-testing flow) — everything else is opt-in.

## GlobaLeaks field-type quick reference

| In this document | Pick in GlobaLeaks admin |
|---|---|
| Short text | "Single-line text" |
| Long text | "Multi-line text" |
| Single choice | "Multiple choice question" with "Allow multiple answers" **off** |
| Multiple choice | "Multiple choice question" with "Allow multiple answers" **on** |
| Date | "Date" |
| File upload | "File upload" |

For every "Single choice" / "Multiple choice" field below, add the listed
options in the order given — order matters less than completeness, but
keeping "Other" / "I don't know" last reads better.

For each context, also fill in the plain-language **Context description**
field in the admin panel — that's the text GlobaLeaks itself shows above the
form. Reuse the one-line description under each heading below for that.

---

## 1. System overview

*"You work with facial-recognition technology."*
**Context description:** For anyone who understands how a specific system is
built, deployed, or operated. Answer whatever you're comfortable with — most
fields here are optional on purpose.

| Field label | Description / hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What kind of place is this deployed in? | Pick the closest match. | Single choice: Retail · Transport & transit · Law enforcement · Airport & border control · Education · Stadium & events · Workplace access control · Other | No |
| If "other," what kind of place? | Only needed if you picked "Other" above. | Short text | No |
| Country or region of deployment | City-level is fine. Even a country alone is useful. | Short text | No |
| Vendor or product name, if known | The commercial name of the system, or the company that built or sold it. You can always add this later with your receipt code if you'd rather not name them yet. | Short text | No |
| What technology does it use? | Camera type (visible light, infrared, 3D depth), the matching algorithm if you know it, whether processing happens on-device or in the cloud, anything about the underlying model. | Long text | No |
| How many people or locations does it cover? | Rough numbers or scale are fine. | Long text | No |
| Who can access match results or footage? | Roles, departments, or third parties with access — job titles are enough, names aren't needed. | Long text | No |
| How long is data retained? | An exact policy if you know it, or your best estimate. | Short text | No |
| Is there a human review step before any action is taken on a match? | | Single choice: Yes, always · Sometimes · No · I don't know | No |
| Anything else about how this system works? | Open field — use it for anything the questions above didn't cover. | Long text | No |

---

## 2. Test our countermeasures

*"You can run our test cases against a real system."*
**Context description:** For anyone with access to a live or staging
facial-recognition system who's willing to try a Ghostyle or test image
against it and tell us what happened.

| Field label | Description / hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| Do you have access to a system you could safely test against? | This is the one question we do need answered, since it decides whether the rest of this form applies. | Single choice: Yes, a live production system · Yes, a staging or test environment · Only a demo or sandbox · Not sure yet | **Yes** |
| What kind of system is it? | A sector or product name, whatever you're comfortable sharing. | Short text | No |
| Can you receive or upload a test image without it being logged in a way that could identify you? | Helps us understand what's safe to send you. | Single choice: Yes · No · Not sure | No |
| What could you test? | Select everything that applies. | Multiple choice: Detection (does it find a face at all) · Matching against a known identity · Liveness / anti-spoof detection · Something else | No |
| Describe the result | What happened when you tried it — detected as expected, failed, behaved unpredictably. Include confidence scores if you can see them. | Long text | No |
| Attach a redacted result, if you can share one | A screenshot or log works. Please blur or remove anything that could identify you first — your name, employee ID, an exact timestamp plus location together. | File upload | No |
| Willing to try more examples through your receipt code? | | Single choice: Yes · Maybe · No | No |

---

## 3. Weak spots & field recognition

*"You know where a deployment falls apart."*
**Context description:** For anyone who's seen a specific facial-recognition
deployment that's misconfigured, poorly maintained, or otherwise weaker than
its spec sheet suggests — and for anyone who can describe what it looks like
from the outside, so others can recognize the same setup.

| Field label | Description / hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What kind of weakness is this? | Select everything that applies. | Multiple choice: Misconfiguration · Outdated software or firmware · Poor physical security of the hardware · Excessive or indefinite data retention · Weak or missing human oversight · Something else | No |
| Describe the weakness | | Long text | No |
| How confident are you this still applies today? | | Single choice: Confirmed recently · Confirmed a while ago, may have changed · Heard about it secondhand | No |
| What does this deployment look like from the outside? | Visible hardware, branding, signage, mounting position, LED or IR indicators — anything that would help someone recognize the same setup elsewhere. | Long text | No |
| Where else might the same setup exist? | Other branches, cities, or vendors known to use the same or a similar configuration. | Long text | No |
| Attach a photo of the hardware or signage, if it's safe to | Only if you weren't clearly recorded taking it yourself. | File upload | No |

---

## 4. Contracts & market

*"You've seen the paperwork."*
**Context description:** For anyone with knowledge of a contract, tender,
budget, or vendor relationship behind a facial-recognition deployment —
including legal, compliance, or procurement records.

| Field label | Description / hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What kind of document or knowledge is this? | Select everything that applies. | Multiple choice: Signed contract · Draft or tender proposal · Internal budget · Vendor sales pitch · Impact or compliance assessment · Verbal knowledge, no document | No |
| Vendor or contractor name | | Short text | No |
| Buyer / client organization | | Short text | No |
| Approximate contract value or budget, if known | | Short text | No |
| Contract duration or dates | | Short text | No |
| What does the agreement actually cover? | Hardware, software licensing, maintenance, data hosting, analytics, staff training — anything bundled in. | Long text | No |
| Describe the market context | Competing bidders, exclusivity clauses, lobbying, prior relationships between vendor and buyer — anything about how the deal came together. | Long text | No |
| Attach a document, if you can share one safely | | File upload | No |

---

## 5. Operators & frontline staff

*"You run the system, day to day."*
**Context description:** For security staff, control-room operators, or
anyone whose job involves watching, acting on, or overriding what a
facial-recognition system flags.

| Field label | Description / hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What's your role in relation to the system? | E.g. security guard, control-room operator, help-desk staff, store manager. | Short text | No |
| How often does it flag someone incorrectly, in your experience? | | Single choice: Often · Occasionally · Rarely · I don't know · We're not told | No |
| What actually happens when there's a match or alert? | Walk us through it — who's notified, what the written procedure says, whether it's actually followed. | Long text | No |
| Can staff override or dismiss a flagged match? | | Single choice: Yes, easily · Yes, but discouraged · No · I don't know | No |
| Have you ever raised a concern internally about this system? | What you raised, and what happened as a result, if anything. | Long text | No |
| Anything about day-to-day use the manual doesn't mention? | | Long text | No |

---

## 6. Procurement & public officials

*"You approved it, funded it, or signed off on it."*
**Context description:** For anyone on the decision-making or oversight side
of a facial-recognition purchase — budget approval, tender evaluation,
legal/DPO sign-off, or an oversight committee seat.

| Field label | Description / hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What's your relationship to the decision? | E.g. budget approval, tender evaluation, oversight committee, legal/DPO sign-off. | Short text | No |
| Was there a public tender? | | Single choice: Yes, competitive · Yes, single-bidder · No, direct award · I don't know | No |
| Was a data protection or human rights impact assessment carried out? | | Single choice: Yes, and I can share it · Yes, but I can't share it · No · I don't know | No |
| Who reviewed or approved this beyond the immediate team? | | Long text | No |
| What oversight exists after deployment? | Audits, public reporting, a complaints mechanism, a scheduled review or renewal date. | Long text | No |
| Attach a tender, assessment, or oversight document, if safe to share | | File upload | No |
| Anything about how this decision was made that concerned you? | | Long text | No |

---

## 7. Public sightings

*"You spotted something in public space."*
**Context description:** The lowest-barrier form here — you don't need
inside access or technical knowledge. If you saw a camera, kiosk, or sign
you didn't recognize, this is enough.

| Field label | Description / hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| Where did you see it? | City, neighborhood, or exact address if you're comfortable — even approximate is useful. | Short text | No |
| When did you see it? | Approximate date is fine. | Date | No |
| What did it look like? | Camera type, mounting, visible branding or model numbers, kiosks, signage. | Long text | No |
| Was there signage disclosing its use? | | Single choice: Clear signage · Vague or hard-to-find signage · No signage · Didn't check | No |
| Attach a photo, if it's safe to take one | Avoid capturing yourself or bystanders' faces if you can — we can help redact if needed. | File upload | No |
| Anything else about the location or context? | | Long text | No |

---

## 8. Affected individuals

*"You were stopped, flagged, or misidentified."*
**Context description:** For anyone who was personally stopped, denied
service, questioned, or misidentified by a facial-recognition system. Your
experience is evidence, whether or not you have technical details.

| Field label | Description / hint shown to submitter | Type | Mandatory |
|---|---|---|---|
| What happened? | In your own words — stopped, denied entry or service, flagged, questioned, anything else. | Long text | No |
| Where and when did it happen? | | Short text + Date *(use two fields: "Location" as Short text, "Date" as Date)* | No |
| Do you know which system or organization was involved? | | Short text | No |
| Were you given an explanation at the time? | | Long text | No |
| Did you try to challenge or appeal it? | | Single choice: Yes, successfully · Yes, unsuccessfully · Yes, still ongoing · No | No |
| Would you be willing to be connected with a journalist or advocate about this? | | Single choice: Yes · Maybe — contact me via my receipt code first · No | No |
| Attach any documentation you received | E.g. a denial letter or incident report. | File upload | No |

---

## After you set these up

1. Create each context in GlobaLeaks admin, paste in the description above,
   and build its questionnaire from the field table.
2. Copy the resulting `https://raccontaci.nina.watch/#/submission?context=<uuid>`
   URL for each one.
3. In `report.html`, replace the placeholder `href="https://raccontaci.nina.watch"`
   on each of the eight `.audience-card` links with its real context URL —
   they're marked with an HTML comment (`<!-- TODO: replace each href below... -->`)
   right above the card grid.
