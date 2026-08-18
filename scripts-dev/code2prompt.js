#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DATE = new Date().toISOString().slice(0, 10);

const COMMON_NOISE_EXCLUDES = [
  "node_modules/**",
  "package-lock.json",
  "C2P-*.txt",
  ".DS_Store",
  "**/.DS_Store",
  "docs/**",
  "codemap/**",
  "coverage/**",
  "playwright-report/**",
  "test-results/**"
];

const COMMON_BINARY_EXCLUDES = [
  "lab-js/vendor/**",
  "styles/vendor/**/*.woff2",
  "images/**/*.png",
  "images/**/*.jpg",
  "images/**/*.jpeg",
  "images/**/*.webp",
  "images/**/*.ico"
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
      "manifest.webmanifest"
    ],
    exclude: [
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      "lab-js/**",
      "tests/**",
      "translations/**",
      "data/**",
      "references/index.html",
      "references/*.js",
      "styles/vendor/**/*.css"
    ]
  },
  "c2p:lab": {
    description: "Runtime engine work: MediaPipe, render loop, state, storage, plugins.",
    outputPrefix: "C2P-lab",
    include: [
      "lab-js/*.js",
      "lab-js/vendor/*.js",
      "lab.html",
      "loader.html",
      "realtime.html",
      "ghostyle-transfer.html",
      "ghostyles/*.js",
      "ghostyles.json",
      "*.d.ts",
      "package.json"
    ],
    exclude: [
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      "styles/**",
      "images/**",
      "tutorials/**",
      "tests/**"
    ]
  },
  "c2p:lab-test": {
    description: "Lab code plus test files for unit-test authoring and coverage fixes.",
    outputPrefix: "C2P-lab-test",
    include: [
      "lab-js/**.js",
      "tests/**/*.js",
      "vitest.config.js",
      "playwright.config.js",
      "package.json",
    ],
    exclude: [
      ...COMMON_NOISE_EXCLUDES,
      ...COMMON_BINARY_EXCLUDES,
      "tests/**/*.jpg",
      "tests/**/*.mjpeg",
      "tests/**/*.png",
      "tests/fixtures/**"
    ]
  },
  "c2p:copy": {
    description: "Copywriting text + USE ALSO `node scripts-dev/extract-text-only.js`",
    outputPrefix: "C2P-copy",
    include: [
    	"tutorials/brand-voice.md",
    	"tutorials/visual-direction.md",
    	"translations/*.csv",
    	"translations/README.md",
    	"data/camera-facts.json"
    ],
    exclude: [...COMMON_NOISE_EXCLUDES, "visual-styleguide.html"]
  },
  "c2p:map": {
    description: "Repository map only: folder descriptions, README, top-level metadata.",
    outputPrefix: "C2P-map",
    include: [
      "**/FOLDER-*.md",
      "README.md",
      "CONTRIBUTING.md",
      "package.json",
      "jsdoc.clean.json",
      "manifest.webmanifest",
      "ghostyles.json"
    ],
    exclude: [...COMMON_NOISE_EXCLUDES]
  },
  "c2p:full": {
    description: "Full snapshot safety net when the issue crosses boundaries.",
    outputPrefix: "CODE2PROMPT",
    include: [
      "*.html",
      "*.css",
      "*.js",
      "*.cjs",
      "*.json",
      "*.md",
      "*.d.ts",
      "*.xml",
      "**/*.html",
      "**/*.css",
      "**/*.js",
      "**/*.cjs",
      "**/*.json",
      "**/*.md",
      "**/*.d.ts",
      "**/*.xml",
      "coverage/FOLDER-*.md",
      "data/FOLDER-*.md",
      "docs/FOLDER-*.md",
      "playwright-report/FOLDER-*.md",
      "test-results/FOLDER-*.md",
      "translations/FOLDER-*.md"
    ],
    exclude: [
      "node_modules/**",
      "package-lock.json",
      "CODE2PROMPT*.txt",
      ".DS_Store",
      "**/.DS_Store",
      "tests/**/*.js",
      "tests/**/*.jpg",
      "tests/**/*.mjpeg",
      "lab-js/i18n.js",
      "scripts-dev/extract-i18n-pot.cjs",
      "lab-js/vendor/README.md",
      "lab-js/vendor/**/*.js",
      "lab-js/vendor/**/*.json",
      "lab-js/vendor/**/*.wasm",
      "lab-js/vendor/**/*.task",
      "lab-js/vendor/**/*.tflite",
      "lab-js/vendor/**/*-shard*",
      "lab-js/vendor/*.sh",
      "styles/vendor/README.md",
      "styles/vendor/**/*.css",
      "styles/vendor/**/*.woff2",
      "docs/**",
      "codemap/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "images/**/*.png",
      "images/**/*.jpg",
      "images/**/*.jpeg",
      "images/**/*.webp",
      "images/**/*.ico",
      "data/**",
      "translations/**",
      "references/index.html",
      "references/*.js",
      "references/*.txt"
    ]
  }
};

