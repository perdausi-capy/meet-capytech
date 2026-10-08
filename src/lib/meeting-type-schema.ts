import { z } from 'zod';

/** Shared by the admin API and the admin form, so both validate the same way. */
export const meetingTypeInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2, 'At least 2 characters')
      .max(40)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers and single dashes only'),
    name: z.string().trim().min(2, 'Give it a name').max(80),
    description: z.string().trim().max(300),
    durationMinutes: z.number().int().min(5, 'At least 5 minutes').max(480),
    bufferBeforeMinutes: z.number().int().min(0).max(240),
    bufferAfterMinutes: z.number().int().min(0).max(240),
    locationKind: z.enum(['google_meet', 'zoom', 'phone', 'in_person', 'custom']),
    locationDetail: z.string().trim().max(300).nullable(),
    maxPerDay: z.number().int().min(1).max(50).nullable(),
    isPrivate: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if ((v.locationKind === 'in_person' || v.locationKind === 'custom') && !v.locationDetail) {
      ctx.addIssue({
        code: 'custom',
        path: ['locationDetail'],
        message: v.locationKind === 'in_person' ? 'Add the address' : 'Describe the location',
      });
    }
    if (v.locationKind === 'zoom' && v.locationDetail && !/^https:\/\//.test(v.locationDetail)) {
      ctx.addIssue({
        code: 'custom',
        path: ['locationDetail'],
        message: 'Use the full https:// link',
      });
    }
  });

export type MeetingTypeInputBody = z.infer<typeof meetingTypeInputSchema>;
