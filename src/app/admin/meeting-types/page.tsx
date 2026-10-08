'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  api,
  Badge,
  ConfirmDialog,
  Field,
  PageHeader,
  Panel,
  Segmented,
  Sheet,
  Switch,
  useToast,
} from '@/components/admin/ui';
import { LocationIcon } from '@/components/booking/LocationIcon';
import { meetingTypeInputSchema, type MeetingTypeInputBody } from '@/lib/meeting-type-schema';

type LocationKind = MeetingTypeInputBody['locationKind'];

interface AdminMeetingType extends MeetingTypeInputBody {
  id: string;
  status: 'active' | 'archived';
  sortOrder: number;
  bookingCount: number;
}

const LOCATIONS: { value: LocationKind; label: string }[] = [
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'phone', label: 'Phone' },
  { value: 'in_person', label: 'In person' },
  { value: 'custom', label: 'Other' },
];

const LOCATION_DETAIL: Record<
  LocationKind,
  { label: string; hint: string; placeholder: string } | null
> = {
  google_meet: null,
  zoom: {
    label: 'Zoom link',
    hint: 'Leave empty to use the ZOOM_LINK from the server settings.',
    placeholder: 'https://zoom.us/j/…',
  },
  phone: {
    label: 'Phone details',
    hint: 'Shown in the invite, e.g. the number guests should call.',
    placeholder: '+44 20 7946 0000',
  },
  in_person: {
    label: 'Address',
    hint: 'Shown in the invite.',
    placeholder: '1 Example Street, London',
  },
  custom: {
    label: 'Location',
    hint: 'Shown on the card and in the invite.',
    placeholder: 'Microsoft Teams (link to follow)',
  },
};

const DURATIONS = [15, 30, 45, 60, 90];

