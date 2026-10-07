#!/usr/bin/env bash
set -euo pipefail

OUTPUT="codebase.md"
mkdir -p scripts

echo "Generating $OUTPUT for QA review..."
> "$OUTPUT"

echo "# Codebase Dump" >> "$OUTPUT"
echo -e "\n" >> "$OUTPUT"

git ls-files --cached --others --exclude-standard | \
  grep -v -e "package-lock.json" -e "yarn.lock" -e "pnpm-lock.yaml" \
          -e "\.png$" -e "\.ico$" -e "\.woff$" -e "\.svg$" \
          -e "\.db$" -e "\.sqlite$" -e "\.tsbuildinfo$" \
          -e "codebase.md" -e "codebase.txt" | \
  while read -r file; do
    if [ -f "$file" ]; then
      echo "### File: \`$file\`" >> "$OUTPUT"
      echo '````text' >> "$OUTPUT"
      cat "$file" >> "$OUTPUT"
      echo '````' >> "$OUTPUT"
      echo -e "\n" >> "$OUTPUT"
    fi
done

echo "Appending progress summaries..."

cat << 'SUMMARY' >> "$OUTPUT"
## Progress Summary: Milestone M1 (Foundation) Complete
* **Stack**: Next.js 15 (Standalone), Better-SQLite3, Drizzle ORM, Tailwind CSS v3, Zod 4, Vitest.
* **Environment**: Strict runtime validation via Zod (`src/env.ts`).
* **Database**: SQLite schema with migration sync on startup.
* **Testing**: Vitest suite with mocked environment variables and temporary test databases.
* **Docker/Deployment**: Multi-stage `node:24-slim` Dockerfile running as non-root user.

## Progress Summary: Milestone M2 (Availability Engine) Complete
* **Luxon Engine**: Pure slot generator enforcing working hours, buffers, minimum notice, and max advance days across DST transitions.
* **UK Bank Holidays**: Cached integration with GOV.UK API to block slots on official holidays.
* **iCal Adapter**: Standard `node-ical` + `rrule` recurring event parser storing busy ranges only.
* **Google FreeBusy Adapter**: 60-second in-memory caching with strict fail-closed policy (503 Service Unavailable if any feed fails).

## Progress Summary: Milestone M3 (Booking & Google Integration) Complete
* **Token Security**: AES-256-GCM encryption/decryption utility using separate `ENCRYPTION_KEY`.
* **Google OAuth Flow**: `/api/admin/connect` and `/api/admin/connect/callback` with single-use state validation.
* **Reserve-Then-Confirm Engine**: `POST /api/bookings` creates a pending SQLite reservation, creates Google Calendar event via `googleapis` with Meet/Zoom links, and performs automatic database rollback if Google API fails.
* **Anti-Abuse**: Cloudflare Turnstile token verification and per-IP/per-email rate limiting.

## Progress Summary: Milestone M4 (Guest Self-Service) Complete
* **Token Hashing**: Hashed manage tokens (`manage_token_hash`) via SHA-256 for public lookups.
* **Management Endpoints**:
  * `GET /api/manage/[token]`: Retrieves booking details and checks cutoff eligibility.
  * `POST /api/manage/[token]/cancel`: Deletes Google Calendar event and updates status to `cancelled`.
  * `POST /api/manage/[token]/reschedule`: Atomically reserves the new slot first before releasing the old slot and deleting old Google event.
* **Cutoff Safeguard**: Enforces a minimum 2-hour change notice period.

## Progress Summary: Milestone M5 & M6 (UI/UX & Admin Command Center) Complete
* **Admin Dashboard**: Built a responsive, high-density React dashboard (`/admin`) enforcing strict architectural/minimalist UI guidelines with custom scrollbars and WebGL backgrounds.
* **Telemetry & Analytics**: Integrated `recharts` for dynamic, zero-flatline area charts and SVG donut charts mapping status ratios.
* **Advanced Modals**: Utilized React Portals (`createPortal`) for full-screen and centered modals with `backdrop-blur-2xl` glassmorphism.
* **Reschedule Logic Validation**: Updated database schema to support the `rescheduled` status and fixed the backend API to correctly mark old reservations.
* **Mobile Responsiveness**: Implemented a slide-out mobile drawer menu, responsive data tables, and fluid typography.

## Progress Summary: Security Hardening B6 Complete
* **Webhook Integrity**: Added optional HMAC-SHA256 webhook signing with `X-Capytech-Signature`.
* **Secret Redaction**: Expanded Pino redaction for authorization headers, secret fields, webhook URLs, and feed URLs.
* **Admin OAuth Safety**: Removed query-string admin token authentication from `/api/admin/connect`.
* **Booking Concurrency**: Added an immediate SQLite transaction overlap guard to reject overlapping offset bookings.
* **Pending Reservation Hygiene**: Added a conservative stale-pending sweeper for abandoned reservations.
* **Webhook Resilience**: Added a strict 5-second timeout to outbound webhook dispatch.
* **Rollback Protection**: Added compensating Google Calendar deletion if a calendar event is created but database confirmation fails.

## Progress Summary: Milestone M7 (Final Polish & Optimization) Complete
* **Admin Session Security**: Replaced localStorage admin tokens with `httpOnly`, `SameSite=Strict` cookies and created `/api/admin/login` and `/api/admin/logout` routes.
* **Frontend Weight Reduction**: Segregated the 1.5MB 3D Canvas WebGL component into a Next.js `dynamic()` import with `ssr: false` to dramatically shrink the main bundle size.
* **ICS Cache Accuracy**: Re-engineered the node-ical parser to respect `EXDATE` and `STATUS:CANCELLED` flags, bounded it with a 5-minute SQLite cache layer (`busy_cache`), and added an `AbortSignal` timeout to fail-open dynamically.
* **Admin UI Polishing**: Added `minTickGap` and `preserveStartEnd` bounds to Recharts alongside explicit daily/monthly chart aggregation views for readable timeline rendering.
* **TS Strictness**: Handled undefined index accesses for Timezone lookup and corrected component data mapping for camelCase payloads, ensuring a 100% clean typecheck build.
* **E2E Playwright Suite**: Finalized automated booking flow validation and updated locators for strict uppercase case-matching.
SUMMARY

echo "Done! Codebase dumped to $OUTPUT"
