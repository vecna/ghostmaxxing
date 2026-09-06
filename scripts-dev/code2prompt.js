#!/usr/bin/env node

"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DATE = new Date().toISOString().slice(0, 10);

/* Safety exclusions apply to every namespace, including --include-ignored. */
const COMMON_SAFETY_EXCLUDES = [
  ".git/**",
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/state.json",
  "**/storage-state.json",
  "**/storageState.json",
  "playwright/.auth/**",
  "secrets/**",
  "**/secrets/**"
];

const COMMON_NOISE_EXCLUDES = [
  "node_modules/**",
  "package-lock.json",
  "C2P-*.txt",
  "C2P-*.manifest.json",
  "CODE2PROMPT*.txt",
  "CODE2PROMPT*.manifest.json",
  "EXTRACTED-text-*.md",
  ".DS_Store",
  "**/.DS_Store",
  "tmp/**",
  "codemap/**",
  "coverage/**",
  "playwright-report/**",
  "test-results/**"
];

const COMMON_BINARY_EXCLUDES = [
  "styles/vendor/**/*.woff2",
  "images/**/*.png",
  "images/**/*.jpg",
  "images/**/*.jpeg",
  "images/**/*.webp",
  "images/**/*.ico",
  "**/*.mp4",
  "**/*.mjpeg",
  "**/*.y4m",
  "**/*.webm",
  "**/*.avi",
  "**/*.mov",
  "**/*.pdf"
];

const VENDOR_RUNTIME_EXCLUDES = [
  "lab-js/vendor/*.js",
  "lab-js/vendor/**/*.js",
  "lab-js/vendor/*.json",
  "lab-js/vendor/**/*.json",
  "lab-js/vendor/**/*.wasm",
  "lab-js/vendor/**/*.task",
  "lab-js/vendor/**/*.tflite",
  "lab-js/vendor/**/*-shard*",
  "lab-js/vendor/*.sh",
  "styles/vendor/**/*.css"
];

const ALL_DOCS_EXCLUDES = ["docs/**", "docs.html"];

/* Keep provenance text eligible while excluding generated documentation. */
const GENERATED_DOCS_EXCLUDES = [
  "docs/*.html",
  "docs/**/*.html",
  "docs/index.md",
  "docs/jsdoc/**",
  "docs/_assets/**",
  "docs/_islands/**",
  "docs/global/**",
  "docs/module/**",
  "docs/pagefind/**",
  "docs/source/**",
  "docs/tutorials/**",
  "docs/assets/screenshots/**/*.png",
  "docs/assets/screenshots/**/*.jpg",
  "docs/assets/screenshots/**/*.jpeg",
  "docs/assets/screenshots/**/*.webp"
];

