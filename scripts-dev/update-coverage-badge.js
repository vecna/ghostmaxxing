#!/usr/bin/env node
/**
 * Updates only the README coverage badge block from the latest Vitest coverage report.
 * This is intentionally narrower than scripts-dev/update-readme.js so CI can refresh
 * the badge without rewriting commit metadata or changelog sections.
 */

const fs = require('fs');
const path = require('path');

const README_PATH = path.resolve(__dirname, '..', 'README.md');
const COVERAGE_JSON_PATH = path.resolve(__dirname, '..', 'coverage', 'coverage-final.json');
const COVERAGE_BADGE_START = '<!-- coverage-badge:start -->';
const COVERAGE_BADGE_END = '<!-- coverage-badge:end -->';

/**
 * Computes statement coverage percentage from Vitest's coverage-final.json report.
 *
 * @returns {number|null} Percentage from 0 to 100, or null when the report is unavailable.
 */
function getCoverage() {
  if (!fs.existsSync(COVERAGE_JSON_PATH)) return null;

  let report;
  try {
    report = JSON.parse(fs.readFileSync(COVERAGE_JSON_PATH, 'utf8'));
  } catch {
    return null;
  }

  let total = 0;
  let covered = 0;

  for (const file of Object.values(report)) {
    total += file.statementMap ? Object.keys(file.statementMap).length : 0;
    if (!file.s) continue;
    for (const count of Object.values(file.s)) {
      if (count > 0) covered += 1;
    }
  }

  if (!total) return null;
  return (covered / total) * 100;
}

/**
 * Builds a shields.io coverage badge URL from the computed percentage.
 *
 * @param {number|null} coverage Coverage percentage.
 * @returns {string} Badge image URL.
 */
function getCoverageBadgeUrl(coverage) {
  if (coverage == null) return 'https://img.shields.io/badge/coverage-UNKNOWN-lightgrey';
  const pct = Number(coverage).toFixed(2);
  const color = coverage >= 80 ? 'green' : coverage >= 50 ? 'yellow' : 'red';
  return `https://img.shields.io/badge/coverage-${pct}%25-${color}`;
}

/**
 * Upserts the README coverage badge block immediately after the first heading.
 *
 * @param {string} readme README content.
 * @param {string} coverageBadgeBlock Replacement badge block.
 * @returns {string} Updated README content.
 */
function upsertCoverageBadge(readme, coverageBadgeBlock) {
  let next = readme.replace(
    /<!-- coverage-badge:start -->[\s\S]*?<!-- coverage-badge:end -->\n?/m,
    ''
  );
  next = next.replace(/^\s*\[!\[Unit Test Coverage\]\([^)]+\)\]\(coverage\/\)\s*\n?/gm, '');
  next = next.replace(/^\s*!\[Unit Test Coverage\]\([^)]+\)\s*\n?/gm, '');

  if (/^#{1,6}\s+.*$/m.test(next)) {
    return next.replace(/^#{1,6}\s+.*$/m, (heading) => `${heading}\n${coverageBadgeBlock}`);
  }

  return `${coverageBadgeBlock}\n\n${next}`;
}

const coverage = getCoverage();
const badgeUrl = getCoverageBadgeUrl(coverage);
const coverageBadgeBlock = [
  COVERAGE_BADGE_START,
  `[![Unit Test Coverage](${badgeUrl})](coverage/)`,
  COVERAGE_BADGE_END,
].join('\n');

const readme = fs.readFileSync(README_PATH, 'utf8');
const nextReadme = upsertCoverageBadge(readme, coverageBadgeBlock);

fs.writeFileSync(README_PATH, nextReadme, 'utf8');
console.log('README coverage badge updated');