function printHelp() {
  const names = Object.keys(NAMESPACES);
  console.log("Usage:");
  console.log("  node scripts-dev/code2prompt.js <namespace> [--output <file>]");
  console.log("  npm run c2p -- <namespace> [--output <file>]");
  console.log("");
  console.log("Namespaces:");
  for (const name of names) {
    console.log(`  ${name.padEnd(12)} ${NAMESPACES[name].description}`);
  }
  console.log("");
  console.log("Examples:");
  console.log("  npm run c2p -- c2p:lab");
  console.log("  npm run c2p -- c2p:design --output C2P-custom.txt");
  console.log("");
  console.log("Notes:");
  console.log("  - Namespace patterns are sourced from code2prompt-commands.md.");
  console.log("  - Include/exclude rules are stored in arrays in this script for easier maintenance.");
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  let namespace = null;
  let output = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--output" || arg === "-o") {
      output = args[i + 1] || null;
      i += 1;
      continue;
    }
    if (!namespace && !arg.startsWith("-")) {
      namespace = arg;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    return { invalid: true };
  }

  return { namespace, output, help: false, invalid: false };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      continue;
    }
    if (ch === "*") {
      regexBody += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      regexBody += "[^/]";
      i += 1;
      continue;
    }
    regexBody += escapeRegex(ch);
    i += 1;
  }

  return new RegExp(`^${regexBody}$`);
}

function listWorkspaceFiles(rootDir) {
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath).split(path.sep).join("/");
      if (!relPath || relPath.startsWith(".git/")) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        results.push(relPath);
      }
    }
  }

  walk(rootDir);
  return results.sort();
}

function computeIncludedFiles(include, exclude) {
  const rootDir = process.cwd();
  const files = listWorkspaceFiles(rootDir);
  const includeRegexes = include.map(globToRegex);
  const excludeRegexes = exclude.map(globToRegex);

  return files.filter((file) => {
    const matchedInclude = includeRegexes.some((re) => re.test(file));
    if (!matchedInclude) {
      return false;
    }
    const matchedExclude = excludeRegexes.some((re) => re.test(file));
    return !matchedExclude;
  });
}

function toTree(paths) {
  const root = {};
  for (const relPath of paths) {
    const parts = relPath.split("/");
    let cursor = root;
    for (const part of parts) {
      if (!cursor[part]) {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }
  }

  const lines = [];

  function walk(node, prefix) {
    const names = Object.keys(node).sort();
    names.forEach((name, index) => {
      const isLast = index === names.length - 1;
      const branch = isLast ? "└── " : "├── ";
      lines.push(`${prefix}${branch}${name}`);
      const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
      walk(node[name], childPrefix);
    });
  }

  walk(root, "");
  return lines.join("\n");
}

function runCode2prompt(include, exclude, outputPath, namespace) {
  const args = [
    ".",
    "--no-ignore",
    "--include",
    include.join(","),
    "--exclude",
    exclude.join(","),
    "--sort",
    "name_asc",
    "--output-format",
    "markdown",
    "-O",
    outputPath
  ];

  const includedFiles = computeIncludedFiles(include, exclude);

  console.log(`[c2p] Namespace: ${namespace}`);
  console.log(`[c2p] Output: ${outputPath}`);
  console.log("[c2p] Include globs:");
  include.forEach((pattern) => console.log(`  - ${pattern}`));
  console.log("[c2p] Exclude globs:");
  exclude.forEach((pattern) => console.log(`  - ${pattern}`));
  console.log(`[c2p] Included files count: ${includedFiles.length}`);
  console.log("[c2p] Included files tree:");
  console.log(includedFiles.length ? toTree(includedFiles) : "  (no matched files)");
  console.log("[c2p] Command:");
  console.log(`  code2prompt ${args.join(" ")}`);

  const result = spawnSync("code2prompt", args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }
  if (parsed.invalid || !parsed.namespace) {
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

  const defaultOutput = cfg.outputPrefix === "CODE2PROMPT"
    ? `${cfg.outputPrefix}-${DATE}.txt`
    : `${cfg.outputPrefix}-${DATE}.txt`;
  const outputPath = parsed.output || defaultOutput;

  try {
    runCode2prompt(cfg.include, cfg.exclude, outputPath, namespace);
    console.log(`Generated ${outputPath} using ${namespace}`);
  } catch (err) {
    console.error("Failed to execute code2prompt:");
    console.error(err && err.message ? err.message : err);
    console.error("Install code2prompt first, then retry.");
    process.exit(1);
  }
}

main();
