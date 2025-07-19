# Change Log

All notable changes to the "rust-state-machine-tutorial" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.1.3] - 2025-05-12

- Moved Next/Back buttons in the webview panel to the left side for consistent positioning.
- Simplified Gitorial opening process, requiring only a single click after selection or cloning.

## [0.1.4] - 2025-05-26

- Refactor the codebase
- Add Sync handling

## [0.1.5] - 2025-05-27

- Fix Next Button not being disabled when on the last step
- Fix reset of untracked files on git checkout

## [0.1.6] - 2025-05-27

- Fix Gitorial branch setup when user is on a commit that belongs to the gitorial branch
- Fix diff view compares users code with the solution code instead of the previous step

## [0.1.7] - 2025-05-27

- Fix focus of the last active tutorial file when toggling the solution

## [0.1.8] - 2025-06-06

- Fix Gitorial branch setup when user is on a commit that belongs to the gitorial branch and has not fetched the remote branch

## [0.1.9] - 2025-07-07

- Feature diff view scans changed files for 'educational content' keywords and filters out noise files
- Fix focus of the last active tutorial file when toggling the solution

## [0.2.0] - 2025-07-12

- Cloning defaults to first commit
- Fix navigation while showing solution, hides the solution

## [0.2.1] - 2025-07-19

- Fix opening projects with incorrect stored tutorial ID and fallback to step 1
- Introduce eslint formatting
- refactor webview svelte to use purly rune syntax
- CI workflow to release to GitHub releases