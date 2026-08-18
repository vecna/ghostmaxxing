# pages-js

This folder contains the small page-level JavaScript files for Ghostmaxxing's static informational and content pages. Unlike the main lab runtime in `lab-js/`, these scripts are not the app engine; they handle specific UI behaviors for landing pages and support pages such as the homepage, genealogy page, and shared site navigation.

The scripts here are loaded directly by the HTML pages without a bundling step, and they keep page logic small, self-contained, and dependency-light.

## Files

- `index.js` — homepage camera-field interaction. It builds the animated field of camera icons, loads fact copy from `/data/camera-facts.json`, reveals camera facts as each type is cleared, updates the progress state, and triggers the finale when all camera types are found.

- `nav.js` — shared site navigation menu behavior for the "Know more" dropdown. It toggles the menu, handles outside clicks and Escape key dismissal, and closes the menu when focus leaves the nav.

- `stamp.js` — genealogy stamp layout script. It bends caption text around a circular stamp or emblem by computing arc geometry, keeping the letters aligned with the icon, and re-laying out on resize or when web fonts finish loading.

## Purpose

This folder is intentionally compact: it holds only page-specific interactions that are not part of the face-analysis or lab tooling. The code here favors direct DOM work and lightweight behaviors over broad shared state or application architecture.
