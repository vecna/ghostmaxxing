# Ghostmaxxing brand voice and outreach

Version: **2.1.0**  
Updated: 20 October 2026  
Audience: contributors, editors, translators, LLMs and coding agents.

Read this before writing or rewriting public text. The [visual styleguide](/visual-styleguide.html) defines colours, typography, components, technical-tool exceptions and preview layouts. It replaces the separate visual-direction tutorial. These two documents govern new copy and design; older examples are not permission to repeat outdated claims.

## 1. Identity and responsibilities

**Ghostmaxxing** is independent free software for experimenting with face-recognition camouflage. It includes browser tools, modular visual interventions called Ghostyles, a technical and cultural archive, and optional public gallery/Fediverse infrastructure.

The project comes from politically engaged hacking: inquiry, subversion and freedom. It challenges the normalisation of biometric surveillance. Explain that position through experiments, documented deployments and inspectable methods. Do not reduce the audience to technical insiders or describe the software as an invisibility product.

**Ghòstati!** is the initiative of **NINA's Universal Union**, called **Sindacato Universale di NINA** in Italian. Keep the name Ghòstati! in both languages. The Union organises its workshops and manages its confidential whistleblowing channels. Ghostmaxxing supplies software that NINA and other organisations can use.

NINA is an external integrator of Ghostmaxxing. Hosting the lab does not make NINA the operator of Ghostmaxxing's public upload service. A public gallery submission is not a confidential report. Attribute each action to the organisation receiving it.

Ready-to-use attribution:

> Ghostmaxxing develops the software. Ghòstati!, part of NINA's Universal Union, organises workshops and handles confidential reporting.

Use maintained destinations rather than copying questionnaires, Onion Service addresses, Signal invitations or security instructions:

| Purpose | English | Italian |
|---|---|---|
| Initiative | https://sindacato.nina.watch/en/initiatives/ghostati/ | https://sindacato.nina.watch/it/iniziative/ghostati/ |
| Confidential reporting guidance | https://sindacato.nina.watch/en/ghostati/report/ | https://sindacato.nina.watch/it/ghostati/segnalazioni/ |
| Union blog | https://sindacato.nina.watch/en/blog/ | https://sindacato.nina.watch/it/blog/ |

Check these destinations when publishing. The Union blog covers other initiatives too: do not relabel it the official Ghostmaxxing software blog. Sindacato's editorial pages use Ghòstati! as the initiative name; software attribution belongs where it helps explain a technical integration, not in every workshop heading.

## 2. Instructions for writers and agents

Apply these rules to headings, navigation, body copy, metadata, social cards and outreach drafts.

1. **Lead with an action or finding.** Say what the reader can test, inspect, reproduce or contribute.
2. **Use a subject and a verb.** Prefer “The browser compares two descriptors” to “The facilitation of biometric comparability”.
3. **Keep one main point per sentence.** Most sentences should fit in 12 to 25 words. Split sentences that combine a feature, its politics, a limitation and a future ambition.
4. **Do not use em dashes in new prose.** Use full stops, commas, colons or parentheses. Preserve exact quotations, source titles and identifiers.
5. **Remove abstract hyperbole.** Do not call the work revolutionary, groundbreaking, transformative, unprecedented, game-changing or the future of privacy. A quoted claim needs attribution and a reason to include it.
6. **Remove statements that sound profound but specify nothing.** Replace “the order is the contract” with the actual colour roles. Replace “where identity meets resistance” with what people do.
7. **Avoid stock LLM wording.** Do not use “delve”, “unlock”, “seamlessly”, “empower”, “foster” or “leverage” instead of an explanation. Use technical terms only when their object and meaning are clear.
8. **Avoid rhetorical padding.** No “This isn't just X, it's Y”, “More than a tool”, invented question-and-answer hooks, or final slogans repeating the introduction. Genuine research questions should name a testable unknown.
9. **Name actions and recipients.** “Open the lab”, “Save a baseline”, “Read NINA's reporting guidance”. Avoid “Discover the possibilities” and “Leak to us” on a software page that sends users elsewhere.
10. **Place limitations beside claims.** Name the model, task and conditions that matter. Do not repair an unsupported headline with a generic disclaimer at the bottom.
11. **Do not invent evidence.** No invented efficacy, partners, adoption figures, quotes, measurements or deployed features. Put missing evidence in an editorial note outside publishable copy.
12. **Preserve the argument.** Do not neutralise criticism of biometric surveillance, add marketing excitement, or rewrite precise technical names for variety. Use clear international English; UK and US spelling may coexist.
13. **Use formatting for comprehension.** Sentence-case headings; lists for steps; tables for comparisons; no emoji in core copy and no bold emphasis on every line.
14. **Translate responsibilities as well as words.** The organisation, destination, consent boundary and limitation must mean the same thing in both languages. Never translate Ghòstati! into Ghostmaxxing.

