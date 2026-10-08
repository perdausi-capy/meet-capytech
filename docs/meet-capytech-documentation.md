# meet.capytech.co.uk — Booking Service Documentation

> **Status:** Core product (M1–M6) built and running on the VPS; launch hardening and the upgrade roadmap (M7–M13) in progress. See section 3.
> **Confidentiality:** Do not put real calendar IDs, private iCal links, tokens or personal email addresses in this repository. Everything sensitive lives in environment variables on the server and in GitHub Secrets.

---

## 1. What this project is about

### 1.1 Purpose

A public "book a meeting with Jason" page for Capytech UK, hosted at `meet.capytech.co.uk`. A prospective customer picks a meeting type, a day and a time, enters their details, and immediately receives a calendar invite with a video link. No back-and-forth emails.

### 1.2 What it does

| Capability | Description |
|---|---|
| Availability | Reads free/busy from several calendars (Google Workspace, other Google calendars, and an iCloud calendar via a private iCal feed) and only offers times where Jason is genuinely free |
| Meeting types | Quick intro (15 min), Discovery call (30 min), Product demo (60 min). Configurable |
| Rules | Working hours, buffers between meetings, minimum notice, maximum meetings per day, booking window, UK bank holidays |
| Booking | Creates a Google Calendar event with a Google Meet link (or Zoom room link if enabled) and emails the guest |
| Guest self-service | Cancel or reschedule from a private link in the invite |
| Time zones | Guest sees times in their own zone (important for our GCC customers) |
| CRM sync | Jason's local CRM pulls bookings and pushes availability rules through a token-protected API |
| Safety | Fails closed: if any calendar cannot be read, no times are offered, so double-booking cannot happen silently |

### 1.3 Users

- **Guest** (public): books, cancels, reschedules.
- **Host** (Jason): connects Google once, receives events in his calendar.
- **CRM** (machine): reads bookings, updates configuration.
- **Dev team**: builds, deploys and operates it.

### 1.4 Goals and non-goals

**Goals:** reliable (never double-book), fast to use on mobile, simple to operate on one small VPS, UK/EU data residency, easy to hand over.

**Non-goals (for now):** multiple hosts, payments, Microsoft Teams links (we run Google Workspace). (A full admin dashboard is now planned in M11–M12; SMS/WhatsApp reminders in M13.)

### 1.5 Architecture

```mermaid
flowchart LR
  G[Guest browser] -->|HTTPS| CF[Cloudflare<br/>proxy + Turnstile + WAF]
  CF --> CD[Caddy on VPS<br/>TLS + headers]
  CD --> APP[Next.js app<br/>pages + API routes]
  APP --> DB[(SQLite<br/>/data)]
  APP -->|freeBusy / events| GC[Google Calendar API]
  APP -->|busy ranges only| IC[iCloud iCal feed]
  CRM[Jason's CRM] -->|Bearer token| APP
```

### 1.6 Core flow: booking a slot

```mermaid
sequenceDiagram
  participant G as Guest
  participant A as App
  participant D as SQLite
  participant C as Google Calendar
  G->>A: GET /api/slots (type, month)
  A->>C: freeBusy (cached ~60s)
  A-->>G: available slots
  G->>A: POST /api/book (+ Turnstile token)
  A->>D: INSERT pending reservation (unique start)
  alt slot already taken
    A-->>G: 409 slot gone
  else reserved
    A->>C: create event + Meet link
    A->>D: mark confirmed
    A-->>G: confirmation + manage link
  end
```

The unique reservation row is what prevents two guests taking the same slot at the same moment.

### 1.7 Screens (wireframes)

**Booking page (desktop, three panes)**

```
┌──────────────────────────────────────────────────────────────┐
│ ▣ CAPYTECH UK                          meet.capytech.co.uk    │
├───────────────┬──────────────────────────┬───────────────────┤
│ (JS) Jason    │  October 2026     ‹  ›   │ Thursday 8 October │
│ COO, Capytech │  MON TUE WED THU FRI …   │ ┌───────────────┐ │
│               │   …  …  …  [8] …         │ │    09:00      │ │
│ MEETING TYPE  │                          │ │    09:30      │ │
│ ○ Quick intro │  🌐 Europe/London  ▾     │ │    10:00  ◄── │ │
│ ● Discovery   │                          │ └───────────────┘ │
│ ○ Demo        │                          │ Name / Email /    │
│               │                          │ Company / Notes   │
│               │                          │ [Confirm booking] │
└───────────────┴──────────────────────────┴───────────────────┘
```

