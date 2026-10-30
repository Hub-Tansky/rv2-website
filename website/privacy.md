# Privacy policy

Last updated: 27 October 2026

In short: Robo Violence 2 has no accounts, no analytics, no advertising, no telemetry and no crash reporting. To play online, the game servers need your IP address and see the nickname and chat messages you choose. If you submit a map, we keep your Discord user ID and username with the map, as a record of the licence you gave. We keep as little of this as possible, for as short as possible, and never sell it.

## 1. Who is responsible

This policy explains how the Robo Violence 2 project ("we") processes personal data when you use the game Robo Violence 2 (the "Game"), the official servers at roboviolence.com and this website. We process personal data under the General Data Protection Regulation (EU) 2016/679 (GDPR) and applicable national data protection law.

Data controller: Piotr, maintainer of Robo Violence 2.
Contact for privacy questions: [floss [at] pelzowski [dot] eu](#controller)

## 2. What data we process

### When you play on an official server

- **IP address and port** of your connection. A network game can't work without it. Other players never receive your IP address.
- **Nickname** you choose in the game. You don't need to use your real name.
- **Chat messages** you send in the game.
- **Match data**: team, score, kills, deaths, flag captures, ping. It exists only while you are on the server and is not saved after the round. There is no leaderboard and no player profile.

### Server logs

Each official server writes a technical log: players joining and leaving (by nickname) and chat messages. Some entries also hold a nickname with an IP address: a player kicked, banned or flagged by the anti-cheat checks, a connection dropped for not completing the join, and in-game admin logins and admin commands.

### Bans

If a player is banned for cheating or abuse, the server stores the nickname, the IP address and the date of the ban, so the ban can be enforced. To let an administrator ban someone who has already left, each server also keeps the nicknames and IP addresses of its last 50 players in memory only; they are gone when the server restarts. So that bans can be shared between servers, anyone who runs a Robo Violence 2 server, or any program that connects to the master server, can request this list from a public server through the master server.

When you join a public server, that server asks the master server whether your IP address is on the shared ban list. The master server only compares it with the list and doesn't store it.

### The server list

When you refresh the server list, the Game connects to the master server (master.roboviolence.com), which sees your IP address while it sends you the list. The master server stores IP addresses only in the shared ban list. If you run your own game server and make it public, the master server stores and shows everyone that server's IP address, port, name and player count while the server is online.

### Server administration

Requests to the servers' admin interface (admin.roboviolence.com) are logged with the time, the requester's IP address and the command.

### This website

This website sets no cookies and uses no analytics or tracking. It is hosted on GitHub Pages; GitHub processes your IP address and request details to deliver the pages. Your browser also loads the page styles from cdn.tailwindcss.com, the icons from cdn.jsdelivr.net, the release list from api.github.com and three badge images from img.shields.io; each of them sees your IP address. Downloads come from GitHub Releases.

### Map submissions

When you submit a map at roboviolence.com/submit-map.html, the submission service at submit.roboviolence.com processes:

- **Your Discord account**: you sign in with Discord, which tells us your Discord user ID, username and display name. We don't receive your email address or anything else from your Discord account. A cookie on submit.roboviolence.com keeps you signed in for up to 2 hours; it is needed for the form to work.
- **What you submit**: the name to credit, the map title and description, the map file, the third-party assets you list with their sources and licences, and any evidence files or links you add.
- **The acceptance record**: the time we received the submission, the version and exact text of the agreement you accepted, and fingerprints (SHA-256) of the files, so the record shows exactly what you sent and accepted.
- **The human check**: before the upload, Cloudflare Turnstile checks that a person, not a bot, sends the form. It loads from challenges.cloudflare.com only after you sign in, and Cloudflare processes your IP address and browser details for this check. We don't store your IP address with the submission.

If we accept your map and publish it, the name to credit is shown with it.

### On your computer

Your nickname, settings, screenshots and any game server data you create stay on your computer. The Game doesn't send them to us.

## 3. Why we process it (legal basis)

- **Providing the online game you ask to join** (Art. 6(1)(b) GDPR): connecting you to a server, showing your nickname and chat to other players, sending you the server list.
- **Map submissions** (Art. 6(1)(b) GDPR): receiving your map and the licence you grant under the submission agreement, reviewing it and crediting you. Keeping the acceptance record after that, so we can show what licence a map was given under, is in our legitimate interest (Art. 6(1)(f) GDPR) in defending the project's right to distribute it.
- **Legitimate interests** (Art. 6(1)(f) GDPR): keeping the servers secure and fair, keeping bots and spam out of the map submission form, enforcing bans, finding faults (server logs), protecting the admin interface (audit log), keeping backups, and running this website.

The anti-cheat checks can automatically remove a player from a match. This only affects that match; a ban is always decided by an administrator.

## 4. Where the data is stored

The official game servers and the master server run on a server rented from netcup GmbH, located in Nuremberg, Germany. Nightly backups of the server data (bans, admin log, server settings) are encrypted on our server before upload and stored with Backblaze in its EU Central region (Netherlands); Backblaze can't read them. Game data is not transferred outside the European Economic Area as part of our own infrastructure.

This website is hosted by GitHub, Inc. (USA), which participates in the EU-U.S. Data Privacy Framework.

Map submissions are processed by Cloudflare, Inc. (USA) on our behalf: the service runs on Cloudflare Workers, and the files and records are stored in Cloudflare R2 and D1 restricted to the EU jurisdiction. Cloudflare participates in the EU-U.S. Data Privacy Framework. Sign-in goes through Discord Inc. (USA), under Discord's own privacy policy.

## 5. How long we keep it

- IP address, nickname and match data in the game server's memory: until you disconnect or the round ends.
- Server logs: kept in rotating files of at most 30 MB per server, overwritten as new entries arrive, and deleted whenever the server is updated. In practice this is days, not months.
- Bans: enforced for 365 days from the ban, then deleted automatically when the server next restarts. Bans on the shared ban list of the master server end when their set duration ends.
- The last 50 players' nicknames and IP addresses kept for bans: in memory only, until the server restarts.
- Public game server entries on the master server: removed 60 seconds after the server stops reporting.
- Admin interface log: 90 days.
- Backups: 14 daily and 8 weekly copies, so deleted data can remain in a backup for up to 8 more weeks.
- Map submissions we accept: the map, your submission details and the acceptance record are kept for as long as the project distributes the map, and afterwards for as long as claims about its licence can be raised, because they prove the licence.
- Map submissions we don't accept: deleted automatically one year after the submission.
- Copies of the submission database, for recovery: 35 days.
- The sign-in cookie: 2 hours.

## 6. Who receives the data

We do not sell or share your personal data for advertising. Recipients are:

- **Other players** on the same server see your nickname, chat messages, team and score.
- **Anyone who runs a Robo Violence 2 server**, or any program that connects to the master server, can see the nicknames and IP addresses of a public server's last 50 players; the feature exists to issue shared bans (see section 2, Bans).
- **Our hosting providers**, acting on our behalf: netcup GmbH (game and master servers), Backblaze (encrypted backups), GitHub (website), Cloudflare (map submissions).

Anyone can run their own Robo Violence 2 server. If you join a server that is not run by us, its operator is responsible for the data it processes, and this policy does not cover it.

The Robo Violence 2 Discord server is run on Discord, under Discord's own privacy policy. We only link to it.

## 7. Your choices

You can play offline or on a local network without contacting our servers. To stop the Game from contacting our master server, start it with the environment variable `BV2_MASTER_SERVERS=none`, or put the line `cl_masterServers "none"` in a `.cfg` file in the `config/local` folder of the Game ([configuration guide](https://github.com/Hub-Tansky/RoboViolence2/blob/main/config/README.md)). You can then still join servers by address.

## 8. Your rights

Under the GDPR you have the right to:

- access the personal data we hold about you (Art. 15),
- have inaccurate data corrected (Art. 16),
- have your data deleted (Art. 17),
- restrict processing (Art. 18),
- receive your data in a portable format (Art. 20),
- object to processing based on legitimate interests (Art. 21).

Because we have no accounts, we can only find your data by the IP address or nickname you used, or for map submissions by your Discord username or the submission ID. To exercise a right, write to the contact address in section 1 with that information. We can correct the name we credit you with, but we don't change or delete the acceptance record of a map we distribute while we may need it to show the licence (Art. 17(3)(e) GDPR).

You can also lodge a complaint with a data protection supervisory authority, in particular in the EU country where you live, or with the Polish authority, the President of the Personal Data Protection Office (UODO, [uodo.gov.pl](https://uodo.gov.pl/)).

## 9. Children

The Game does not ask for your age or any identifying information. It is not directed at children under 16, and map submissions are for people aged 16 or older. If you are a parent and believe your child's data is stored in a ban or log, contact us and we will delete it.

## 10. Changes to this policy

We update this policy when the Game or our servers change how they handle personal data. The date at the top shows the latest version; the full history is in the [website repository](https://github.com/Hub-Tansky/rv2-website/commits/main/website/privacy.html).
