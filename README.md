# meet-capytech

Public booking service for Capytech UK. Offers time slots synced with Google Calendar and local rules.

> **Status:** booking, self-service and the admin/CRM API work (M1–M6). Launch hardening (M7: CI deploy, CSP, backups) is still open; see `docs/meet-capytech-documentation.md` §3.

## Prerequisites
- Node.js 24 LTS

## Local development
1. `cp .env.example .env` — the blank defaults work as-is.
2. `npm ci`
3. `npm run dev` → http://localhost:8080 (database migrations run on startup).

With nothing else configured, development books into the local SQLite database only: no Google
event is created and no CAPTCHA is shown. Set `MOCK_CALENDAR=1` to simulate one busy hour per day.
To try Google locally, fill in the Google variables plus `ADMIN_TOKEN` and `ENCRYPTION_KEY`, log in at
`/admin` and use “Connect Google”.

## Production
Production refuses to start without `BASE_URL`, `ADMIN_TOKEN` and `ENCRYPTION_KEY`, and it **fails
closed**: until Google is connected via `/admin`, no slots are offered.

**Docker on a single host (VPS):**
```bash
mkdir -p data && sudo chown 1000:1000 data   # the container runs as uid 1000
cp .env.example .env && chmod 600 .env       # fill in the [prod] values
docker compose up -d --build                 # serves on 127.0.0.1:8080; put Caddy/nginx in front for HTTPS
```
`docker-compose.yml` forces `NODE_ENV=production` and `DATA_DIR=/data` (the `./data` folder), whatever `.env` says.

**Without Docker:** `npm run build && npm start` (loads `.env`, serves on port 8080).

Strongly recommended: set both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` (the site key's hostname
list must include your domain). Without them the app logs a warning and bookings have no bot protection.

## Scripts
| Command | Action |
|---------|--------|
| `npm run dev` | Start development server |
| `npm run build` | Build standalone production app |
| `npm start` | Serve the standalone build on port 8080 |
| `npm test` | Run Vitest unit & integration suite |
| `npm run test:e2e` | Run Playwright E2E browser tests |
| `npm run typecheck` | Run strict TS compilation check |