**Mobile:** single column. Type → calendar → slots (grid) → form.

**Confirmation:** full-card success state with date, time, video link and "Add to calendar" and "Manage booking" actions.

**Manage page (`/manage/[token]`):** booking summary, **Reschedule** (book the new slot first, then release the old one), **Cancel**.

---

## 2. Tech stack

The prototype is vanilla JS plus a hand-rolled iCal parser and hand-rolled HTTP server. The production build replaces each of those with a maintained, typed tool.

| Layer | Choice | Replaces | Why |
|---|---|---|---|
| Language | **TypeScript** (strict) | untyped JS | Catches date/slot bugs at compile time |
| Framework | **Next.js** (App Router, `output: 'standalone'`) | vanilla HTML + custom `http` server | One codebase for UI and API, small Docker image, routing and headers built in |
| UI | **React** + **Tailwind CSS** + **Radix UI primitives** (shadcn/ui pattern) | hand-written CSS/DOM code | Accessible calendar, select and dialog components, consistent design tokens |
| Forms/validation | **React Hook Form** + **Zod** (shared client/server schemas) | manual `clean()` checks | One schema validates both sides |
| Data fetching | **TanStack Query** | hand-rolled `fetch` and state | Caching, loading and error states for slots |
| Dates/time zones | **Luxon** (or date-fns-tz) | hand-rolled `londonToUtc` | Correct DST handling, including 23h/25h days |
| Database | **SQLite** via **Drizzle ORM** + `better-sqlite3`, migrations in repo | raw `node:sqlite` + key/value table | Typed schema, real migrations, unique indexes for slot reservation |
| Google | **googleapis** official client | raw `fetch` to Google | Typed, token refresh handled |
| iCal | **node-ical** + **rrule** | hand-rolled recurrence expansion | Standards-compliant recurrence handling |
| Anti-abuse | **Cloudflare Turnstile**, per-IP and per-email rate limits | honeypot + in-memory map | Stops invite-spam through Jason's account |
| Logging | **pino** (JSON) | `console.error` | Structured logs for the VPS |
| Tests | **Vitest** (unit), **Playwright** (end-to-end) | none | Slot engine and booking flow covered |
| Quality | ESLint, Prettier, `tsc --noEmit`, Husky + lint-staged | none | Consistent code, blocked bad commits |
| Container | **Docker** (multi-stage, non-root) + **Docker Compose** | single Dockerfile | Reproducible on the VPS |
| Reverse proxy | **Caddy** | none | Automatic TLS or Cloudflare origin cert, security headers |
| CI/CD | **GitHub Actions** + **GHCR** (GitHub Container Registry) | manual `docker run` | See section 4 |
| Backups | SQLite `.backup` on cron (or **Litestream**) to off-box storage | none | Guest data is recoverable |
| Email | **Nodemailer** over SMTP to **Amazon SES** (eu-west-2, London); local outbox in development | Google invite only | Branded confirmations and reminders; UK data residency; provider swappable via SMTP settings |
| Background jobs | SQLite-backed job table polled in-process | none | Reminders, retries and backups survive restarts without extra infrastructure |
| Motion / 3D | **GSAP** animations; **three.js** WebGL scene on desktop only | none | Polished feel without hurting mobile performance |

### 2.1 Repository layout

```
meet-capytech/
├─ src/
│  ├─ app/                  # Next.js routes: /, /manage/[token], /api/*
│  ├─ components/           # UI (calendar, slot list, booking form)
│  ├─ lib/
│  │  ├─ slots/             # availability engine (pure, unit-tested)
│  │  ├─ calendars/         # google.ts, ics.ts, busy-cache.ts
│  │  ├─ booking/           # reserve, confirm, cancel, reschedule
│  │  ├─ security/          # auth, rate limit, turnstile, crypto
│  │  └─ db/                # drizzle schema + migrations
│  └─ env.ts                # Zod-validated environment
├─ tests/                   # vitest + playwright
├─ deploy/                  # docker-compose.yml, Caddyfile, scripts
├─ .github/workflows/       # ci.yml, deploy.yml
├─ Dockerfile
└─ docs/                    # this document
```

