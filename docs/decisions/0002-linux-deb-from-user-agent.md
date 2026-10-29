# 0002: Offer the .deb to Debian-based Linux the user agent names, the tar.gz otherwise

- Status: Accepted
- Date: 2026-10-29
- Affects: `website/site.js` (`detectOS`, `PLATFORMS.deb`), `tests/website/site.test.mjs`; amends ADR 0029

## Context
- Owner request 2026-10-29 (project thread "Website v3"): visitors on Ubuntu, Mint, Debian, Pop!_OS, MX Linux, Kali, Zorin OS, Kubuntu, Xubuntu, Lubuntu, Tails, Deepin, Devuan and PureOS get `roboviolence2-linux-x64.deb` from the download button; every other Linux keeps the tar.gz.
- The site is static (ADR 0029), so the browser is the only place to decide. No browser API reports the distribution: User-Agent Client Hints give only "Linux", Chrome's user agent says "X11; Linux x86_64".
- Firefox builds packaged by some distributions add the name ("X11; Ubuntu; Linux x86_64").

## Decision
`detectOS` returns `deb` when a Linux user agent contains one of the listed names (one regular expression, `DEB_DISTROS`), and `linux` (tar.gz) for every other Linux.

## Consequences
- Many Debian-based visitors (Chrome, Chromium, distribution Firefox builds without the token) still get the tar.gz; the install guide lists both files and explains both.
- Tails runs Tor Browser, which reports a fixed user agent, so Tails visitors are rarely detected.
- Rejected: server-side detection (GitHub Pages runs no code); guessing from fonts or other fingerprinting (unreliable, and the privacy policy promises no tracking).
