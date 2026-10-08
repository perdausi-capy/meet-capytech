# Meet-Capytech API Documentation

## Authentication & Security

Administrative endpoints (`/api/admin/*`) require **Bearer Token Authentication**:
```
Authorization: Bearer <ADMIN_API_KEY>
```

* Unauthenticated or invalid requests return `401 Unauthorized`.
* Constant-time comparison (`crypto.timingSafeEqual`) is enforced to protect against timing attacks.

---

## 1. Public Endpoints

### `GET /api/health`
Checks system, database, and application health.

* **Headers**: None
* **Response `200 OK`**:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-10-05T15:00:00.000Z"
}
```

### `GET /api/slots`
Generates real-time available booking slots for a specified date and meeting type, taking into account working hours, DST transitions, UK bank holidays, buffer periods, and Google Calendar FreeBusy state.

* **Query Parameters**:
  * `date` (required): Date string in `YYYY-MM-DD` format (e.g. `2026-11-10`).
  * `type` (required): Meeting type slug (e.g. `intro`, `tech`).
* **Response `200 OK`**:
```json
{
  "date": "2026-11-10",
  "type": "intro",
  "slots": [
    {
      "startsAt": "2026-11-10T09:00:00.000Z",
      "endsAt": "2026-11-10T09:15:00.000Z"
    },
    {
      "startsAt": "2026-11-10T09:15:00.000Z",
      "endsAt": "2026-11-10T09:30:00.000Z"
    }
  ]
}
```

### `POST /api/bookings`
Executes a transactional reserve-then-confirm booking flow. Creates a pending SQLite reservation, creates a Google Calendar event with Meet/Zoom details, and confirms the record. Performs an automatic database rollback if the Google API call fails.

* **Request Body**:
```json
{
  "meetingType": "intro",
  "date": "2026-11-10",
  "startTime": "2026-11-10T09:00:00.000Z",
  "name": "Jane Guest",
  "email": "jane@example.com",
  "notes": "Introductory discovery call",
  "turnstileToken": "0.123456789... (optional)"
}
```
* **Response `201 Created`**:
```json
{
  "success": true,
  "bookingId": "85ec7967-ba43-4d9d-943e-5cef53a9f0a6",
  "manageToken": "f32b7495-84e3-4643-a66a-ff2a297c2824",
  "meetLink": "[https://meet.google.com/abc-defg-hij](https://meet.google.com/abc-defg-hij)"
}
```
* **Error Responses**:
  * `400 Bad Request`: Validation failure or CAPTCHA failure.
  * `409 Conflict`: Slot is already reserved or unavailable.
  * `429 Too Many Requests`: Rate limit exceeded (per IP/email).
  * `502 Bad Gateway`: Google Calendar creation failed (reservation rolled back).

---

## 2. Guest Self-Service Endpoints

### `GET /api/manage/[token]`
Retrieves booking summary details using a raw manage token (hashed via SHA-256 for lookup) and determines if modifications are allowed based on the 2-hour cutoff rule.

* **Response `200 OK`**:
```json
{
  "id": "85ec7967-ba43-4d9d-943e-5cef53a9f0a6",
  "typeSlug": "intro",
  "startsAt": "2026-11-10T09:00:00.000Z",
  "endsAt": "2026-11-10T09:15:00.000Z",
  "name": "Jane Guest",
  "email": "jane@example.com",
  "notes": "Introductory discovery call",
  "status": "confirmed",
  "canModify": true
}
```

### `POST /api/manage/[token]/cancel`
Cancels a booking, updates SQLite status to `cancelled`, and removes the calendar event from Google Calendar.

* **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Booking successfully cancelled"
}
```
* **Error Response `400 Bad Request`**: Returned if cancellation is requested less than 2 hours before start time.

### `POST /api/manage/[token]/reschedule`
Reserves a new time slot first before cancelling the old booking, guaranteeing the guest never loses their original appointment if the new slot selection fails.

* **Request Body**:
```json
{
  "date": "2026-11-10",
  "startTime": "2026-11-10T11:00:00.000Z"
}
```
* **Response `200 OK`**:
```json
{
  "success": true,
  "bookingId": "96703bff-4a41-407a-bfc3-6077215fca57",
  "manageToken": "4ba36258-85fb-4c5e-9ce6-31ffb25c5011",
  "meetLink": "[https://meet.google.com/xyz-uvwx-rst](https://meet.google.com/xyz-uvwx-rst)"
}
```

---

## 3. Host Administration Endpoints

### `GET /api/admin/status`
Inspects Google OAuth connection health, access token status, and Google FreeBusy service status.

* **Headers**: `Authorization: Bearer <ADMIN_API_KEY>`
* **Response `200 OK`**:
```json
{
  "status": "ok",
  "timestamp": "2026-10-05T15:00:00.000Z",
  "googleCalendar": {
    "connected": true,
    "email": "host@capytech.com",
    "tokenExpired": false,
    "expiresAt": "2026-10-05T16:00:00.000Z"
  },
  "freeBusyService": {
    "lastCheckAt": "2026-10-05T14:59:00.000Z",
    "lastError": null,
    "totalErrorsLogged": 0
  }
}
```

