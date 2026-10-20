# Ghostmaxxing brand voice

Version: 2.0.0  
Reviewed: 20 October 2026  
Scope: Ghostmaxxing software, website, documentation and public gallery.

## Authority and responsibilities

This is an editorial standard, not a feature specification. Use `about.html` for the public account of responsibilities, the functional documentation for explanations, and the implementation for observable behaviour. If they disagree, resolve the claim before repeating it. A public page is a reference, not proof that a feature works in production.

**Ghostmaxxing** names the independent free software, browser lab, Ghostyles, technical and cultural archive, and optional public gallery/Fediverse infrastructure.

**Ghòstati!** names the initiative of **NINA's Universal Union** in both Italian and English. NINA organises its workshops and handles its confidential whistleblowing channels. Ghostmaxxing supplies software that NINA and other groups can use. Do not translate Ghòstati! as Ghostmaxxing or call NINA's reporting service “our backend”.

Link workshop and reporting invitations to the appropriate language on `https://sindacato.nina.watch`. Explain the receiving organisation beside a consequential invitation. Do not duplicate questionnaires, Signal invitations, service addresses or security instructions here; their maintained destination owns them.

## Purpose and voice

Ghostmaxxing makes face-recognition experiments inspectable and repeatable. It comes from politically engaged hacking: inquiry, subversion and freedom. Preserve that position without presenting the software as an invisibility product or reducing its audience to technical insiders.

The voice is curious, culturally literate, technically precise and candid about uncertainty. Poster headlines can invite attention; the explanation must earn it. A face match is a system output, not a truth about a person.

Avoid startup promises, safety marketing, unexplained jargon and activist slogans without methods or evidence. Keep operational instructions calm and concrete. Do not tell a user that a green indicator means it is safe to go outside.

## Standard descriptions

**One line:** Ghostmaxxing is free software for browser-based experiments with face-recognition camouflage and the technical and cultural history of anti-biometric interventions.

**Short:** Ghostmaxxing combines local camera experiments, modular AR interventions called Ghostyles, comparison tools and a reference archive. Results describe a particular model and test setup. Optional gallery submissions are separate from NINA's confidential reporting channels.

**Extended:** Ghostmaxxing lets developers, researchers, artists, digital rights groups and curious people inspect how visual interventions change a browser pipeline's outputs. Ghostyles make interventions reproducible; the archive helps readers trace earlier demonstrations and their limits. People can choose to submit media for moderation and possible public distribution through the gallery and Fediverse. Ghòstati!, part of NINA's Universal Union, organises workshops and receives confidential evidence about real-world deployments through separate channels.

## Technical accuracy

Distinguish the task before describing a result:

| Task | Current implementation reference | Editorial consequence |
|---|---|---|
| Face detection and biometric matching | `lab-js/engine-2d.js` | Detection is not identification. A face-api descriptor and distance concern this local comparison. |
| Face geometry and tracking | MediaPipe integration in `lab-js/` | A 3D mesh is not proof of biometric identity recognition. |
| General image similarity | `lab-js/engine-3d.js` | ImageEmbedder/MobileNetV3 produces embeddings too. It is not trained for biometric face recognition; scene, colour and lighting can affect the comparison. |
| Public media submission | `lab-js/upload.js`, `gallery.html`, `fediverse.html` | Submission is optional; review precedes publication. It is not a confidential report. |

Feature extraction produces an embedding/descriptor; avoid teaching these as two independent recognition stages. Scores from different engines are not interchangeable. A missing detection, a failed match, an unready model and an error are different states. Explain the actual label, model, threshold and conditions rather than translating all of them into “success”.

## Evidence and claims

For a result, record the task, model/version, intervention, comparison baseline, threshold and material conditions such as light, camera, pose and distance. Report unsuccessful attempts too. Unknown transfer to another model or deployed system stays unknown.