const EMPTY: MeetingTypeInputBody = {
  slug: '',
  name: '',
  description: '',
  durationMinutes: 30,
  bufferBeforeMinutes: 5,
  bufferAfterMinutes: 10,
  locationKind: 'google_meet',
  locationDetail: null,
  maxPerDay: null,
  isPrivate: false,
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

function locationText(t: Pick<MeetingTypeInputBody, 'locationKind' | 'locationDetail'>) {
  if (t.locationKind === 'custom' && t.locationDetail) return t.locationDetail;
  return LOCATIONS.find((l) => l.value === t.locationKind)?.label ?? 'Google Meet';
}

/* ---------------- Editor ---------------- */

function Editor({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminMeetingType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState<MeetingTypeInputBody>(initial ?? EMPTY);
  const [slugEdited, setSlugEdited] = useState(Boolean(initial));
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const slugLocked = Boolean(initial && initial.bookingCount > 0);

  const set = <K extends keyof MeetingTypeInputBody>(key: K, value: MeetingTypeInputBody[K]) =>
    setV((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'name' && !slugEdited) next.slug = slugify(String(value));
      return next;
    });

  const check = meetingTypeInputSchema.safeParse(v);
  const errors = touched && !check.success ? check.error.flatten().fieldErrors : {};
  const err = (k: keyof MeetingTypeInputBody) => errors[k]?.[0];
  const detail = LOCATION_DETAIL[v.locationKind];

  const save = async () => {
    setTouched(true);
    setServerError('');
    if (!check.success) return;
    setBusy(true);
    try {
      await api(initial ? `/api/admin/meeting-types/${initial.id}` : '/api/admin/meeting-types', {
        method: initial ? 'PUT' : 'POST',
        body: JSON.stringify(check.data),
      });
      toast('success', initial ? 'Meeting type saved.' : 'Meeting type created.');
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={initial ? `Edit “${initial.name}”` : 'New meeting type'}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-danger">{serverError}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary focus-ring">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className="btn-primary focus-ring">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-6">
        {/* Live preview of the guest card */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            How guests see it
          </p>
          <div className="tile p-5" aria-hidden>
            <p className="text-lg font-semibold text-ink">{v.name || 'Meeting name'}</p>
            <p className="mt-1 text-sm text-muted">{v.description || 'A short description.'}</p>
            <div className="mt-5 flex items-end justify-between">
              <p className="font-display text-5xl leading-none text-ink">
                {v.durationMinutes || '–'}
                <span className="ml-1.5 font-sans text-sm text-muted">min</span>
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
                <LocationIcon kind={v.locationKind} className="h-3.5 w-3.5" /> {locationText(v)}
              </span>
            </div>
          </div>
        </div>

        <Field label="Name" htmlFor="mt-name" error={err('name')}>
          <input
            id="mt-name"
            className="field"
            value={v.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Discovery call"
          />
        </Field>

        <Field
          label="Link name"
          htmlFor="mt-slug"
          error={err('slug')}
          hint={
            slugLocked
              ? 'Locked because this type has bookings (old links and emails use it).'
              : `Direct link: ${typeof window !== 'undefined' ? window.location.origin : ''}/?type=${v.slug || '…'}`
          }
        >
          <input
            id="mt-slug"
            className="field font-mono text-sm"
            value={v.slug}
            disabled={slugLocked}
            onChange={(e) => {
              setSlugEdited(true);
              set('slug', e.target.value.toLowerCase());
            }}
          />
        </Field>

        <Field label="Description" htmlFor="mt-desc" error={err('description')} optional>
          <textarea
            id="mt-desc"
            rows={2}
            className="field resize-none"
            value={v.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="What the meeting is for, in a sentence."
          />
        </Field>

        <Field label="Duration" error={err('durationMinutes')}>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Duration presets"
              value={DURATIONS.includes(v.durationMinutes) ? v.durationMinutes : -1}
              onChange={(m) => m > 0 && set('durationMinutes', m)}
              options={DURATIONS.map((m) => ({ value: m, label: `${m} min` }))}
            />
            <label className="flex items-center gap-2 text-sm text-ink-2">
              or
              <input
                type="number"
                min={5}
                max={480}
                className="field w-24 py-2"
                value={v.durationMinutes}
                onChange={(e) => set('durationMinutes', Number(e.target.value))}
                aria-label="Custom duration in minutes"
              />
              min
            </label>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Buffer before"
            htmlFor="mt-bb"
            error={err('bufferBeforeMinutes')}
            hint="Free time kept before each meeting."
          >
            <div className="flex items-center gap-2">
              <input
                id="mt-bb"
                type="number"
                min={0}
                max={240}
                className="field"
                value={v.bufferBeforeMinutes}
                onChange={(e) => set('bufferBeforeMinutes', Number(e.target.value))}
              />
              <span className="text-sm text-muted">min</span>
            </div>
          </Field>
          <Field
            label="Buffer after"
            htmlFor="mt-ba"
            error={err('bufferAfterMinutes')}
            hint="Free time kept after each meeting."
          >
            <div className="flex items-center gap-2">
              <input
                id="mt-ba"
                type="number"
                min={0}
                max={240}
                className="field"
                value={v.bufferAfterMinutes}
                onChange={(e) => set('bufferAfterMinutes', Number(e.target.value))}
              />
              <span className="text-sm text-muted">min</span>
            </div>
          </Field>
        </div>

        <Field label="Where it happens">
          <Segmented
            label="Location"
            value={v.locationKind}
            onChange={(k) => set('locationKind', k)}
            options={LOCATIONS.map((l) => ({
              value: l.value,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <LocationIcon kind={l.value} className="h-3.5 w-3.5" /> {l.label}
                </span>
              ),
            }))}
          />
        </Field>
        {detail && (
          <Field
            label={detail.label}
            htmlFor="mt-loc"
            hint={detail.hint}
            error={err('locationDetail')}
            optional={v.locationKind === 'zoom' || v.locationKind === 'phone'}
          >
            <input
              id="mt-loc"
              className="field"
              value={v.locationDetail ?? ''}
              placeholder={detail.placeholder}
              onChange={(e) => set('locationDetail', e.target.value || null)}
            />
          </Field>
        )}

        <div className="grid gap-5 rounded-2xl border border-hairline p-5">
          <Switch
            label="Limit bookings per day"
            description="Stop offering this type once a day has this many."
            checked={v.maxPerDay !== null}
            onChange={(on) => set('maxPerDay', on ? 3 : null)}
          />
          {v.maxPerDay !== null && (
            <Field label="Maximum per day" htmlFor="mt-max" error={err('maxPerDay')}>
              <input
                id="mt-max"
                type="number"
                min={1}
                max={50}
                className="field w-28"
                value={v.maxPerDay}
                onChange={(e) => set('maxPerDay', Number(e.target.value))}
              />
            </Field>
          )}
          <Switch
            label="Private (link only)"
            description="Hidden from the booking page. Only people with the direct link can book it."
            checked={v.isPrivate}
            onChange={(on) => set('isPrivate', on)}
          />
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- Page ---------------- */

export default function MeetingTypesPage() {
  const toast = useToast();
  const [types, setTypes] = useState<AdminMeetingType[] | null>(null);
  const [editing, setEditing] = useState<AdminMeetingType | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{
    type: AdminMeetingType;
    action: 'archive' | 'delete';
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ meetingTypes: AdminMeetingType[] }>('/api/admin/meeting-types');
      setTypes(r.meetingTypes);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not load meeting types.');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => (types ?? []).filter((t) => t.status === 'active'), [types]);
  const archived = useMemo(() => (types ?? []).filter((t) => t.status === 'archived'), [types]);

  const move = async (index: number, delta: number) => {
    const next = [...active];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    setTypes([...next, ...archived]);
    try {
      await api('/api/admin/meeting-types/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids: [...next, ...archived].map((t) => t.id) }),
      });
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not reorder.');
      void load();
    }
  };

  const setStatus = async (t: AdminMeetingType, status: 'active' | 'archived') => {
    setBusy(true);
    try {
      await api(`/api/admin/meeting-types/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast(
        'success',
        status === 'archived' ? `“${t.name}” archived.` : `“${t.name}” is bookable again.`,
      );
      setConfirm(null);
      await load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not update.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: AdminMeetingType) => {
    setBusy(true);
    try {
      await api(`/api/admin/meeting-types/${t.id}`, { method: 'DELETE' });
      toast('success', `“${t.name}” deleted.`);
      setConfirm(null);
      await load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not delete.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (t: AdminMeetingType) => {
    await navigator.clipboard
      .writeText(`${window.location.origin}/?type=${t.slug}`)
      .catch(() => {});
    setCopied(t.id);
    setTimeout(() => setCopied(null), 1600);
  };

  const row = (t: AdminMeetingType, index: number, list: AdminMeetingType[]) => (
    <li
      key={t.id}
      className="flex flex-col gap-4 rounded-[1.25rem] border border-hairline bg-card-solid p-5 sm:flex-row sm:items-center"
    >
      {/* Phones: arrows and duration share one row. */}
      <div className="flex items-center gap-4 sm:contents">
        {t.status === 'active' && (
          <div className="flex shrink-0 gap-1 sm:flex-col">
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={`Move ${t.name} up`}
              className="icon-btn focus-ring h-8 w-8"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === list.length - 1}
              aria-label={`Move ${t.name} down`}
              className="icon-btn focus-ring h-8 w-8"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex shrink-0 items-baseline gap-1 sm:w-24">
          <span className="font-display text-4xl leading-none text-ink">{t.durationMinutes}</span>
          <span className="text-sm text-muted">min</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{t.name}</p>
          {t.isPrivate && (
            <Badge tone="brand">
              <EyeOff className="h-3 w-3" /> Private
            </Badge>
          )}
          {t.maxPerDay && <Badge>Max {t.maxPerDay}/day</Badge>}
          {t.status === 'archived' && <Badge tone="warning">Archived</Badge>}
        </div>
        {t.description && <p className="mt-1 truncate text-sm text-muted">{t.description}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1">
            <LocationIcon kind={t.locationKind} className="h-3.5 w-3.5" /> {locationText(t)}
          </span>
          <span className="font-mono">/?type={t.slug}</span>
          <span>
            {t.bookingCount} booking{t.bookingCount === 1 ? '' : 's'}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {t.status === 'active' ? (
          <>
            <button
              type="button"
              onClick={() => copyLink(t)}
              className="btn-secondary focus-ring px-3 py-2 text-sm"
            >
              {copied === t.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === t.id ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(t)}
              className="btn-secondary focus-ring px-3 py-2 text-sm"
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              type="button"
              onClick={() =>
                setConfirm({ type: t, action: t.bookingCount > 0 ? 'archive' : 'delete' })
              }
              aria-label={t.bookingCount > 0 ? `Archive ${t.name}` : `Delete ${t.name}`}
              className="icon-btn focus-ring h-10 w-10 hover:!border-danger hover:!text-danger"
            >
              {t.bookingCount > 0 ? (
                <Archive className="h-4 w-4" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setStatus(t, 'active')}
            className="btn-secondary focus-ring px-3 py-2 text-sm"
          >
            <ArchiveRestore className="h-4 w-4" /> Restore
          </button>
        )}
      </div>
    </li>
  );

  return (
    <>
      <PageHeader
        eyebrow="Meeting types"
        title={
          <>
            What guests can <em className="text-brand">book.</em>
          </>
        }
        description="The order here is the order on the booking page. Private types only show up through their direct link."
        actions={
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="btn-primary focus-ring"
          >
            <Plus className="h-4 w-4" /> New meeting type
          </button>
        }
      />

      {!types ? (
        <div className="grid gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-28 rounded-[1.25rem]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-8">
          <ul className="grid gap-3">{active.map((t, i) => row(t, i, active))}</ul>
          {archived.length > 0 && (
            <Panel
              title="Archived"
              description="Not bookable. Guests who already booked these can still view and reschedule."
            >
              <ul className="grid gap-3">{archived.map((t, i) => row(t, i, archived))}</ul>
            </Panel>
          )}
        </div>
      )}

      {editing && (
        <Editor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        busy={busy}
        tone="danger"
        title={
          confirm?.action === 'delete'
            ? `Delete “${confirm.type.name}”?`
            : `Archive “${confirm?.type.name}”?`
        }
        body={
          confirm?.action === 'delete'
            ? 'It has never been booked, so it will be removed completely.'
            : 'It will disappear from the booking page. Existing bookings keep working, and you can restore it any time.'
        }
        confirmLabel={confirm?.action === 'delete' ? 'Delete' : 'Archive'}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          confirm &&
          (confirm.action === 'delete' ? remove(confirm.type) : setStatus(confirm.type, 'archived'))
        }
      />
    </>
  );
}