### 2.2 Data model

| Table | Key fields |
|---|---|
| `bookings` | id, type_slug, starts_at (UTC ISO), ends_at, name, email, company, notes, status (`pending` / `confirmed` / `cancelled`), event_id, manage_token_hash, created_at, updated_at (ISO UTC) |
| unique index | `(starts_at)` where status in (`pending`, `confirmed`) — prevents double-booking |
| `settings` | working hours, buffers, notice, max per day, window, step, meeting types |
| `google_tokens` | encrypted refresh/access tokens, connected account |
| `busy_cache` | calendar source, from/to, **busy ranges only** (never event titles or details), fetched_at |

### 2.3 Environment variables

| Variable | Purpose |
|---|---|
| `BASE_URL` | Public URL, e.g. `https://meet.capytech.co.uk` |
| `DATA_DIR` | SQLite location (mounted volume) |
| `ADMIN_TOKEN` | Bearer token for the CRM and admin endpoints |
| `ENCRYPTION_KEY` | Separate key for encrypting Google tokens at rest |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client |
| `HOST_EMAIL` | Calendar owner who connects Google |
| `BUSY_CALENDARS` | Comma-separated calendar IDs (no defaults in code) |
| `ICS_FEEDS` | Private iCal URLs (secret) |
| `ICS_BLOCK_ALL_DAY` | `1` to let all-day events block the whole day |
| `ZOOM_LINK` | Optional personal Zoom room |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | Bot protection |

---

## 3. Development roadmap

Status key: ⬜ not started · 🟨 in progress · ✅ done. Update the checklist and the "What it can do so far" line as each milestone lands.

### Progress at a glance

| Milestone | Name | Status |
|---|---|---|
| M0 | Prototype review and documentation | ✅ |
| M1 | Foundation | ✅ |
| M2 | Availability engine | 🟨 (max meetings per day open) |
| M3 | Booking and Google integration | ✅ |
| M4 | Guest self-service | ✅ |
| M5 | UI/UX build-out | 🟨 (superseded by M9 redesign) |
| M6 | CRM sync and admin API | ✅ |
| M7 | Hardening and launch | 🟨 |
| M8 | Upgrade foundations: email, jobs, backups | 🟨 |
| M9 | Guest experience redesign | ⬜ |
| M10 | Notifications and reminders | ⬜ |
| M11 | Admin command center | 🟨 |
| M12 | Insights, operations and admin auth | ⬜ |
| M13 | Later | ⬜ |

**Upgrade decisions (2026-10-08):** single host (Jason) only; no payments; transactional email via
Amazon SES in eu-west-2 (London) over SMTP; a cleaner, conventional visual design with GSAP animations
and a three.js WebGL scene on desktop only; Arabic/RTL deferred to M13.

### M0–M6 — Core product ✅

Shipped: availability engine (Luxon, buffers, notice, window, UK bank holidays, Google freeBusy and
iCal with fail-closed behaviour), reserve-then-confirm booking with Google Meet events, hashed manage
links with cancel and reschedule (new slot reserved before the old one is released), Turnstile and
rate limits, token-protected admin/CRM API with webhooks, and a read-only admin dashboard.

Open from these milestones: **max meetings per day** (M2, moves to M11).

### M7 — Hardening and launch 🟨

- [x] Security headers via Next config (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy)
- [ ] Content Security Policy with per-request nonces
- [ ] Origin locked to Cloudflare, SSL "Full (strict)", WAF rate limit on `POST /api/bookings`
- [ ] Backups running and a restore test completed (automated backups land in M8)
- [ ] Deploy pipeline with health check and automatic rollback (production currently deploys with `git pull` + `docker compose up -d --build` on the VPS)
- [ ] Staging deployment dry run
- [ ] Privacy notice and data retention policy confirmed

### M8 — Upgrade foundations 🟨

