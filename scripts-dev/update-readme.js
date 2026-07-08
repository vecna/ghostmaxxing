#!/usr/bin/env node
/**
 * Auto‑update README on CI.
 *
 * What it does:
 *  - Inserts/upserts a coverage badge (taken from the latest Vitest run).
 *  - Inserts a “Last commit” line with short SHA and message.
 *  - Optionally injects a small changelog of the last N commits.
 *
 * The script is pure‑JS so it runs both on GitHub Actions and locally.
 */

const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

// ---------- Config ----------
const README_PATH = path.resolve(__dirname, '..', 'README.md');
const COVERAGE_BADGE_URL = (() => {
  const cov = getCoverage();
  if (cov != null) {
    const pct = Number(cov).toFixed(2);
    const color = cov >= 80 ? 'green' : cov >= 50 ? 'yellow' : 'red';
    return `https://img.shields.io/badge/coverage-${pct}%25-${color}`;
  }
  return 'https://img.shields.io/badge/coverage-UNKNOWN-lightgrey';
})();
const CHANGELOG_COMMITS = 5; // how many recent commits to list
const COVERAGE_BADGE_START = '<!-- coverage-badge:start -->';
const COVERAGE_BADGE_END = '<!-- coverage-badge:end -->';

// ---------------------------
// Helper to compute coverage percentage from the JSON report produced by Vitest.
function getCoverage() {
  const coverageRoot = path.resolve(__dirname, '..', 'coverage');
  const jsonPath = path.join(coverageRoot, 'coverage-final.json');

  // If the JSON report does not exist, fall back to null.
  if (!fs.existsSync(jsonPath)) return null;

  // The JSON format contains an object keyed by file paths.
  // Each file entry has a `statementMap` (all statements) and an `f` map
  // of execution counts.  The sum of the statementMap entries is the total
  // number of statements, and the sum of the `f` values is the number of
  // statements actually executed.
  const raw = fs.readFileSync(jsonPath, 'utf8');
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    // If parsing fails we cannot determine coverage.
    return null;
  }

  let total = 0;
  let covered = 0;

  for (const file of Object.values(report)) {
    // `statementMap` contains every statement in the file.
    const statements = file.statementMap ? Object.keys(file.statementMap).length : 0;
    total += statements;

    // `s` maps statement IDs to execution counts.
    if (file.s) {
      for (const count of Object.values(file.s)) {
        if (count > 0) covered += 1;
      }
    }
  }

  if (!total) return null;
  return (covered / total) * 100;
}

// Helper to run a git command and get trimmed stdout
const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();

// ------------------------------------------------------------------
// 1️⃣  Gather data
// ------------------------------------------------------------------
const latestCommitSha = git('rev-parse --short HEAD');
const latestCommitMsg = git('log -1 --pretty=%s');
const recentCommits = git(`log -${CHANGELOG_COMMITS} --pretty=%h:%s`).split('\n');

// ------------------------------------------------------------------
// 2️⃣  Read current README
// ------------------------------------------------------------------
let readme = fs.readFileSync(README_PATH, 'utf8');

// ------------------------------------------------------------------
// 3️⃣  Replace/Insert the badge line (just after the title)
// ------------------------------------------------------------------
const coverageBadgeBlock = [
  COVERAGE_BADGE_START,
  `[![Unit Test Coverage](${COVERAGE_BADGE_URL})](coverage/)`,
  COVERAGE_BADGE_END,
].join('\n');

// Ensure there is exactly one coverage badge block by removing any old block
// or legacy standalone badges first.
readme = readme.replace(
  /<!-- coverage-badge:start -->[\s\S]*?<!-- coverage-badge:end -->\n?/m,
  ''
);
readme = readme.replace(/^\s*\[!\[Unit Test Coverage\]\([^)]+\)\]\(coverage\/\)\s*\n?/gm, '');
readme = readme.replace(/^\s*\!\[Unit Test Coverage\]\([^)]+\)\s*\n?/gm, '');

// Re-insert a single badge right after the first heading.
if (/^#{1,6}\s+.*$/m.test(readme)) {
  readme = readme.replace(
    /^#{1,6}\s+.*$/m,
    (heading) => `${heading}\n${coverageBadgeBlock}`
  );
} else {
  // Fallback for malformed README files without headings.
  readme = `${coverageBadgeBlock}\n\n${readme}`;
}

// ------------------------------------------------------------------
// 4️⃣  Insert a “Last commit” line
// ------------------------------------------------------------------
const lastCommitLine = `\n**Last commit:** \`${latestCommitSha}\` – ${latestCommitMsg}\n`;
if (!readme.includes('**Last commit:**')) {
  // Append at the end of file if not present
  readme += lastCommitLine;
} else {
  // Replace the existing line
  readme = readme.replace(
    /\*\*Last commit:\*\* .*\n/,
    `${lastCommitLine}\n`
  );
}

// ------------------------------------------------------------------
// 5️⃣  Optional tiny changelog section
// ------------------------------------------------------------------
const changelogHeader = '\n## Recent changes\n';
let changelog = recentCommits
  .map((c) => {
    const [sha, msg] = c.split(':');
    return `- \`${sha}\` ${msg}`;
  })
  .join('\n');

if (!readme.includes('## Recent changes')) {
  readme += `${changelogHeader}${changelog}\n`;
} else {
  // Replace old block (simple regex, good enough for a small README)
  readme = readme.replace(
    /## Recent changes[\s\S]*?(?=\n##|$)/,
    `${changelogHeader}${changelog}`
  );
}

// ------------------------------------------------------------------
// 6️⃣  Write back
// ------------------------------------------------------------------
fs.writeFileSync(README_PATH, readme, 'utf8');
console.log('✅ README updated');
