'use client';

import { useMemo } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { zoneOffsetLabel } from '@/lib/time-format';

function allZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

export function TimezoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (tz: string) => void;
}) {
  const options = useMemo(
    () =>
      allZones(value).map((tz) => ({
        tz,
        label: `${tz.replace(/_/g, ' ')} (${zoneOffsetLabel(tz)})`,
      })),
    [value],
  );

  return (
    <label className="relative inline-flex max-w-full items-center gap-2 rounded-full border border-hairline bg-card-solid py-2 pl-3 pr-9 text-sm text-ink-2 transition-colors focus-within:border-brand hover:border-brand">
      <Globe className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      <span className="sr-only">Time zone</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.tz} value={o.tz}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="truncate font-medium">
        {options.find((o) => o.tz === value)?.label ?? value}
      </span>
      <ChevronDown
        className="pointer-events-none absolute right-3 h-4 w-4 text-muted"
        aria-hidden
      />
    </label>
  );
}