- [ ] Email service: SMTP (Amazon SES, London) in production; local outbox folder in development
- [ ] Background job runner stored in SQLite (scheduled jobs, retries with backoff, survives restarts)
- [ ] Booking confirmation, reschedule and cancellation emails sent through the job runner
- [ ] Nightly SQLite backups with retention, plus a restore procedure
- [ ] Failed Google event clean-ups and webhooks retried through the job runner

**What it can do so far:** the app can send its own branded emails and run scheduled work reliably.

### M9 — Guest experience redesign ⬜

- [ ] New design system: clean, conventional layout, self-hosted fonts, light/dark themes
- [ ] Desktop three-pane layout (host card, calendar, slots); mobile single column
- [ ] GSAP motion throughout (page entrance, step transitions, slot reveal, confirmation)
- [ ] three.js WebGL hero scene on desktop only; static fallback on mobile, low-power devices and `prefers-reduced-motion`
- [ ] Month availability endpoint so unavailable days are greyed out before clicking
- [ ] Host profile (photo, bio, branding) and meeting type cards with location
- [ ] Custom intake questions per meeting type (company, phone, agenda, …)
- [ ] Confirmation with add-to-calendar (.ics, Google, Outlook) and extra attendees
- [ ] Direct links per meeting type, prefilled fields, UTM capture, embeddable widget for capytech.co.uk
- [ ] 12/24-hour toggle; accessibility and mobile performance budget

**What it can do so far:** a polished, fast booking experience that matches the best hosted tools.

### M10 — Notifications and reminders ⬜

- [ ] Branded confirmation, reschedule and cancellation emails with .ics attachments
- [ ] Reminders 24 hours and 1 hour before; follow-up after the meeting
- [ ] Reminders cancelled or moved automatically when a booking changes
- [ ] Host notification emails and daily agenda

### M11 — Admin command center 🟨

- [x] New admin app: sign-in, sidebar navigation, overview (stats, upcoming meetings, system health, weekly activity chart)
- [x] Meeting type manager: create/edit/archive/restore/delete (delete only if never booked), duration, buffers, location (Google Meet, Zoom, phone, in person, custom), private link-only types, per-type daily limits, ordering, copyable direct links
- [x] Host profile editor: name, title, company, introduction, photo upload with 4:5 crop
- [x] Engine support for date overrides and daily caps (global and per type), enforced inside the reservation transaction
- [ ] Weekly availability editor, date overrides UI (holidays, time off, extra hours), buffers, notice
- [ ] Max meetings per day setting in the UI (engine support done; settable via the config API)
- [ ] Custom intake questions per meeting type
- [ ] Booking management: day/week calendar views, search, cancel or reschedule on a guest's behalf, internal notes, no-show marking, CSV export

### M12 — Insights, operations and admin auth ⬜

- [ ] Analytics: page views → slots viewed → bookings funnel, popular times, no-show and cancellation rates, booking sources (UTM)
- [ ] Operations page: Google and iCal feed health, webhook delivery log with retry, audit log
- [ ] Admin sign-in with Google restricted to the host account; separate revocable CRM API keys

### M13 — Later ⬜

- [ ] Arabic/RTL booking page for the GCC audience
- [ ] WhatsApp/SMS reminders
- [ ] Routing forms, group events with seat limits, waitlist
- [ ] Native CRM integrations (e.g. HubSpot)
- [ ] Uptime monitoring and alerting

---

## 4. Deployment on our own VPS from GitHub with GitHub Actions

### 4.1 Strategy

1. Every push and pull request runs **CI** (lint, typecheck, tests, build).
2. A merge to `main` builds a Docker image, tags it with the commit SHA, and pushes it to **GHCR**.
3. The deploy job connects to the VPS over SSH, pulls that exact image, restarts the service with Docker Compose, checks `/api/health`, and **rolls back** to the previous image if the check fails.
4. Production deploys require manual approval through a GitHub **Environment** (`production`).

```mermaid
flowchart LR
  PR[Pull request] --> CI[ci.yml<br/>lint / types / tests / build]
  CI -->|merge to main| BUILD[Build + push image<br/>ghcr.io/ORG/meet-capytech:SHA]
  BUILD --> APPROVE{Approve<br/>production}
  APPROVE --> SSH[SSH to VPS]
  SSH --> UP[docker compose up -d]
  UP --> HC{Health check}
  HC -->|ok| DONE[Live]
  HC -->|fail| RB[Roll back to previous SHA]
```