const NAMESPACES = {
  "c2p:design": {
    description: "Front-end visual work: layouts, CSS, SVG assets, styleguide, branding.",
    outputPrefix: "C2P-design",
    include: [
      "*.html",
      "**/*.html",
      "styles/**/*.css",
      "pages-js/**/*.js",
      "tutorials/*.md",
      "images/**/*.svg",
      "images/FOLDER-DESCRIPTION.md",
      "images/**/FOLDER-DESCRIPTION.md",
      "manifest.webmanifest",
      "package.json"
    ],
    exclude: [
      ...COMMON_SAFETY_EXCLUDES,
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      ...VENDOR_RUNTIME_EXCLUDES,
      ...ALL_DOCS_EXCLUDES,
      "lab-js/**",
      "tests/**",
      "translations/**",
      "data/**",
      "references/index.html",
      "references/*.js"
    ],
    required: [
      "index.html",
      "styles/styles.css",
      "styles/tokens.css",
      "tutorials/brand-voice.md",
      "tutorials/visual-direction.md",
      "package.json"
    ]
  },

  "c2p:app": {
    description: "Released browser application: public pages, shared UI, Lab runtime, Ghostyles, and runtime data.",
    outputPrefix: "C2P-app",
    include: [
      "*.html",
      "*.js",
      "*.mjs",
      "styles/**/*.css",
      "pages-js/**/*.js",
      "lab-js/**/*.js",
      "lab-js/*.d.ts",
      "lab-js/FOLDER-DESCRIPTION.md",
      "lab-js/vendor/FOLDER-DESCRIPTION.md",
      "ghostyles/*.js",
      "ghostyles.json",
      "data/FOLDER-DESCRIPTION.md",
      "data/camera-facts.json",
      "images/**/*.svg",
      "images/FOLDER-DESCRIPTION.md",
      "images/**/FOLDER-DESCRIPTION.md",
      "manifest.webmanifest",
      "package.json"
    ],
    exclude: [
      ...COMMON_SAFETY_EXCLUDES,
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      ...VENDOR_RUNTIME_EXCLUDES,
      ...ALL_DOCS_EXCLUDES,
      "realtime.html",
      "scripts-dev/**",
      "tests/**",
      "tutorials/**",
      "translations/**",
      "references/**",
      "data/face_canonical_uv.json"
    ],
    required: [
      "index.html",
      "lab.html",
      "loader.html",
      "ghostyle-transfer.html",
      "lab-js/Ghostmaxxing.d.ts",
      "ghostyles.json",
      "manifest.webmanifest",
      "package.json"
    ]
  },

  "c2p:lab": {
    description: "Runtime engine work: face analysis, render loop, state, storage, plugins, and released Lab tools.",
    outputPrefix: "C2P-lab",
    include: [
      "lab-js/*.js",
      "lab-js/*.d.ts",
      "lab-js/FOLDER-DESCRIPTION.md",
      "lab-js/vendor/FOLDER-DESCRIPTION.md",
      "lab.html",
      "loader.html",
      "realtime.html",
      "ghostyle-transfer.html",
      "ghostyles/*.js",
      "ghostyles.json",
      "data/FOLDER-DESCRIPTION.md",
      "package.json"
    ],
    exclude: [
      ...COMMON_SAFETY_EXCLUDES,
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      ...VENDOR_RUNTIME_EXCLUDES,
      ...ALL_DOCS_EXCLUDES,
      "styles/**",
      "images/**",
      "tutorials/**",
      "tests/**"
    ],
    required: [
      "lab.html",
      "loader.html",
      "ghostyle-transfer.html",
      "lab-js/Ghostmaxxing.d.ts",
      "ghostyles.json",
      "package.json"
    ]
  },

  "c2p:lab-test": {
    description: "Lab code, automated tests, screenshot capture, and textual fixture provenance.",
    outputPrefix: "C2P-lab-test",
    include: [
      "lab-js/**/*.js",
      "lab-js/*.d.ts",
      "tests/**/*.js",
      "tests/**/*.cjs",
      "tests/**/*.mjs",
      "tests/**/FOLDER-DESCRIPTION.md",
      "tests/fixtures/**/*.json",
      "tests/fixtures/**/*.md",
      "scripts-dev/capture-doc-screenshots.cjs",
      "playwright.config.js",
      "playwright.config.cjs",
      "vitest.config.js",
      "vitest.config.mjs",
      "docs/assets/screenshots/manifest.json",
      "docs/assets/screenshots/README.md",
      "package.json"
    ],
    exclude: [
      ...COMMON_SAFETY_EXCLUDES,
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      ...VENDOR_RUNTIME_EXCLUDES,
      ...GENERATED_DOCS_EXCLUDES
    ],
    required: [
      "scripts-dev/capture-doc-screenshots.cjs",
      "tests/fixtures/FOLDER-DESCRIPTION.md",
      "playwright.config.js",
      "package.json"
    ]
  },

  "c2p:copy": {
    description: "Public copy, functional-documentation source, localisation context, and screenshot provenance.",
    outputPrefix: "C2P-copy",
    include: [
      "tutorials/brand-voice.md",
      "tutorials/visual-direction.md",
      "docs-src/**/*.html",
      "docs-src/**/*.json",
      "docs-src/**/*.md",
      "JSDOC_index.md",
      "scripts-dev/README.md",
      "translations/*.csv",
      "translations/*.pot",
      "translations/*.md",
      "images/FOLDER-DESCRIPTION.md",
      "images/**/FOLDER-DESCRIPTION.md",
      "web-files/FOLDER-DESCRIPTION.md",
      "data/camera-facts.json",
      "docs/assets/screenshots/manifest.json",
      "docs/assets/screenshots/README.md"
    ],
    exclude: [
      ...COMMON_SAFETY_EXCLUDES,
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      ...GENERATED_DOCS_EXCLUDES,
      "visual-styleguide.html"
    ],
    required: [
      "tutorials/brand-voice.md",
      "tutorials/visual-direction.md",
      "docs-src/README.md",
      "docs-src/en/pages.json",
      "JSDOC_index.md",
      "scripts-dev/README.md"
    ]
  },

  "c2p:docs": {
    description: "Functional docs, JSDoc entry/config, docs builders, styles, navigation, and screenshot provenance.",
    outputPrefix: "C2P-docs",
    include: [
      "docs-src/**/*.html",
      "docs-src/**/*.json",
      "docs-src/**/*.md",
      "JSDOC_index.md",
      "jsdoc.clean.json",
      "scripts-dev/build-functional-docs.cjs",
      "scripts-dev/capture-doc-screenshots.cjs",
      "scripts-dev/extract-text-only.js",
      "scripts-dev/README.md",
      "scripts-dev/FOLDER-DESCRIPTION.md",
      "styles/docs.css",
      "styles/styles.css",
      "styles/pages.css",
      "styles/content-pages.css",
      "styles/chrome.css",
      "styles/tokens.css",
      "pages-js/nav.js",
      "docs/assets/screenshots/manifest.json",
      "docs/assets/screenshots/README.md",
      "package.json"
    ],
    exclude: [
      ...COMMON_SAFETY_EXCLUDES,
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      ...GENERATED_DOCS_EXCLUDES
    ],
    required: [
      "docs-src/README.md",
      "docs-src/en/pages.json",
      "JSDOC_index.md",
      "jsdoc.clean.json",
      "scripts-dev/build-functional-docs.cjs",
      "scripts-dev/capture-doc-screenshots.cjs",
      "scripts-dev/README.md",
      "styles/docs.css",
      "package.json"
    ]
  },

  "c2p:map": {
    description: "Repository map: folder descriptions, maintainer/docs guides, top-level metadata, and export rules.",
    outputPrefix: "C2P-map",
    include: [
      "**/FOLDER-*.md",
      "README.md",
      "CONTRIBUTING.md",
      "scripts-dev/README.md",
      "docs-src/README.md",
      "translations/README.md",
      "docs/assets/screenshots/README.md",
      "docs/assets/screenshots/manifest.json",
      "scripts-dev/code2prompt.js",
      ".gitignore",
      "package.json",
      "jsdoc.clean.json",
      "manifest.webmanifest",
      "ghostyles.json"
    ],
    exclude: [
      ...COMMON_SAFETY_EXCLUDES,
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      ...VENDOR_RUNTIME_EXCLUDES,
      ...GENERATED_DOCS_EXCLUDES
    ],
    required: [
      "scripts-dev/FOLDER-DESCRIPTION.md",
      "scripts-dev/README.md",
      "docs-src/README.md",
      "scripts-dev/code2prompt.js",
      ".gitignore",
      "package.json"
    ]
  },

  "c2p:full": {
    description: "Broad filtered source snapshot for cross-namespace issues; not a backup or deployable package.",
    outputPrefix: "CODE2PROMPT",
    include: [
      "*.html", "*.css", "*.js", "*.cjs", "*.mjs", "*.json", "*.md", "*.d.ts", "*.xml", "*.py", "*.sh", "*.yml", "*.yaml",
      "**/*.html", "**/*.css", "**/*.js", "**/*.cjs", "**/*.mjs", "**/*.json", "**/*.md", "**/*.d.ts", "**/*.xml", "**/*.py", "**/*.sh", "**/*.yml", "**/*.yaml",
      ".gitignore",
      "data/FOLDER-*.md",
      "data/camera-facts.json",
      "docs/assets/screenshots/manifest.json",
      "docs/assets/screenshots/README.md",
      "translations/FOLDER-*.md",
      "translations/README.md"
    ],
    exclude: [
      ...COMMON_SAFETY_EXCLUDES,
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      ...VENDOR_RUNTIME_EXCLUDES,
      ...GENERATED_DOCS_EXCLUDES,
      "tests/**/*.js",
      "tests/**/*.cjs",
      "tests/**/*.mjs",
      "lab-js/i18n.js",
      "scripts-dev/extract-i18n-pot.cjs",
      "data/face_canonical_uv.json",
      "translations/*.csv",
      "translations/*.pot",
      "references/index.html",
      "references/*.js",
      "references/*.txt"
    ],
    required: ["package.json", "scripts-dev/code2prompt.js", "docs-src/README.md"]
  }
};

