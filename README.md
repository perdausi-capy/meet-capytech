# meet-capytech

Public booking service for Capytech UK. Offers time slots synced with Google Calendar and local rules.

> **Note:** System is fully operational (M6/M7). Slot logic, guest UI, and secure admin interfaces are live.

## Prerequisites
- Node.js 24 LTS

## Local Setup
1. `cp .env.example .env`
2. Generate secure secrets: `openssl rand -hex 16` for ADMIN_TOKEN and `openssl rand -hex 32` for ENCRYPTION_KEY.
3. `npm ci`
4. `npm run dev` (Runs DB migrations automatically on startup)

## Scripts
| Command | Action |
|---------|--------|
| `npm run dev` | Start development server |
| `npm run build` | Build standalone production app |
| `npm start` | Serve standalone build on port 8080 |
| `npm test` | Run Vitest unit & integration suite |
| `npm run test:e2e` | Run Playwright E2E browser tests |
| `npm run typecheck` | Run strict TS compilation check |