### Concrete rewrites

| Avoid | Write instead |
|---|---|
| Unlock the transformative power of adversarial beauty. | Apply a Ghostyle and compare the result with your saved baseline. |
| The greens are ordered, and the order is the contract. | Use `--gm-green` for camera outlines and `--gm-green-deep` inside the lens. |
| Your face is now invisible. | The detector found no face in this frame. |
| Green means you are safe to go. | The comparison crossed this model's threshold in this test. |
| A seamless ecosystem of resistance. | Save the test conditions so another person can repeat the experiment. |
| Follow us on Mastodon. | Read how Ghostmaxxing publishes research through ActivityPub. |
| Our anonymous reporting backend. | NINA's Universal Union manages confidential reporting for Ghòstati!. |

Humour is welcome when it names a specific situation and remains understandable internationally. Keep consent, errors and reporting instructions literal. Do not make people decipher a joke before deciding where their data goes.

## 3. Claims and technical vocabulary

Separate **detection** (finding a face), **landmarks** (estimating geometry), **matching** (comparing representations) and **identification** (assigning identity against a collection). They are not interchangeable.

- face-api descriptors concern face matching. State which comparison and threshold the interface uses.
- MediaPipe Face Landmarker estimates geometry; do not describe landmarks alone as identity recognition.
- MediaPipe ImageEmbedder with MobileNetV3 produces generic image embeddings. Do not call them biometric face descriptors.
- A Ghostyle is a modular visual intervention that can be applied and retested. A digital overlay does not establish that physical makeup will reproduce the result.
- “No face”, “model loading”, “camera denied” and “model failed” are different states. A missing result is not a successful intervention.
- A green display, changed distance or interrupted detection is not evidence of safety against deployed surveillance.

| Claim | Publication rule |
|---|---|
| Observable software behaviour | Verify against the current implementation and name the action. |
| Experimental result | Include model/task, comparison, threshold where relevant, sample and material conditions such as pose, light and camera. Link the record. |
| Transfer to another system | Say it is untested unless there is evidence for that system. |
| Planned feature | Label it planned; do not show it as an available action. |
| General safety promise | Remove it. Qualifiers do not turn “protects you from surveillance” into a supported claim. |

Keep the research loop concrete: run a local experiment; document conditions; share suitable material with consent; let others reproduce or challenge it; revise tests and archive entries. NINA's workshops can reuse the tools. Confidential evidence follows NINA's separate process. Do not imply reports enter the public gallery or automatically become Fediverse posts.

Use **Fediverse integration** as the short navigation label. “Fediverse native integration” can be used in an explanation that identifies ActivityPub functionality. Explain implemented publication, actors and moderation; do not promise automatic inbound lab updates unless implemented and verified. Federation transports public objects; it does not make them trustworthy.

Current short tool labels: **Camouflage lab**, **Video analyser**, **Makeup Explorer**. Use “Makeup Explorer” for `realtime.html`; explain its measurements in the page introduction. Use **Open lab** for the main action. Do not rename exported functions, routes or technical model names to match a display label.

## 4. Outreach and external descriptions

### Ready-to-use descriptions

Short:

> Ghostmaxxing is free software for testing face-recognition camouflage in the browser and documenting results under stated conditions.

