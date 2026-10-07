# DuRuVaSa CloudSec website + admin CMS

React 18 + TypeScript front end, a small Node/TypeScript API, and a **SQLite** database stored on the server's own disk.
Everything on the site is editable from the admin panel at **`/admin`**.

```
Browser ──HTTPS──> Caddy ──> Node app (server-dist) ──> SQLite file + uploads on the VM disk (/var/lib/duruvasa)
                              ├─ serves the built site (dist/) and /admin
                              └─ /api: public forms, gated download, admin API
```

## Quick start (local)

Needs Node 22.13+ (uses the built-in `node:sqlite`, so there are no native modules to compile).

```bash
npm install
npm run dev:all          # API :4180 + site :5173 (admin at http://localhost:5173/admin/)
```

First start prints a **one-time admin setup link** for `rajesh@duruvasa.com`. Open it and choose a password.
Data lives in `./data` (git-ignored).

| Command | What |
| --- | --- |
| `npm run dev:all` | API (auto-restart) + Vite dev server |
| `npm test` | 11 unit + 23 API integration tests (Vitest) |
| `npm run build` | sitemap + type-check + site + admin + API build |
| `npm run e2e` | Playwright browser tests (needs a build; uses your installed Chrome locally) |
| `npm run audit:headers -- <url>` | Security-header and lock-down audit |
| `npm run audit:lighthouse` | Lighthouse CI (performance, accessibility, best practices, SEO) |
| `npm run admin:link` | Print a fresh password-setup link (server shell access) |
| `npm run admin:reset-2fa -- <email>` | Turn off 2FA for someone who lost their phone |

## The admin panel (`/admin`)

* **Everything is editable**: site settings (email, phone, WhatsApp), hero, About, section headings, services (with steps and FAQs), offerings, advantages, attributes, articles, legal pages, partners (logo, link, colour), team (photo, bio, skills, certifications with logos), testimonials, badges, downloads.
* Full create / edit / duplicate / reorder / publish-or-draft / delete, with forms generated from one schema (`shared/schema.ts`) that the server also uses to validate.
* **Enquiries**: every message and consultation request lands in the database. Filter, search, set status (New / In progress / Done / Spam), keep notes, reply by email or phone, export CSV.
* **Subscribers**: people who requested the checklist (with consent). Export, unsubscribe, delete.
* **Media library**, **Team access** (admins/editors), **Backups**, **Activity log**.
* Roles: *Administrator* (everything) and *Editor* (content, media, enquiries; no users, deletes or backups).

### How it is secured

* Passwords hashed with scrypt; 12+ character policy; **sign-in lockout** after 5 failures; per-IP rate limits.
* Optional **TOTP two-factor authentication** (Google/Microsoft Authenticator, 1Password).
* Sessions: random id (only its hash is stored), `HttpOnly` + `SameSite=Strict` + `Secure` cookie, 30 min idle / 12 h absolute timeout, ended on password change.
* **CSRF protection** on every change (per-session token + Origin check). Strict **Content-Security-Policy**, HSTS, `X-Frame-Options: DENY`, `nosniff`.
* Uploads accept only real JPG/PNG/WebP/GIF (checked by file signature, SVG refused). Links must be `https:`, `mailto:`, `tel:` or site paths.
* Every sign-in, change and export is written to the **Activity log**.
* **Forgot / change password**: on the sign-in page, enter your email, current password and a new one (plus your 2FA code if enabled). If the current password is also lost, an administrator resets it from *Team access*, or whoever has shell access runs `npm run admin:link`.

## Free checklist (mailing list)

The "Get the Cloud Security Checklist" section collects an email address with explicit consent, stores it under **Subscribers**, and gives the visitor a time-limited download link. The PDF is private (not a public file). Replace it from *Downloads* in the admin; regenerate the default with `python scripts/make-checklist.py`.

## Call / WhatsApp buttons