### 4.2 One-time VPS setup

Use a UK/EU region (for example London). Ubuntu LTS, at least 1 vCPU / 1 GB RAM, 1 GB+ persistent disk.

1. **Create a deploy user and lock down SSH**
   ```bash
   adduser deploy && usermod -aG docker deploy
   # key-only login, no root login, no password auth
   ```
2. **Firewall:** allow 22 (ideally restricted to your IPs), 80, 443 only.
   ```bash
   ufw default deny incoming && ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
   ```
3. **Install Docker Engine and the Compose plugin**, then log in to GHCR with a read-only token (`read:packages`):
   ```bash
   echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
   ```
4. **Create the app directory**
   ```bash
   mkdir -p /srv/meet/{data,caddy} && chown -R 1000:1000 /srv/meet/data
   ```
   The `chown` matters: the container runs as the non-root `node` user and must be able to write to `/data`.
5. **Create `/srv/meet/.env`** (mode `600`, never committed) with the variables from section 2.3.
6. **DNS (Cloudflare):** `meet.capytech.co.uk` → VPS IP, proxy on, SSL mode **Full (strict)**. Install a Cloudflare Origin Certificate in Caddy, or let Caddy obtain its own certificate.
7. **Restrict the origin to Cloudflare:** allow ports 80/443 only from Cloudflare IP ranges so `cf-connecting-ip` can be trusted and the origin cannot be hit directly.

### 4.3 Files on the VPS

`/srv/meet/docker-compose.yml`

```yaml
services:
  app:
    image: ghcr.io/ORG/meet-capytech:${APP_TAG:-latest}
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      DATA_DIR: /data
    volumes:
      - ./data:/data
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/api/health"]
      interval: 15s
      timeout: 3s
      retries: 5
    expose:
      - "8080"

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on:
      - app

volumes:
  caddy_data:
```

`/srv/meet/caddy/Caddyfile`

```
meet.capytech.co.uk {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "same-origin"
    Content-Security-Policy "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"
  }
  reverse_proxy app:8080
}
```

(Adjust the CSP once the final build is known; Next.js inline scripts may need nonces.)

`/srv/meet/deploy.sh` (called by the workflow)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /srv/meet
NEW_TAG="$1"
PREV_TAG="$(cat .current_tag 2>/dev/null || echo latest)"

export APP_TAG="$NEW_TAG"
docker compose pull app
docker compose up -d app

# wait up to ~60s for a healthy container
for i in $(seq 1 12); do
  if docker compose exec -T app wget -qO- http://localhost:8080/api/health >/dev/null 2>&1; then
    echo "$NEW_TAG" > .current_tag
    docker image prune -f >/dev/null
    echo "Deployed $NEW_TAG"
    exit 0
  fi
  sleep 5
done

echo "Health check failed, rolling back to $PREV_TAG" >&2
export APP_TAG="$PREV_TAG"
docker compose up -d app
exit 1
```

### 4.4 GitHub setup

**Repository secrets / environment secrets** (Settings → Environments → `production`, with required reviewers):

| Secret | Value |
|---|---|
| `VPS_HOST` | Server IP or hostname |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Private key for a deploy-only SSH key pair |
| `VPS_KNOWN_HOSTS` | Output of `ssh-keyscan <host>` (prevents man-in-the-middle) |

The image push uses the built-in `GITHUB_TOKEN` (`packages: write`), so no extra registry secret is needed. Application secrets (`ADMIN_TOKEN`, Google credentials, etc.) stay in `/srv/meet/.env` on the server and are never stored in GitHub.

### 4.5 Workflows

`.github/workflows/ci.yml`

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
```

`.github/workflows/deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  IMAGE: ghcr.io/${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ${{ env.IMAGE }}:${{ github.sha }}
            ${{ env.IMAGE }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production        # requires manual approval
    steps:
      - name: Set up SSH
        run: |
          install -m 700 -d ~/.ssh
          echo "${{ secrets.VPS_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          echo "${{ secrets.VPS_KNOWN_HOSTS }}" > ~/.ssh/known_hosts
      - name: Deploy
        run: |
          ssh ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} \
            "/srv/meet/deploy.sh ${{ github.sha }}"
      - name: Smoke test
        run: curl --fail --silent https://meet.capytech.co.uk/api/health
```