Technical:

> Ghostmaxxing combines browser-based visual interventions, local comparisons and a research archive. Its tools let people inspect model outputs and document experiments. Results depend on the model and test conditions; a browser test does not establish protection against deployed systems.

Workshop:

> Ghòstati!, part of NINA's Universal Union, runs workshops using Ghostmaxxing's browser tools. Participants compare visual interventions and discuss what the measurements can and cannot show.

### Writing for other sites and communities

- Lead with the relevant method, reproducible observation or open question. For a technical audience, link code and test conditions. For a workshop audience, explain activities, prerequisites, organiser and consent choices.
- Link the software name to `https://ghostmaxxing.vecna.eu/` and source code to `https://github.com/vecna/ghostmaxxing`. Link a specific tool or record when that is the subject.
- Attribute research to its authors. Distinguish a paper's reported result from an independent reproduction and from a proposed experiment.
- Do not turn a software integration, article or independent review into a partnership or endorsement. Name the host and software separately.
- Keep concrete uncertainty in excerpts and social posts too. Do not let the short version make a broader claim than the article.
- Use participant images only with appropriate permission for that specific publication. Retain credits and context. Do not expose private receipts, faces from confidential reports or identifying metadata in previews.
- A pitch is not a press release: explain why the work fits that audience, what can be inspected now and what remains unresolved. Avoid identical promotional paragraphs sent everywhere.

These are attribution and editorial rules, not additional software licence terms. Consult the repository licence for redistribution obligations.

## 5. Search, previews and structured data

Metadata is public copy. Review it with the visible page whenever identity, responsibility, routes or claims change.

- Give each public page a specific title, for example `Makeup Explorer | Ghostmaxxing`, and a description of the actual task. Aim for roughly 45 to 65 title characters and 120 to 160 description characters where useful; these are editing targets, not protocol limits or display guarantees.
- Align `<title>`, description, Open Graph, Twitter card text and JSON-LD with the visible content. Avoid unsupported efficacy and stale workshop ownership in all of them.
- Use absolute HTTPS public URLs for canonical URLs, `og:url`, preview images and structured-data identities. Do not publish localhost, preview-server or filesystem paths.
- Set the document language. Add `hreflang` only between actual equivalent translations; a generic language homepage is not the translation of a specific article.
- Use the structured-data type that describes the page, such as SoftwareApplication for software or Article for an article. Name the actual author, publisher and host; do not add invented ratings, dates or NINA ownership of the software. Keep stable entity IDs where the entity is the same.
- `og:image:alt` and image dimensions describe the actual file. A visual label should remain understandable when cropped; alt text describes rather than repeating a slogan.

### Preview pictures

Edit `scripts-dev/social-cards.html`; use the existing generator, for example:

```bash
node scripts-dev/build-social-cards.cjs --only generic
```

The generator supports landscape **1200 × 630**, square **1200 × 1200** and wide **1500 × 500** variants. Verify the relevant options before changing a workflow. Review outputs in `images/social/` and `cards-manifest.json`, then update page metadata separately. Generation does not automatically fix every page's tags.

Use one short title, one factual sentence, the mark and a relevant image or camera composition. Keep important text and faces away from crop edges. Follow the visual styleguide for token use. Do not show fabricated numerical results or imply that a decorative spent lens proves a test succeeded. Review both full-size export and thumbnail; check crops in the receiving platform when possible.

### Sitemap and indexing

`web-files/sitemap.xml` is a maintained source file copied into the served output by the client installer. `npm run htmls` does **not** automatically discover pages and regenerate it.

Include absolute canonical URLs for public pages intended for indexing. Remove deleted routes and exclude internal guides, previews, private receipt fragments and duplicate variants. Use meaningful modification dates; a routine rebuild is not a content update. Keep the sitemap declaration in `robots.txt` aligned with the deployed site.

At the reviewed commit, the sitemap needs a separate audit for `realtime.html` and its functional guide. This documentation update does not modify that sitemap. Keep `visual-styleguide.html` marked `noindex`; do not add it to the sitemap. A sitemap is a discovery hint, not a guarantee of indexing.