function printHelp() {
  console.log("Usage:");
  console.log("  node scripts-dev/code2prompt.js <namespace> [options]");
  console.log("  npm run c2p -- <namespace> [options]");
  console.log("");
  console.log("Options:");
  console.log("  --output, -o <file>    Override the dated output filename");
  console.log("  --manifest <file>      Override the adjacent JSON manifest filename");
  console.log("  --include-ignored      Include gitignored files that match the allowlist");
  console.log("  --dry-run              Validate and print the selection without writing files");
  console.log("  --help, -h             Show this help");
  console.log("");
  console.log("Namespaces:");
  for (const name of Object.keys(NAMESPACES)) {
    console.log(`  ${name.padEnd(14)} ${NAMESPACES[name].description}`);
  }
  console.log("");
  console.log("Examples:");
  console.log("  npm run c2p -- c2p:lab");
  console.log("  npm run c2p -- c2p:docs --dry-run");
  console.log("  npm run c2p -- c2p:app --output C2P-app-review.txt");
  console.log("");
  console.log("Notes:");
  console.log("  - Namespace arrays in this file are the source of truth.");
  console.log("  - Generated docs and binary media stay out of text bundles.");
  console.log("  - Successful exports write a manifest with hashes and Git provenance.");
  console.log("  - A Code2Prompt export is not a backup or deployable archive.");
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return { help: true };

  let namespace = null;
  let output = null;
  let manifest = null;
  let includeIgnored = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--output" || arg === "-o" || arg === "--manifest") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) return { invalid: true, error: `${arg} requires a filename` };
      if (arg === "--manifest") manifest = value;
      else output = value;
      i += 1;
      continue;
    }
    if (arg === "--include-ignored" || arg === "--no-ignore") {
      includeIgnored = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!namespace && !arg.startsWith("-")) {
      namespace = arg;
      continue;
    }
    return { invalid: true, error: `Unknown argument: ${arg}` };
  }

  return { namespace, output, manifest, includeIgnored, dryRun, help: false, invalid: false };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(glob) {
  const normalized = glob.replace(/\\/g, "/");
  let regexBody = "";
  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === "*" && next === "*") {
      regexBody += ".*";
      i += 2;
    } else if (ch === "*") {
      regexBody += "[^/]*";
      i += 1;
    } else if (ch === "?") {
      regexBody += "[^/]";
      i += 1;
    } else {
      regexBody += escapeRegex(ch);
      i += 1;
    }
  }
  return new RegExp(`^${regexBody}$`);
}