| Claim | Treatment |
|---|---|
| Observable behaviour with a source | State plainly, with scope. |
| Result under specified conditions | Publish the conditions and limitations beside it. |
| Hypothesis or planned feature | Label explicitly as a question or proposal. |
| Guaranteed protection, anonymity or universal evasion | Remove the claim. |

Prefer “the local matcher did not match the saved descriptor under these conditions” to “your fingerprint is no longer recognised”. Do not equate digital overlays with demonstrated physical makeup performance. Use “defeated” only for a specific documented past result, never a promise.

An archive entry should identify the work, primary source, demonstration, conditions, limitations and what can be retested. Separate an author's claim from our observation.

## Research and data flows

1. Run a local experiment and inspect the result.
2. Document the conditions and, where useful, package the intervention as a Ghostyle.
3. Optionally submit selected media for moderation and possible gallery/Fediverse publication.
4. Use public results and archive material to inform further experiments or workshops.
5. Refer people with confidential evidence to NINA's separate guidance.

These are related activities, not one automatic pipeline. Do not imply that confidential reports flow into the gallery, or that verified reports automatically become software updates. Any later public use of findings needs a separate editorial decision by the responsible organisation.

Describe implemented publishing and feeds using `fediverse.html` and the backend contract. Bidirectional ingestion of federated research objects or automatic installation of Ghostyles must be labelled as a proposal unless the particular feature has been verified. Do not infer deployment health from source code or a roadmap.

“Local processing” describes the experiment's processing path. It does not mean that opening the website makes no network requests, that optional uploads stay local, or that all media metadata is removed. Use the current upload and privacy explanations, not an absolute “nothing ever leaves your device”.

## Names and invitations

A **Ghostyle** is a modular visual intervention applied through the lab. Define it at first mention for a general audience. A plugin can reproduce an intervention; it does not certify protection. Use “filter” only when the cosmetic/rendering sense is intended.

| Destination | Suggested invitation | Owner |
|---|---|---|
| Lab | Open the lab | Ghostmaxxing software |
| Archive | Explore the references | Ghostmaxxing |
| Public submissions | Read the gallery submission guidance | Ghostmaxxing public workflow |
| Workshops | Join a Ghòstati! workshop | NINA's Universal Union |
| Confidential reports | Read NINA's reporting guidance | NINA's Universal Union |

Existing chrome may still say “Leak to us”. Treat that as legacy wording to review in templates and translations, not a phrase to prescribe in new copy. A link label should make the recipient clear without implying that clicking it submits a report.

On Sindacato, the initiative keeps the name Ghòstati! in both languages. Links opening its native lab use a new tab as agreed for that integration; software navigation may continue to Ghostmaxxing. This is an integration choice, not a requirement to open every external link in a new tab.

## Tone by surface

- **Homepage and About:** invite exploration; explain software scope and the NINA relationship.
- **Lab:** next action, processing location, model state and limits. No manifesto during a task.
- **Technical docs:** prerequisites, interfaces and reproducible examples. No persuasive claims in API contracts.
- **Archive and genealogy:** evidence, provenance and chronology. A dated project marker is not a victory over a whole class of systems.
- **Fediverse:** concise updates with test conditions and publication context. Distinguish public objects from confidential material.
- **Workshop/report links:** welcoming or calm as appropriate; identify NINA and let its maintained pages provide practical details.

## Mechanics and maintenance

Use clear international English, sentence-case headings and short declarative instructions. Preserve names, identifiers and quoted titles. UK and US spelling may coexist. Define technical terms, put limits next to claims, and avoid emoji and em dashes in new core copy.

Before publishing, check the responsibility, observable feature, evidence and destination. When an engine, upload flow, owner or navigation destination changes, review the affected public text, metadata, translations and this guide in the same change.

Do not copy exact feature inventories or deployment status into all three design documents. This guide owns voice and claim discipline; `visual-direction.md` owns design intent; `visual-styleguide.html` shows specimens. Code owns token values and component behaviour. Review on relevant changes rather than assuming a version number makes a document current.
