#!/usr/bin/env node
/**
 * extract-copy.js — pull the reviewable TEXT out of the HTML.
 *
 * Why this exists: only about 21% of the bytes in this project's HTML is text.
 * genealogy.html is 3.5% — the rest is inline SVG geometry. Sending whole HTML
 * files to a copy review spends four fifths of the budget on path data, and the
 * things that actually get missed in a copy pass are exactly the ones buried in
 * it: alt text, aria-labels, meta descriptions, button labels.
 *
 * Output is markdown with a line number against every string, so a review can
 * come back as "index.html:147 -> new wording" and be applied directly.
 *
 * No dependencies. Run: node scripts-dev/extract-text-only.js [--out FILE]
 */

const fs = require("node:fs");
const path = require("node:path");

/* Pages a reader actually reads. visual-styleguide.html is deliberately out:
   it is 88 KB, a third of it is prose, and that prose is internal design
   documentation, not site copy. Review it as a document when you review it. */
const PAGES = [
  "index.html",
  "about.html",
  "report.html",
  "workshops.html",
  "genealogy.html",
  "ghostyle-transfer.html",
  "lab.html",
  "loader.html",
  "realtime.html",
  "docs/index.html", 	  // same as below
  "references/index.html" // looks at the generated result!
];

/* Copy that lives outside the HTML and gets forgotten every single time. */
const DATA_FILES = ["data/camera-facts.json"];

/* Attributes that are user-facing prose. aria-label and alt are copy: they are
   read aloud, they are the only text a screen-reader user gets for an SVG, and
   nobody ever proofreads them. */
const TEXT_ATTRS = ["alt", "aria-label", "title", "placeholder", "aria-description"];

const SKIP_ELEMENTS = new Set(["script", "style", "template", "svg", "noscript"]);

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

/** Blank out the inner content of elements we never want text from, keeping
 *  every newline so line numbers stay true to the original file. */
function blankSkipped(html) {
  let out = html;
  for (const tag of SKIP_ELEMENTS) {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
    out = out.replace(re, (m) => m.replace(/[^\n]/g, " "));
  }
  return out;
}

function lineOf(html, index) {
  let n = 1;
  for (let i = 0; i < index; i++) { if (html[i] === "\n") { n++; } }
  return n;
}

function decode(s) {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#8599;/g, "↗").replace(/&#9662;/g, "▾").replace(/&#160;/g, " ")
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–");
}

/** Nearest enclosing tag + its class, as a locator hint. */
function contextAt(html, index) {
  const before = html.slice(0, index);
  const opens = [...before.matchAll(/<([a-zA-Z][\w-]*)([^>]*)>/g)];
  const closes = [...before.matchAll(/<\/([a-zA-Z][\w-]*)>/g)];
  const stack = [];
  const VOID = new Set(["meta", "link", "img", "br", "hr", "input", "source", "use", "path", "circle", "rect"]);
  let ci = 0;
  for (const o of opens) {
    while (ci < closes.length && closes[ci].index < o.index) {
      const t = closes[ci][1];
      const k = stack.lastIndexOf(t);
      if (k >= 0) { stack.length = k; }
      ci++;
    }
    if (VOID.has(o[1].toLowerCase()) || o[2].trim().endsWith("/")) { continue; }
    const cls = /class="([^"]+)"/.exec(o[2]);
    stack.push(cls ? `${o[1]}.${cls[1].split(/\s+/)[0]}` : o[1]);
  }
  while (ci < closes.length) {
    const k = stack.lastIndexOf(closes[ci][1]);
    if (k >= 0) { stack.length = k; }
    ci++;
  }
  return stack.slice(-2).join(" > ") || "—";
}

function extractPage(file) {
  const raw = fs.readFileSync(file, "utf8");
  const html = blankSkipped(stripComments(raw));
  const rows = [];

  const title = /<title>([\s\S]*?)<\/title>/i.exec(raw);
  if (title) { rows.push({ line: lineOf(raw, title.index), ctx: "title", text: decode(title[1].trim()) }); }

  for (const m of raw.matchAll(/<meta\s+(?:name|property)="(description|og:title|og:description)"\s+content="([^"]*)"/gi)) {
    rows.push({ line: lineOf(raw, m.index), ctx: `meta[${m[1]}]`, text: decode(m[2].trim()) });
  }

  /* Text nodes. > … < with the skipped elements already blanked out. */
  for (const m of html.matchAll(/>([^<>]+)</g)) {
    const text = decode(m[1]).replace(/\s+/g, " ").trim();
    if (!text || text.length < 2) { continue; }
    if (!/[a-zA-ZÀ-ÿ]/.test(text)) { continue; }
    const at = m.index + 1;
    rows.push({ line: lineOf(html, at), ctx: contextAt(html, at), text });
  }

  for (const attr of TEXT_ATTRS) {
    const re = new RegExp(`\\b${attr}="([^"]{2,})"`, "g");
    for (const m of html.matchAll(re)) {
      const text = decode(m[1]).trim();
      if (!text || !/[a-zA-ZÀ-ÿ]/.test(text)) { continue; }
      rows.push({ line: lineOf(html, m.index), ctx: `@${attr}`, text });
    }
  }

  rows.sort((a, b) => a.line - b.line);

  /* <title> is caught twice — once explicitly, once by the text-node scan. */
  const seen = new Set();
  return rows.filter((r) => {
    const k = `${r.line}|${r.text}`;
    if (seen.has(k)) { return false; }
    seen.add(k);
    return true;
  });
}

function main() {
  const outFlag = process.argv.indexOf("--out");
  const date = new Date().toISOString().slice(0, 10);
  const out = outFlag > -1 ? process.argv[outFlag + 1] : `EXTRACTED-text-${date}.md`;

  const parts = [];
  parts.push(`# Ghostmaxxing — reviewable copy\n`);
  parts.push(`Extracted ${date} by scripts-dev/extract-copy.js.\n`);
  parts.push(
    `Every string carries the line it lives on, so a revision can come back as\n` +
    `\`index.html:147 -> new wording\` and be applied without hunting.\n\n` +
    `\`@alt\` and \`@aria-label\` rows are copy too — they are the only text a\n` +
    `screen-reader user gets for an SVG, and they are never proofread.\n`
  );

  let strings = 0;
  for (const file of PAGES) {
    if (!fs.existsSync(file)) { continue; }
    const rows = extractPage(file);
    if (!rows.length) { continue; }
    strings += rows.length;
    parts.push(`\n## ${file}\n`);
    for (const r of rows) {
      parts.push(`- \`${r.line}\` \`${r.ctx}\` — ${r.text}`);
    }
  }

  for (const file of DATA_FILES) {
    if (!fs.existsSync(file)) { continue; }
    parts.push(`\n## ${file}\n`);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [key, list] of Object.entries(json)) {
      parts.push(`\n**${key}**`);
      list.forEach((item, i) => {
        const href = item.href ? `  → \`${item.href}\`` : "";
        parts.push(`- \`${key}[${i}]\` — ${item.text}${href}`);
        strings++;
      });
    }
  }

  const text = parts.join("\n") + "\n";
  fs.writeFileSync(out, text);
  const size = (Buffer.byteLength(text) / 1024).toFixed(1);
  process.stdout.write(`${out}\n${strings} strings, ${size} KB\n`);
}

main();
