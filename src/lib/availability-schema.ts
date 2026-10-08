import { z } from 'zod';
import { IANAZone } from 'luxon';

/** Shared by the admin availability page, its API and the CRM config API. */

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 09:00');

const window = z
  .object({ start: hhmm, end: hhmm })
  .refine((w) => w.start < w.end, { message: 'The end time must be after the start time' });

/** A day's windows: valid, at most 6, and not overlapping each other. */
export const dayWindows = z
  .array(window)
  .max(6, 'Up to 6 time ranges per day')
  .superRefine((windows, ctx) => {
    const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.start < sorted[i - 1]!.end) {
        ctx.addIssue({ code: 'custom', message: 'Time ranges on the same day overlap' });
        return;
      }
    }
  });

export const weeklyHoursSchema = z
  .object({
    monday: dayWindows,
    tuesday: dayWindows,
    wednesday: dayWindows,
    thursday: dayWindows,
    friday: dayWindows,
    saturday: dayWindows,
    sunday: dayWindows,
  })
  .strict();

export const timezoneSchema = z
  .string()
  .refine((tz) => IANAZone.isValidZone(tz), { message: 'Unknown IANA time zone' });

/** The complete rule set edited on the availability page. */
export const availabilityRulesSchema = z
  .object({
    timezone: timezoneSchema,
    minNoticeHours: z
      .number()
      .min(0)
      .max(24 * 90),
    maxAdvanceDays: z.number().int().min(1).max(365),
    slotIntervalMinutes: z.number().int().min(5).max(240),
    maxMeetingsPerDay: z.number().int().min(1).max(50).nullable(),
    workingHours: weeklyHoursSchema,
  })
  .strict();

export type AvailabilityRules = z.infer<typeof availabilityRulesSchema>;

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Closing a day or range of days, or setting special hours for them. */
export const overrideInputSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    kind: z.enum(['closed', 'custom']),
    windows: dayWindows,
    note: z.string().trim().max(120).nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.to < v.from)
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The end date is before the start date',
      });
    const days = (Date.parse(`${v.to}T12:00:00Z`) - Date.parse(`${v.from}T12:00:00Z`)) / 86_400_000;
    if (days > 92)
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'Up to 3 months at a time' });
    if (v.kind === 'custom' && v.windows.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['windows'], message: 'Add at least one time range' });
    }
  });

export type OverrideInput = z.infer<typeof overrideInputSchema>;