function normalizeRelative(value) {
  return value.split(path.sep).join("/").replace(/^\.\//, "");
}

function walkWorkspaceFiles(rootDir) {
  const results = [];
  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = normalizeRelative(path.relative(rootDir, fullPath));
      if (!relPath || relPath === ".git" || relPath.startsWith(".git/")) continue;
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) results.push(relPath);
    }
  }
  walk(rootDir);
  return results.sort();
}

function gitListedFiles(rootDir) {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (result.error || result.status !== 0) return null;
  return [...new Set(result.stdout.split("\0").filter(Boolean).map(normalizeRelative).filter((relPath) => {
    try {
      return fs.statSync(path.join(rootDir, relPath)).isFile();
    } catch {
      return false;
    }
  }))].sort();
}

function listWorkspaceFiles(rootDir, includeIgnored) {
  if (!includeIgnored) {
    const files = gitListedFiles(rootDir);
    if (files) return { files, inventoryMethod: "git-ls-files" };
  }
  return {
    files: walkWorkspaceFiles(rootDir),
    inventoryMethod: includeIgnored ? "filesystem-with-ignored" : "filesystem-fallback"
  };
}

function unique(values) {
  return [...new Set(values)];
}

function pathInsideRoot(rootDir, candidate) {
  const absolute = path.resolve(rootDir, candidate);
  const relative = path.relative(rootDir, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return normalizeRelative(relative);
}

function computeSelection(rootDir, include, exclude, includeIgnored) {
  const inventory = listWorkspaceFiles(rootDir, includeIgnored);
  const includeRegexes = include.map((pattern) => ({ pattern, regex: globToRegex(pattern) }));
  const excludeRegexes = exclude.map(globToRegex);
  const files = inventory.files.filter((file) =>
    includeRegexes.some(({ regex }) => regex.test(file)) &&
    !excludeRegexes.some((regex) => regex.test(file))
  );
  return {
    files,
    includePatternMatches: includeRegexes.map(({ pattern, regex }) => ({
      pattern,
      count: files.filter((file) => regex.test(file)).length
    })),
    inventoryMethod: inventory.inventoryMethod
  };
}

function validateRequiredFiles(rootDir, required) {
  return required.filter((relativePath) => {
    try {
      return !fs.statSync(path.join(rootDir, relativePath)).isFile();
    } catch {
      return true;
    }
  });
}

function toTree(paths) {
  const root = {};
  for (const relPath of paths) {
    let cursor = root;
    for (const part of relPath.split("/")) {
      if (!cursor[part]) cursor[part] = {};
      cursor = cursor[part];
    }
  }
  const lines = [];
  function walk(node, prefix) {
    const names = Object.keys(node).sort();
    names.forEach((name, index) => {
      const isLast = index === names.length - 1;
      lines.push(`${prefix}${isLast ? "└── " : "├── "}${name}`);
      walk(node[name], `${prefix}${isLast ? "    " : "│   "}`);
    });
  }
  walk(root, "");
  return lines.join("\n");
}

function manifestPathFor(outputPath) {
  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}.manifest.json`);
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function fileMetadata(rootDir, relativePath) {
  const absolute = path.join(rootDir, relativePath);
  return { path: relativePath, bytes: fs.statSync(absolute).size, sha256: sha256File(absolute) };
}

function gitValue(rootDir, args) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
  return result.error || result.status !== 0 ? null : result.stdout.trim();
}

function gitProvenance(rootDir) {
  const commit = gitValue(rootDir, ["rev-parse", "HEAD"]);
  if (!commit) return { available: false };
  const status = gitValue(rootDir, ["status", "--porcelain"]);
  return {
    available: true,
    commit,
    shortCommit: gitValue(rootDir, ["rev-parse", "--short", "HEAD"]),
    branch: gitValue(rootDir, ["branch", "--show-current"]),
    dirty: status === null ? null : status.length > 0
  };
}

function detectOutputFiles(outputPath) {
  const source = fs.readFileSync(outputPath, "utf8");
  const files = [];
  const marker = /^`([^`\r\n]+)`:\s*$/gm;
  let match;
  while ((match = marker.exec(source)) !== null) files.push(normalizeRelative(match[1]));
  return unique(files).sort();
}

function describeOutputPath(rootDir, candidate) {
  return pathInsideRoot(rootDir, candidate) || path.resolve(rootDir, candidate);
}

function printPlan({ namespace, cfg, outputPath, manifestPath, exclude, selection, includeIgnored }) {
  console.log(`[c2p] Namespace: ${namespace}`);
  console.log(`[c2p] Output: ${outputPath}`);
  console.log(`[c2p] Manifest: ${manifestPath}`);
  console.log(`[c2p] Gitignored files: ${includeIgnored ? "eligible when explicitly included" : "excluded"}`);
  console.log(`[c2p] Inventory: ${selection.inventoryMethod}`);
  console.log("[c2p] Include globs:");
  cfg.include.forEach((pattern) => console.log(`  - ${pattern}`));
  console.log("[c2p] Exclude globs:");
  exclude.forEach((pattern) => console.log(`  - ${pattern}`));
  console.log(`[c2p] Included files count: ${selection.files.length}`);
  console.log("[c2p] Included files tree:");
  console.log(selection.files.length ? toTree(selection.files) : "  (no matched files)");
}

function runCode2prompt({ include, exclude, outputPath, includeIgnored }) {
  const args = [
    ".",
    "--include", include.join(","),
    "--exclude", exclude.join(","),
    "--sort", "name_asc",
    "--output-format", "markdown",
    "-O", outputPath
  ];
  if (includeIgnored) args.splice(1, 0, "--no-ignore");
  console.log("[c2p] Command:");
  console.log(`  code2prompt ${args.join(" ")}`);
  fs.mkdirSync(path.dirname(path.resolve(process.cwd(), outputPath)), { recursive: true });
  const result = spawnSync("code2prompt", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (typeof result.status === "number" && result.status !== 0) {
    const error = new Error(`code2prompt exited with status ${result.status}`);
    error.exitStatus = result.status;
    throw error;
  }
}

function writeManifest({ rootDir, namespace, cfg, exclude, outputPath, manifestPath, selection, includeIgnored }) {
  const absoluteOutput = path.resolve(rootDir, outputPath);
  const absoluteManifest = path.resolve(rootDir, manifestPath);
  const detectedFiles = detectOutputFiles(absoluteOutput);
  const expectedSet = new Set(selection.files);
  const detectedSet = new Set(detectedFiles);
  const parserRecognisedOutput = detectedFiles.length > 0 || selection.files.length === 0;
  const missingFromOutput = parserRecognisedOutput ? selection.files.filter((file) => !detectedSet.has(file)) : [];
  const unexpectedInOutput = parserRecognisedOutput ? detectedFiles.filter((file) => !expectedSet.has(file)) : [];
  const warnings = [];
  if (selection.inventoryMethod === "filesystem-fallback") {
    warnings.push("Git inventory was unavailable; the preflight tree could not enforce .gitignore.");
  }
  if (!parserRecognisedOutput) {
    warnings.push("Generated Markdown file markers were not recognised; output selection could not be compared with preflight.");
  }
  if (missingFromOutput.length || unexpectedInOutput.length) {
    warnings.push("Generated output selection differs from the wrapper preflight inventory.");
  }
  const outputStat = fs.statSync(absoluteOutput);
  const manifest = {
    schemaVersion: 1,
    generator: "scripts-dev/code2prompt.js",
    generatedAt: new Date().toISOString(),
    namespace,
    description: cfg.description,
    includeIgnored,
    inventoryMethod: selection.inventoryMethod,
    git: gitProvenance(rootDir),
    output: {
      path: describeOutputPath(rootDir, outputPath),
      bytes: outputStat.size,
      sha256: sha256File(absoluteOutput)
    },
    manifestPath: describeOutputPath(rootDir, manifestPath),
    requiredFiles: cfg.required,
    includePatterns: selection.includePatternMatches,
    excludePatterns: exclude,
    expectedFileCount: selection.files.length,
    detectedOutputFileCount: parserRecognisedOutput ? detectedFiles.length : null,
    selectionMatchesInventory: parserRecognisedOutput ? missingFromOutput.length === 0 && unexpectedInOutput.length === 0 : null,
    missingFromOutput,
    unexpectedInOutput,
    files: selection.files.map((relativePath) => fileMetadata(rootDir, relativePath)),
    warnings
  };
  fs.mkdirSync(path.dirname(absoluteManifest), { recursive: true });
  fs.writeFileSync(absoluteManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }
  if (parsed.invalid || !parsed.namespace) {
    if (parsed.error) console.error(parsed.error);
    printHelp();
    process.exit(1);
  }

  const namespace = parsed.namespace;
  const cfg = NAMESPACES[namespace];
  if (!cfg) {
    console.error(`Unknown namespace: ${namespace}`);
    printHelp();
    process.exit(1);
  }

  const rootDir = process.cwd();
  const outputPath = parsed.output || `${cfg.outputPrefix}-${DATE}.txt`;
  const manifestPath = parsed.manifest || manifestPathFor(outputPath);
  const dynamicExcludes = [pathInsideRoot(rootDir, outputPath), pathInsideRoot(rootDir, manifestPath)].filter(Boolean);
  const exclude = unique([...cfg.exclude, ...dynamicExcludes]);

  const missingRequired = validateRequiredFiles(rootDir, cfg.required);
  if (missingRequired.length) {
    console.error(`[c2p] Cannot export ${namespace}; required files are missing:`);
    missingRequired.forEach((file) => console.error(`  - ${file}`));
    process.exit(1);
  }

  const selection = computeSelection(rootDir, cfg.include, exclude, parsed.includeIgnored);
  printPlan({ namespace, cfg, outputPath, manifestPath, exclude, selection, includeIgnored: parsed.includeIgnored });
  if (selection.files.length === 0) {
    console.error(`[c2p] No files matched ${namespace}; refusing to write an empty export.`);
    process.exit(1);
  }
  if (parsed.dryRun) {
    console.log("[c2p] Dry run complete; no export or manifest was written.");
    return;
  }

  try {
    runCode2prompt({ include: cfg.include, exclude, outputPath, includeIgnored: parsed.includeIgnored });
    const manifest = writeManifest({
      rootDir, namespace, cfg, exclude, outputPath, manifestPath, selection, includeIgnored: parsed.includeIgnored
    });
    console.log(`[c2p] Generated ${outputPath} using ${namespace}`);
    console.log(`[c2p] Wrote ${manifestPath}`);
    for (const warning of manifest.warnings) console.warn(`[c2p] Warning: ${warning}`);
  } catch (error) {
    console.error("[c2p] Failed to execute code2prompt:");
    console.error(error && error.message ? error.message : error);
    if (error && error.code === "ENOENT") console.error("Install code2prompt first, then retry.");
    process.exit(error && error.exitStatus ? error.exitStatus : 1);
  }
}

main();
