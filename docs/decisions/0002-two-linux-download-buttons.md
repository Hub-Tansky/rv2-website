# 0002: Give Linux visitors two download buttons, .deb and tar.gz

- Status: Accepted
- Date: 2026-10-29
- Affects: `website/site.js` (`PLATFORMS`, `BUTTONS`, `downloadOffers`), `index.html`, `install.html`, `tests/website/site.test.mjs`; amends ADR 0029

## Context
- Since v0.0.2 every release has `roboviolence2-linux-x64.deb` (Ubuntu, Mint, Debian and other Debian-based systems) next to the tar.gz.
- The site is static (ADR 0029), so the browser is the only place to choose. No browser API reports the distribution: User-Agent Client Hints and Chrome's user agent say only "Linux"; a few distribution Firefox builds add a name.
- Owner, 2026-10-29 (project thread "Website v3"): first asked for the .deb on 14 named Debian-based distributions; after hearing the user agent rarely names them, chose two buttons and no distribution detection.

## Decision
On Linux the download area shows two buttons, ".deb (Ubuntu, Mint, Debian…)" first and ".tar.gz (other)" second, both from the newest release. Windows and macOS keep one button.

## Consequences
- Every Linux visitor sees both files and picks; nobody gets the wrong package from a guess.
- The pages carry one hidden `[data-download]` link per extra button; a test checks the count against `BUTTONS`.
- Rejected: matching distribution names in the user agent (most browsers never send one, so most Debian-based visitors would get the tar.gz); fingerprinting (unreliable, and the privacy policy promises no tracking).
