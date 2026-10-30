Your instinct is right. Over half of the install is documentation tooling that CI never runs.

I installed the same `devDependencies` ranges into a scratch folder with `--ignore-scripts`, so nothing executed. That's 415 packages and 222 MB. I didn't clone your repo or use its lockfile, so versions may differ slightly. To check what each dependency is used for, I read the config files and the `scripts-dev/` files on GitHub.

| What it's for | Packages only it needs | Size | Used by |
|---|---|---|---|
| Docs (`jsdoc` + `clean-jsdoc-theme` 5) | 229 | 120 MB | `npm run docs` only |
| Unit tests (`vitest`, coverage, `jsdom`, `vite`) | 91 | 69 MB | CI |
| E2E (`@playwright/test`) | 3 | 18.5 MB | CI and three `scripts-dev` files |
| `http-server` | 42 | 5 MB | Playwright `webServer`, `npm start`/`serve`, three `scripts-dev` files |
| `canvas` | 34 | 2.4 MB, without its native binary | `scripts-dev/lab-capture.cjs` only |
| `acorn` + `acorn-walk` | 1 | 0.1 MB | `build-codemap.js` |

**1. `clean-jsdoc-theme` 5 is most of the problem.** It pulls 238 packages, including a 35 MB icon set (`lucide-preact`), the `shiki` highlighter, `zod`, and esbuild. Here's what the alternatives install, each with `jsdoc`:

- `clean-jsdoc-theme@4`: 59 packages, 34 MB
- `docdash`: 31 packages, 22 MB
- `jsdoc`'s default template: 30 packages, 21 MB

Either switch, or give the docs tooling its own `package.json` so `npm ci` in CI never installs it. Switching themes means rewriting the `template` path and options in `jsdoc.clean.json`.

**2. Drop `canvas`.** It's only required lazily inside two functions in `lab-capture.cjs`, and that script already launches Playwright's Chromium, which can draw and export images itself.

I need to correct something I told you earlier. Its real install script is `prebuild-install -r napi || node-gyp rebuild`. It downloads a prebuilt binary at install time and only compiles as a fallback. npm's summary showed only the fallback, and `prebuild-install` is deprecated.

`jsdom` will pick up `canvas` automatically when it's installed. Your `tests/unit/setup.js` mocks `getContext` anyway, so the unit tests shouldn't need it.

**3. Replace `http-server` with a small built-in server.** It's 42 packages to serve static files. A ~40-line `node:http` + `fs` script in `scripts-dev/` could serve Playwright, `npm start`, and the three scripts. It needs to keep cache-busting (`-c-1`) and correct MIME types for things like `.mjs` and `.y4m`.

**4. Remove `vite` from the manifest.** Nothing references it directly: there's no vite config and no script calls it. `vitest` already depends on it (`^6 || ^7 || ^8`), so this cleans up `package.json` without changing what gets installed.

**5. Probably leave `jsdom` alone.** `happy-dom` is 9 packages instead of 39, but 24 MB against 28 MB, and it behaves differently.

**Keep** `@playwright/test`, `vitest`, `@vitest/coverage-v8` (the coverage badge needs it) and `acorn`/`acorn-walk`. The last two are tiny and have no dependencies of their own.

Doing 1–3 should take you from roughly 415 packages and 222 MB to about 110–140 packages and 95–120 MB. `canvas` would also drop out of `allowScripts`. esbuild would stay, because `vite` needs it for `vitest`.

One gap: I couldn't list `tests/unit/`, so I only checked `setup.js`. Before removing `canvas` or `jsdom`, run `grep -rn "canvas\|jsdom" tests/unit` to confirm no test imports them. `npx knip` can automate this kind of check.

Sources:
- [package.json](https://raw.githubusercontent.com/vecna/ghostmaxxing/main/package.json)
- [vitest.config.mjs](https://raw.githubusercontent.com/vecna/ghostmaxxing/main/vitest.config.mjs)
- [playwright.config.js](https://raw.githubusercontent.com/vecna/ghostmaxxing/main/playwright.config.js)
- [jsdoc.clean.json](https://raw.githubusercontent.com/vecna/ghostmaxxing/main/jsdoc.clean.json)
- [scripts-dev/lab-capture.cjs](https://raw.githubusercontent.com/vecna/ghostmaxxing/main/scripts-dev/lab-capture.cjs)
- [tests/unit/setup.js](https://raw.githubusercontent.com/vecna/ghostmaxxing/main/tests/unit/setup.js)
