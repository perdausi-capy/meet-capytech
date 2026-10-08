import { vi } from 'vitest';

// Tests must not depend on the network: stub the GOV.UK bank-holiday lookup (no holidays).
// Tests that care about holidays pass their own set to the slot engine or spy on this module.
vi.mock('@/lib/calendars/bank-holidays', () => ({
  getUkBankHolidays: vi.fn(async () => new Set<string>()),
}));