Keep `docker-compose.yml`, `Caddyfile` and `deploy.sh` in the repo under `deploy/` and copy them to the VPS when they change (a small `scp` step or a manual update; they change rarely).

### 4.6 Releasing and rolling back

- **Normal release:** merge to `main` → CI passes → approve the `production` deployment in GitHub → live in about two minutes.
- **Automatic rollback:** `deploy.sh` restores the previous tag if the health check fails.
- **Manual rollback:** run the workflow again from an older commit (`workflow_dispatch`), or on the server: `cd /srv/meet && APP_TAG=<old-sha> docker compose up -d app`.
- **Database migrations:** run on app start (Drizzle). Make them additive (add columns and tables, do not drop) so a rollback to the previous image still works.

### 4.7 Operations

| Task | How |
|---|---|
| Logs | `docker compose logs -f app` (pino JSON) |
| Status | `GET /api/admin/status` with the Bearer token |
| Backups | The app writes `data/backups/booking-YYYY-MM-DD.db` nightly at 03:00 London and keeps `BACKUP_RETENTION_DAYS` (default 14). Copy that folder off the server with a host cron job (e.g. `rclone sync /srv/meet/data/backups remote:meet-backups`). Restore-test quarterly |
| Restore a backup | `docker compose stop app`, copy the chosen `backups/booking-<date>.db` over `data/booking.db` (delete `booking.db-wal` and `booking.db-shm`), then `docker compose start app` |
| Email problems | Jobs that keep failing are kept in the `jobs` table with `status = 'failed'` and `last_error`; logs show `Job failed` lines |
| Rotate `ADMIN_TOKEN` | Update `.env`, restart, give the new value to the CRM. (With a separate `ENCRYPTION_KEY`, Google does not need reconnecting.) |
| Rotate the iCloud link | Regenerate in iCloud, update `ICS_FEEDS` in `.env`, restart |
| Reconnect Google | Visit `/api/admin/connect` as the host and sign in again |
| Updates | Dependabot for npm and GitHub Actions; base image refreshed on each build |

### 4.8 Email with Amazon SES (London)

1. In the AWS console, switch to **Europe (London) eu-west-2** and open **Amazon SES**.
2. **Verify the domain** `capytech.co.uk` (Identities → Create identity → Domain) and add the DKIM CNAME records it shows to DNS. Add an SPF include (`include:amazonses.com`) and a DMARC record if the domain has none.
3. **Request production access** (Account dashboard → Request production access). Until approved, SES only sends to verified addresses.
4. Create **SMTP credentials** (SMTP settings → Create SMTP credentials) and put them in `/srv/meet/.env`:
   ```
   SMTP_HOST=email-smtp.eu-west-2.amazonaws.com
   SMTP_PORT=587
   SMTP_USER=<SMTP username>
   SMTP_PASS=<SMTP password>
   EMAIL_FROM=Jason at Capytech UK <meet@capytech.co.uk>
   ```
5. Restart the app and make a test booking; the confirmation should arrive within a few seconds.

Any SMTP provider works the same way (Brevo, Postmark, Mailgun EU): only these variables change.

### 4.9 Pre-launch deployment checklist

- [ ] VPS hardened (key-only SSH, firewall, automatic security updates)
- [ ] `/srv/meet/data` owned by uid 1000 and included in backups
- [ ] `.env` present, permissions `600`, no placeholder values
- [ ] Cloudflare: proxied, Full (strict), Turnstile keys set, WAF rate limit on `POST /api/book`
- [ ] Origin reachable only from Cloudflare
- [ ] Google OAuth consent screen set to Internal; redirect URI matches `BASE_URL`
- [ ] Free/busy sharing confirmed for every calendar; `/api/admin/status` shows no problems
- [ ] Test booking made, cancelled and rescheduled end to end
- [ ] Rollback tested once on staging
- [ ] Backup restore tested
- [ ] SES domain verified, production access granted, test confirmation email received
