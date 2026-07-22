# GitHub Actions Setup

This repository can use GitHub Actions to do two separate jobs:

1. Run unit tests and Playwright end-to-end tests on every pull request to `main` and every push to `main`.
2. Refresh the README coverage badge after successful pushes to `main`.

The workflow file is:

```text
.github/workflows/ci.yml
```

## What the workflow does

The workflow is named `CI` and has two jobs.

### 1. `Test`

This job runs on:

- every pull request targeting `main`
- every push to `main`

It does the following:

1. checks out the repository
2. installs Node.js 20
3. runs `npm ci`
4. installs Playwright Chromium and its Linux dependencies
5. runs `npm run test:coverage`
6. runs `npm run test:e2e`

If this job fails, GitHub shows the failure directly in the pull request checks.

### 2. `Update Coverage Badge`

This job runs only when:

- the event is a push to `main`
- the `Test` job already passed

It does the following:

1. runs unit coverage again to produce `coverage/coverage-final.json`
2. runs `npm run update:coverage-badge`
3. commits the updated README badge if the badge changed

The commit message contains `[skip ci]` so the bot commit does not trigger the workflow again.

## Files involved

### Workflow

```text
.github/workflows/ci.yml
```

### Coverage badge updater

```text
scripts-dev/update-coverage-badge.js
```

This script updates only the coverage badge block in `README.md`.

The older all-in-one README updater is no longer part of the repository workflow,
because commit/changelog rewriting created noisy automation output and did not
help branch protection or test visibility.

## What you must do in GitHub

The workflow file alone is not enough to block merges. You must also enable branch protection for `main`.

### A. Push the workflow to GitHub

Commit and push these files:

```text
.github/workflows/ci.yml
scripts-dev/update-coverage-badge.js
tutorials/github-actions.md
```

You will usually also push the README change that adds the CI badge:

```text
README.md
```

### B. Local equivalents

These are the same commands the workflow uses:

```bash
npm ci
npm run test:coverage
npm run test:e2e
npm run update:coverage-badge
```

## Notes

- The workflow updates the coverage badge only after code is already on `main`.
- The merge gate is provided by the pull request test run plus branch protection.
- If you want the badge update to happen in a separate maintenance branch instead of committing directly to `main`, the workflow should be changed to open a pull request instead of pushing.