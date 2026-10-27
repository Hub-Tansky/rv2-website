# 0001: The website lives in its own repository, rv2-website

- Status: Accepted
- Date: 2026-10-27
- Affects: this repository, `.github/workflows/pages.yml`, `tests/website/site.test.mjs`, Hub-Tansky/RoboViolence2 (website removed there); amends ADR 0029 and 0035

## Context
- Owner request 2026-10-23 (project thread "Website move to rv2-website"): every file that builds roboviolence.com moves out of the game repository, and the website needs only a Pages deploy, not the game's three-OS CI.
- GitHub Free serves Pages only from public repositories and the hosting cap is EUR 10 a month (ADR 0029), so this repository is public (owner, 2026-10-23).
- The website tests check `site.js` against the release file names in the game's `.github/workflows/build.yml`, which stays in the game repository.

## Decision
`website/`, `tools/website-markdown.mjs`, `tests/website/`, `pages.yml` and ADRs 0029 and 0035 moved here with their git history (`git filter-repo`; PR references in old messages rewritten to `Hub-Tansky/RoboViolence2#N`). `pages.yml` runs the tests on every PR and push, deploys `website/` from `main`, and runs daily; the tests fetch `build.yml` from the game repository's `main` (or read `RV2_BUILD_YML` offline).

## Consequences
- A release file rename in the game repository turns this repository's daily run red within a day, instead of failing the game PR. Rename the asset suffixes in `site.js` and the names in `install.html` in the same window.
- ADR numbers: 0029 and 0035 keep their game repository numbers; new website ADRs count from 0001 here. Cite the other repository's ADRs as "RoboViolence2 ADR NNNN".
- The Discord release post (RoboViolence2 ADR 0032, `packaging/discord_release_post.py`) stays in the game repository: it runs in the release job and links `install.html` here.
- The privacy policy's history link points at this repository; the imported history keeps its earlier versions.
- Rejected: a git submodule in the game repository (two repositories to update for every page edit); a GitHub API call for the newest release's asset names (would only notice a rename after it was published).
