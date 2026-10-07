import { DateTime } from 'luxon';
import { logger } from '@/lib/logger';

interface BankHolidayEvent {
  title: string;
  date: string; // YYYY-MM-DD
  notes: string;
  bunting: boolean;
}

interface BankHolidayResponse {
  'england-and-wales': {
    events: BankHolidayEvent[];
  };
}

let cachedHolidays: Set<string> | null = null;
let lastFetched: number = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function getUkBankHolidays(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedHolidays && now - lastFetched < CACHE_TTL_MS) {
    return cachedHolidays;
  }

  try {
    const res = await fetch('https://www.gov.uk/bank-holidays.json', {
      headers: { 'User-Agent': 'Meet-Capytech/1.0' },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch bank holidays: ${res.status}`);
    }

    const data: BankHolidayResponse = await res.json();
    const events = data['england-and-wales']?.events || [];

    cachedHolidays = new Set(events.map((e) => e.date));
    lastFetched = now;
    return cachedHolidays;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch UK Bank Holidays, returning empty set fallback');
    return cachedHolidays || new Set();
  }
}