On phones a sticky bar offers **Call now** (`+91 98334 45810`) and **WhatsApp** (`+91 75060 45810`); on desktop a WhatsApp bubble. Change the numbers in *Site settings*.

## Deploy on Google Cloud (Compute Engine VM, SQLite on the VM disk)

SQLite needs a disk that persists, so the app runs on a small VM (Cloud Functions and Cloud Run would lose the file).

1. `PROJECT_ID=<project> bash deploy/create-vm.sh`: VM (e2-small, Debian 12), static IP, firewall (web ports only; SSH via IAP).
2. Point DNS **A records** for `duruvasa.com` and `www.duruvasa.com` at the printed IP.
3. On the VM: `sudo bash deploy/setup-vm.sh https://github.com/kaushik020603/Duruvasa_Website.git` (installs Node, Caddy with automatic HTTPS, the hardened systemd service).
4. Read the first-run setup link: `sudo journalctl -u duruvasa | grep -A2 "First-run setup"`, open it, set the admin password, then turn on 2FA.
5. Updates: `sudo bash /opt/duruvasa/deploy/update.sh` (the database is never touched).
6. Backups: the app snapshots the database daily to `/var/lib/duruvasa/backups` (also downloadable in the admin). `deploy/backup-to-gcs.sh` copies backups and uploads to a Cloud Storage bucket.
7. Monitoring: `PROJECT_ID=<project> bash deploy/gcp-monitoring.sh` creates uptime checks (every minute, three regions), a certificate-expiry alert, and email alerts to `info@` and `rajesh@`.

Email is optional. With no `RESEND_API_KEY` (in `/etc/duruvasa.env`) nothing is emailed, and enquiries are still saved and visible in the admin.

## Quality gates

* **CI** (`.github/workflows/ci.yml`): type-check, unit/API tests, build, **Playwright browser tests** (desktop and phone), then **Lighthouse + security headers** against a throwaway instance.
* **Post-deploy audit** (`post-deploy-audit.yml`): run by hand after deploying and automatically every Monday against the live site (headers, admin lock-down, HTTPS redirect, certificate expiry, Lighthouse).

## Content, languages and server-side rendering

Starting content is in `src/content/*.json` and is imported into the database on first start; after that the admin is the source of truth (English).

**Nine languages** (English at `/`, then `/hi`, `/kn`, `/ta`, `/te`, `/ml`, `/mr`, `/bn`, `/gu`), each page with its own address, `hreflang` alternates and sitemap entries. Translations are plain files, one per language: `i18n/<code>.json`.

* `ui` holds the interface strings (the English originals are listed in `i18n/en.ui.json`); everything else mirrors the English content (`hero`, `about`, `services.<slug>`, `posts.<slug>`, `team.<name>`, ...).
* The server merges a language file over the English content: by slug or name for services, posts, legal pages and people, and by position for lists whose length is unchanged. If someone adds or removes items in an English list in the admin, that list falls back to English until the translation file is updated. Edited English text therefore stays English in the other languages until the file is edited.
* `npm test` checks every language file: all interface strings present, placeholders such as `{title}` preserved, list lengths and links matching the English content.
* The first drafts were written by an AI model. **Have a native speaker review each language** before relying on it (legal pages are placeholders in every language).
* To add a language: add it to `shared/langs.ts`, add `i18n/<code>.json`, run `npm test`.

**Server-side rendering.** `npm run build` also produces `dist-ssr/` (the React app compiled for Node). The server renders each page to HTML with the real components, embeds the content it used, and the browser hydrates it, so crawlers and AI bots that do not run JavaScript see the full page, and the first paint is fast. Per-page `<title>`, description, canonical, hreflang, Open Graph and JSON-LD come from `server/seo.ts`; `sitemap.xml`, `robots.txt`, `llms.txt` and `llms-full.txt` are generated from the live content. Set `SITE_URL` if the public address is not `https://www.duruvasa.com`.