### `GET /api/admin/bookings`
Queries historical, active, or cancelled bookings with ISO UTC timestamp filtering and offset pagination.

* **Headers**: `Authorization: Bearer <ADMIN_API_KEY>`
* **Query Parameters**:
  * `since` (optional): Filter bookings starting on or after an ISO UTC timestamp (e.g. `2026-10-01T00:00:00.000Z`).
  * `status` (optional): Filter by `confirmed`, `pending`, or `cancelled`.
  * `limit` (optional): Number of records (1–100, default `50`).
  * `offset` (optional): Pagination offset (default `0`).
* **Response `200 OK`**:
```json
{
  "total": 1,
  "limit": 50,
  "offset": 0,
  "bookings": [
    {
      "id": "85ec7967-ba43-4d9d-943e-5cef53a9f0a6",
      "typeSlug": "intro",
      "status": "confirmed",
      "startsAt": "2026-11-10T09:00:00.000Z",
      "endsAt": "2026-11-10T09:15:00.000Z",
      "name": "Jane Guest",
      "email": "jane@example.com",
      "notes": "Introductory discovery call",
      "eventId": "google-event-id-123",
      "createdAt": "2026-10-05T15:00:00.000Z",
      "updatedAt": "2026-10-05T15:00:00.000Z"
    }
  ]
}
```

### `GET /api/admin/config`
Retrieves current runtime availability settings.

* **Headers**: `Authorization: Bearer <ADMIN_API_KEY>`
* **Response `200 OK`**: Returns current configuration object.

### `POST /api/admin/config`
Updates runtime parameters for working hours, buffers, meeting types, minimum notice hours, and maximum advance days.

* **Headers**: `Authorization: Bearer <ADMIN_API_KEY>`
* **Request Body**:
```json
{
  "minNoticeHours": 4,
  "workingHours": {
    "start": "09:00",
    "end": "17:00",
    "timezone": "Europe/London"
  },
  "meetingTypes": {
    "intro": {
      "name": "15 Min Discovery Call",
      "durationMinutes": 15,
      "bufferBeforeMinutes": 5,
      "bufferAfterMinutes": 10
    }
  }
}
```

### Admin app endpoints

All require the admin session cookie (set by `POST /api/admin/login`) or `Authorization: Bearer <ADMIN_TOKEN>`.

| Method & path | Purpose |
|---|---|
| `GET /api/admin/overview` | Dashboard data: today's agenda, stats (with previous-period comparisons), upcoming, recent changes, system health |
| `GET /api/admin/activity?view=day\|month\|year&date=YYYY-MM-DD` | Meetings by start time in the host time zone (per hour / day / month), split by status, with totals and a per-type breakdown |
| `GET /api/admin/meeting-types` | All meeting types (including archived) with booking counts |
| `POST /api/admin/meeting-types` | Create a type (see field list below) |
| `PUT /api/admin/meeting-types/{id}` | Update a type. The `slug` can't change once the type has bookings (409) |
| `PATCH /api/admin/meeting-types/{id}` | `{ "status": "archived" \| "active" }`. The last active type can't be archived |
| `DELETE /api/admin/meeting-types/{id}` | Delete a never-booked type (409 if it has bookings: archive instead) |
| `POST /api/admin/meeting-types/reorder` | `{ "ids": [...] }` in display order |
| `GET/PUT /api/admin/profile` | Host name, title, company, bio |
| `POST/DELETE /api/admin/profile/photo` | Upload (multipart field `photo`: JPEG/PNG/WebP, max 3 MB, checked by content) or remove the host photo |

Meeting type fields: `slug` (lowercase, dashes), `name`, `description`, `durationMinutes` (5–480),
`bufferBeforeMinutes`, `bufferAfterMinutes` (0–240), `locationKind` (`google_meet` · `zoom` · `phone` ·
`in_person` · `custom`), `locationDetail` (required for `in_person`/`custom`), `maxPerDay` (null or 1–50),
`isPrivate`.

`POST /api/admin/config` still accepts `meetingTypes` for CRM compatibility: the set is upserted by slug and
active types missing from it are archived. It also accepts `maxMeetingsPerDay` (null or 1–50).

Public: `GET /api/profile/photo` serves the host photo; `GET /api/config?type=<slug>` includes a private type
when its direct link is opened; `GET /api/availability?type&month&tz` returns a month of slots by guest date.

---

## 4. Webhook Events (CRM Integration)

Outbound HTTP `POST` requests dispatched to `WEBHOOK_URL` when configured:

```json
{
  "event": "booking.created",
  "timestamp": "2026-10-05T15:00:00.000Z",
  "booking": {
    "id": "85ec7967-ba43-4d9d-943e-5cef53a9f0a6",
    "typeSlug": "intro",
    "status": "confirmed",
    "startsAt": "2026-11-10T09:00:00.000Z",
    "endsAt": "2026-11-10T09:15:00.000Z",
    "name": "Jane Guest",
    "email": "jane@example.com",
    "notes": "Introductory discovery call"
  }
}
```

Supported event types: `booking.created`, `booking.cancelled`, `booking.rescheduled`.