## 6. External hosting and backend boundaries

A host may serve the tool's HTML, CSS, JavaScript, vendor files and models under its own path. Keep relative asset paths valid, preserve attribution where appropriate and avoid changing the backend just because the frontend origin changes.

`lab-js/backend-url.js` is the routing source of truth:

| Frontend hostname | Public backend origin |
|---|---|
| `localhost`, `127.0.0.1`, `::1`, `[::1]` | `http://localhost:4040` |
| `ghostmaxxing.vecna.eu` | Current origin |
| Any other hostname, including Sindacato | `https://ghostmaxxing.vecna.eu` |

Use the helper for public backend operations rather than maintaining another hostname switch. Local development requires the backend to be running for those operations. Do not rewrite public upload/gallery endpoints to the external host's `/api` by accident.

Explain these boundaries to users at the relevant action:

- The frontend host serves the interface and its assets. Running an inference locally is distinct from loading those resources over the network.
- Comparisons run in the browser. Optional uploads and public gallery/media operations use Ghostmaxxing's backend.
- Receipt links and local receipt storage belong to the frontend origin/path used by the participant. Do not promise they transfer between the upstream site and a mirror. Do not publish receipt links or deletion tokens in metadata, logs or screenshots.
- NINA's confidential reporting is separate. Link its maintained guidance; never submit reports through the gallery API.

Example disclosure for a host, adapting the first sentence to the actual organisation:

> This site hosts the Ghostmaxxing interface. Comparisons run in your browser. If you choose to upload a recording, it is sent to Ghostmaxxing's service at ghostmaxxing.vecna.eu. Ghòstati! workshops and confidential reporting are managed separately by NINA's Universal Union.

Before publishing a hosted copy, verify HTTPS and camera access, asset/model loading under the final path, backend CORS for the actual origin and required methods/headers, and any CSP restrictions. For framed inclusion, verify camera permissions and frame policies. Prefer a direct link or native hosting when a frame adds permission problems.

Test upload consent, gallery fetch and deletion from the deployed origin using disposable test media. Confirm the deletion request's `X-Delete-Token` header is permitted where required. Do not infer that a backend accepts a mirror merely because local inference works.

<<<<<<< Updated upstream
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
=======
Canonical policy is a deliberate host decision: an unchanged mirror can identify the upstream tool as canonical; a host-specific page intended for indexing can use its own canonical. Keep that choice consistent across canonical, `og:url`, JSON-LD and sitemap. Sindacato's native Ghòstati! pages use Sindacato URLs for their own identity; backend URLs do not determine page identity.

When Sindacato opens its lab in a separate tab, retain `target="_blank" rel="noopener"`. Make external recipients clear in link text. Do not force every software link to open a new tab.

## 7. Maintaining the guides

Keep responsibilities and writing rules here; keep design rules and live specimens in `/visual-styleguide.html`. Exact values belong in CSS, routing in `lab-js/backend-url.js`, and feature behaviour in implementation and functional documentation. A public page is a reference for wording, not proof of deployment.

When changing a feature, review visible copy, metadata, structured data, preview image, sitemap and both guides where relevant. Record the source commit or release in the review. Do not copy transient item counts or test results into permanent rules.

Useful implementation references:

- `styles/tokens.css`, `styles/cameras.css`, `styles/chrome.css`
- `styles/lab.css`, `styles/realtime.css`, `styles/loader.css`
- `lab-js/backend-url.js`, `lab-js/upload-consent.js`, `lab-js/gallery.js`
- `scripts-dev/social-cards.html`, `scripts-dev/build-social-cards.cjs`
- `scripts-dev/enrich-jsdoc-seo.cjs`, `web-files/sitemap.xml`

Older generators and tutorials may contain em-dash title suffixes or stale identity rules. This standard governs new output; review those generators explicitly rather than assuming a documentation edit changes them.

## 8. Extra references

* Reference specifications: [Open Graph](https://ogp.me/), [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).
* [visual styleguide](visual-styleguide.html).
>>>>>>> Stashed changes
