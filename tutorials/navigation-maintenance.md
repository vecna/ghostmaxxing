# Maintaining the static navigation

The header and footer are intentionally duplicated. Committed HTML works with `npm run serve` immediately; no include fetch, new template layer or navigation build is required. This is a maintenance choice, not an assertion that all markup is byte-identical.

## Current navigation

- **Tools:** Camouflage lab, Video analyser, Makeup Explorer.
- **Explore / Understand:** About Ghostmaxxing, Genealogy, Research references, Related projects.
- **Explore / Use and contribute:** Documentation, Gallery, Fediverse integration, Source code.
- **Ghòstati! / NINA:** Union blog in Italian and English, initiative/workshops, confidential reporting at NINA.
- **Primary CTA:** Open the lab.

The Union blog covers multiple initiatives. Its links must not imply a software-only blog. Workshops link to the stable Ghòstati! initiative rather than a permanently fixed dated announcement. NINA destinations own editorial content and confidential reporting. ↗ indicates an external destination, not a new tab.

## Copies to update together

Content pages: `index.html`, `about.html`, `fediverse.html`, `gallery.html`.

Generated pages and their sources:

| HTML output | Authored source |
|---|---|
| `projects/index.html` | `projects/templates/projects.template.html` |
| `references/index.html` | `references/templates/references.template.html` |
| `genealogy.html` | HEADER and FOOTER strings in `scripts-dev/build-genealogy.py` |
| Functional documentation under `docs/` | siteHeader() and siteFooter() in `scripts-dev/build-functional-docs.cjs` |

Tool variants: `lab.html`, `loader.html`, `realtime.html`. They contain home / Tools / Help navigation and no full footer. Preserve each tool's controls, IDs, locale selector and session behaviour. The compact script lives in `lab-js/tool-nav.js` so the Sindacato importer includes it. Root links are deliberately rewritten to the software host by that importer; other tools are not silently imported along with the lab.

Shared CSS: `styles/chrome.css`. Content enhancement: `pages-js/nav.js`. The styleguide and the site-chrome / CTA sections of the visual and voice guides document this pattern; review them when it changes. Generated JSDoc and the codemap retain their own technical navigation and are reached from documentation.

## Regeneration and checks

After editing generator sources:

```sh
npm run docs:functional
npm run update:projects
npm run update:references
npm run update:genealogy
```

These are existing build commands, also used by `npm run htmls`. No new navigation command is needed. The functional documentation is gitignored by existing repository policy; a release package can include it to make local browsing immediately complete. Keep that policy unless intentionally changing the documentation delivery strategy.

Check committed pages before regeneration and generated pages afterwards: Tools/Explore/NINA destinations, the primary CTA, footer attribution, current-page markers, and per-tool Help. At narrow widths, verify the Menu toggle, visible lab CTA, panel width and keyboard focus. Without JavaScript, native disclosures still expose all destinations. With JavaScript, only one disclosure stays open; Escape restores focus to its summary, and a second Escape closes the mobile menu.

The HTML copies are the maintained reference. Do not add a script that patches a template before another script renders it. A future contributor or agent should edit each authored copy and regenerate the existing outputs in one change.
