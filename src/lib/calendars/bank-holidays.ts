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

let cachedEvents: BankHolidayEvent[] | null = null;
let lastFetched: number = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** England & Wales bank holidays (date + title), cached for a day. */
export async function getUkBankHolidayEvents(): Promise<{ date: string; title: string }[]> {
  const now = Date.now();
  if (cachedEvents && now - lastFetched < CACHE_TTL_MS) {
    return cachedEvents;
  }

  try {
    const res = await fetch('https://www.gov.uk/bank-holidays.json', {
      headers: { 'User-Agent': 'Meet-Capytech/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch bank holidays: ${res.status}`);
    }

    const data: BankHolidayResponse = await res.json();
    cachedEvents = data['england-and-wales']?.events || [];
    lastFetched = now;
    return cachedEvents;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch UK Bank Holidays, returning empty set fallback');
    return cachedEvents || [];
  }
}

export async function getUkBankHolidays(): Promise<Set<string>> {
  return new Set((await getUkBankHolidayEvents()).map((e) => e.date));
}
