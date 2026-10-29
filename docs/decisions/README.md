# Architecture decision records

One file per non-obvious website decision: `NNNN-kebab-title.md`. ADRs 0029 and 0035 came from [Hub-Tansky/RoboViolence2](https://github.com/Hub-Tansky/RoboViolence2/tree/main/docs/decisions) with their numbers; new ones here count from 0001 and skip those two (ADR 0001). Cite the game repository's ADRs as "RoboViolence2 ADR NNNN".

## Rules

- An accepted ADR is never edited except for its **Status** line. To change a decision, write a new ADR and mark the old one `Superseded by NNNN` or `amended by NNNN`.
- Keep it under one screen. Link the Project item, issue, PR or file it affects.
- Add every new ADR to the index below and to the file table in `README.md`.

## Format

```markdown
# NNNN: <decision as an imperative phrase>

- Status: Accepted | Superseded by NNNN | Deprecated
- Date: YYYY-MM-DD
- Affects: <Project item, issue, PR or file>

## Context
Facts that force the decision. 2–5 bullets.

## Decision
What we do, in one or two sentences.

## Consequences
- What gets easier or harder; follow-up work it creates.
- Rejected options, one line each, with the reason.
```

## Index

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-website-in-its-own-repository.md) | The website lives in its own repository; tests read the game's release file names from its `build.yml` | Accepted |
| [0002](0002-two-linux-download-buttons.md) | Linux visitors get two download buttons, .deb and tar.gz | Accepted |
| [0029](0029-static-website-on-github-pages.md) | The website is static HTML on GitHub Pages; downloads come from the GitHub releases API | Accepted, amended by 0035, 0001, 0002 |
| [0035](0035-website-tailwind-install-page-agent-files.md) | The website uses Tailwind from its CDN, has a separate install guide and publishes files for AI agents | Accepted, amended by 0001 |

Related in the game repository: [RoboViolence2 ADR 0032](https://github.com/Hub-Tansky/RoboViolence2/blob/main/docs/decisions/0032-discord-release-post.md) (Discord release post, links `install.html`), [RoboViolence2 ADR 0034](https://github.com/Hub-Tansky/RoboViolence2/blob/main/docs/decisions/0034-player-data-retention-and-privacy-policy.md) (player data retention; `website/privacy.html` states it).
