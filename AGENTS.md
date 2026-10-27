# AGENTS.md: Robo Violence 2 website

Static site for roboviolence.com. Layout, commands and file list: [README.md](README.md). Decisions: [docs/decisions/](docs/decisions/README.md). The game, its release job and the Discord release post live in [Hub-Tansky/RoboViolence2](https://github.com/Hub-Tansky/RoboViolence2).

## Rules

- After any change to a page, run `node tools/website-markdown.mjs` and `node --test tests/website/site.test.mjs`; commit the regenerated `.md` copies with the page.
- Every page shares the same header and footer (the tests compare them). Use the component classes in `theme.js` rather than long class lists.
- A new third party the browser contacts (CDN, font, badge, analytics) goes into the privacy policy in the same PR.
- Release file names come from the game's `build.yml`. When they change there, update `PLATFORMS` in `site.js` and the names in `install.html`.
- Keep the `README.md` file table and the ADR index current. Record non-obvious decisions as ADRs (`docs/decisions/README.md`).
- Backlog: the private GitHub Project [Robo Violence 2](https://github.com/users/Hub-Tansky/projects/1) (RoboViolence2 ADR 0024). Never create `step*.md`, `NEXT_STEPS.md`, roadmap or task-list files.
- Commit messages carry no `Co-Authored-By` or `Claude-Session` trailers. Never commit secrets, real hosts or IPs beyond the public domain.
- Don't mix mechanical rewrites (renames, formatting) with content changes in one commit.
