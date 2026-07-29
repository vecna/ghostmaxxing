# Contributing to Ghostmaxxing

Right now there is exactly one kind of external contribution with a defined
process: **a new Ghostyle**. This page is the whole process. There is no CI bot,
no governance layer, and no plugin-signing scheme — deliberately. Those arrive
only if and when real external PRs start showing up.

## Add a Ghostyle

1. **Fork** the repository and create a branch.
2. **Copy the template.** Start from
   [`ghostyles/00-template.js`](ghostyles/00-template.js) and save it as
   `ghostyles/your-slug.js`. Keep the `==Ghostyle==` header and fill in the
   required tags (`@name`, `@description`, `@slug`, `@version`, `@author`,
   `@license`). Export at least one of `onDraw` (2D) or `paintUV` (UV/3D).
   The full authoring contract is in the
   [Ghostyle Authoring Guide](https://ghostmaxxing.vecna.eu/docs/).
3. **Validate.** It must pass:
   ```bash
   npm run validate:ghostyle -- ghostyles/your-slug.js
   ```
   Fix every `✗` error. Address `⚠` warnings unless you can explain why not.
4. **Register it.** Add one `{ "id": "...", "url": "ghostyles/your-slug.js" }`
   line to [`ghostyles.json`](ghostyles.json). Keep the manifest in its current
   minimal shape — do not add richer fields; that belongs to the (not-yet-built)
   archive track.
5. **Open a PR** with a **screenshot or a short clip of the style on a real
   face** — your own face, or a consenting person's. This is how a reviewer sees
   what the code actually does.

## What review looks like

A maintainer reads the **whole file** (Ghostyles are arbitrary JavaScript that
runs in the browser — the threat model already treats them that way), runs it
locally against the lab, checks the header, and merges. That's it.

## House rules

- **Consent first.** Only submit imagery of people who agreed to it. Never submit
  a look derived from someone who did not consent.
- **No real-world protection claims.** A Ghostyle is an experiment. Describe what
  it does to the local pipeline, not what it "protects against". See the
  disclaimer in the README.
- **Keep `onDraw` synchronous and light.** It runs on the render hot path — no
  `await`, no heavy per-frame allocation. Guard landmark access.
- **New user-facing strings go through i18n.** Use `t()` / `data-i18n*` with
  `en`, `it`, `pt`, then re-run `npm run i18n:extract`.
- **Run `npm run check`** (validator + unit tests) before opening the PR.

If you want to help with something other than a Ghostyle, open an issue first so
we can point you at the right milestone.
