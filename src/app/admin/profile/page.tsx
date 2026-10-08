'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { ImagePlus, Loader2, Trash2, ZoomIn } from 'lucide-react';
import { api, Field, PageHeader, Panel, useToast } from '@/components/admin/ui';
import { Portrait } from '@/components/booking/Hero';
import type { PublicProfile } from '@/lib/use-public-config';

/* ---------------- Photo cropper ---------------- */

// Same 4:5 frame as the booking page portrait.
const OUT_W = 800;
const OUT_H = 1000;
const FRAME_W = 240;
const FRAME_H = 300;

function PhotoCropper({
  file,
  onCancel,
  onCropped,
  busy,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
  busy: boolean;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    // Ignore a superseded load (its URL is revoked on cleanup, which makes it "fail").
    let current = true;
    image.onload = () => current && setImg(image);
    image.onerror = () => current && setError('That file couldn’t be opened as an image.');
    image.src = url;
    return () => {
      current = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // "Cover" scale for the frame, times the zoom.
  const scale = img ? Math.max(FRAME_W / img.width, FRAME_H / img.height) * zoom : 1;
  const drawnW = img ? img.width * scale : 0;
  const drawnH = img ? img.height * scale : 0;

  // Keep the image covering the frame: no gaps at the edges.
  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.min(0, Math.max(FRAME_W - drawnW, x)),
      y: Math.min(0, Math.max(FRAME_H - drawnH, y)),
    }),
    [drawnW, drawnH],
  );

  // Centre when the image loads; re-clamp when zooming.
  useEffect(() => {
    if (img) setOffset(clamp((FRAME_W - drawnW) / 2, (FRAME_H - drawnH) / 2));
  }, [img]);
  useEffect(() => setOffset((o) => clamp(o.x, o.y)), [zoom, clamp]);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setOffset(
      clamp(
        drag.current.ox + e.clientX - drag.current.x,
        drag.current.oy + e.clientY - drag.current.y,
      ),
    );
  };
  const onUp = () => {
    drag.current = null;
  };

  const crop = () => {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const k = OUT_W / FRAME_W;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, offset.x * k, offset.y * k, drawnW * k, drawnH * k);
    canvas.toBlob(
      (blob) => {
        if (blob && blob.type === 'image/webp') return onCropped(blob);
        // Browsers without WebP encoding: fall back to JPEG.
        canvas.toBlob((jpeg) => jpeg && onCropped(jpeg), 'image/jpeg', 0.9);
      },
      'image/webp',
      0.9,
    );
  };

  return (
    <div className="flex flex-col items-center gap-5">
      {error ? (
        <p className="text-sm font-medium text-danger">{error}</p>
      ) : (
        <>
          <div
            className="relative cursor-grab touch-none overflow-hidden rounded-[2rem] border border-hairline bg-brand-soft active:cursor-grabbing"
            style={{ width: FRAME_W, height: FRAME_H }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            role="img"
            aria-label="Photo crop preview. Drag to reposition."
          >
            {img && (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL
              <img
                src={img.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ left: offset.x, top: offset.y, width: drawnW, height: drawnH }}
              />
            )}
          </div>
          <label className="flex w-full max-w-xs items-center gap-3 text-sm text-ink-2">
            <ZoomIn className="h-4 w-4 shrink-0" />
            <span className="sr-only">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[var(--g-brand)]"
            />
          </label>
          <p className="text-xs text-muted">Drag to position, use the slider to zoom.</p>
        </>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-secondary focus-ring"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={crop}
          disabled={!img || busy}
          className="btn-primary focus-ring"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Use this photo
        </button>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */

export default function ProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [form, setForm] = useState({ name: '', title: '', company: '', bio: '' });
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ profile: PublicProfile }>('/api/admin/profile')
      .then(({ profile: p }) => {
        setProfile(p);
        setForm({ name: p.name, title: p.title, company: p.company, bio: p.bio });
      })
      .catch((e: Error) => toast('error', e.message));
  }, [toast]);

  const dirty =
    profile !== null &&
    (form.name !== profile.name ||
      form.title !== profile.title ||
      form.company !== profile.company ||
      form.bio !== profile.bio);

  const save = async () => {
    if (!form.name.trim()) return toast('error', 'Name is required.');
    setSaving(true);
    try {
      const r = await api<{ profile: PublicProfile }>('/api/admin/profile', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setProfile(r.profile);
      toast('success', 'Profile saved. The booking page is updated.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (blob: Blob) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('photo', blob, 'photo');
      const r = await api<{ profile: PublicProfile }>('/api/admin/profile/photo', {
        method: 'POST',
        body,
      });
      setProfile(r.profile);
      setFile(null);
      toast('success', 'Photo updated.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not upload the photo.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    try {
      const r = await api<{ profile: PublicProfile }>('/api/admin/profile/photo', {
        method: 'DELETE',
      });
      setProfile(r.profile);
      toast('success', 'Photo removed.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not remove the photo.');
    }
  };

  if (!profile) {
    return <div className="skeleton h-96 rounded-[1.75rem]" aria-busy="true" />;
  }

  const preview: PublicProfile = { ...profile, ...form };

  return (
    <>
      <PageHeader
        eyebrow="Profile"
        title={
          <>
            How guests <em className="text-brand">meet you.</em>
          </>
        }
        description="Your photo, name and introduction at the top of the booking page."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel
          title="Photo"
          description="A portrait works best. It’s cropped to the 4:5 frame on the booking page."
        >
          {file ? (
            <PhotoCropper
              file={file}
              busy={uploading}
              onCancel={() => setFile(null)}
              onCropped={upload}
            />
          ) : (
            <div className="flex flex-col items-center gap-5">
              <Portrait profile={preview} className="aspect-[4/5] w-60" />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="btn-primary focus-ring"
                >
                  <ImagePlus className="h-4 w-4" />{' '}
                  {profile.avatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
                {profile.avatarUrl && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="btn-secondary focus-ring hover:!border-danger hover:!text-danger"
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">
                JPEG, PNG or WebP. Until you add one, a branded initial is shown.
              </p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
              e.target.value = '';
            }}
          />
        </Panel>

        <Panel title="Details">
          <div className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" htmlFor="p-name" hint="Shown as “Meet with …”.">
                <input
                  id="p-name"
                  className="field"
                  maxLength={60}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Title" htmlFor="p-title" optional>
                <input
                  id="p-title"
                  className="field"
                  maxLength={60}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Company" htmlFor="p-company" optional>
              <input
                id="p-company"
                className="field"
                maxLength={80}
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </Field>
            <Field label="Introduction" htmlFor="p-bio" hint={`${form.bio.length}/400`}>
              <textarea
                id="p-bio"
                rows={4}
                maxLength={400}
                className="field resize-none"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </Field>

            <div className="rounded-2xl border border-hairline bg-canvas p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Preview
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                {[preview.title, preview.company].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-1 font-display text-4xl leading-none text-ink">
                Meet with <em className="text-brand">{preview.name || '…'}.</em>
              </p>
              <p className="mt-3 text-sm text-ink-2">{preview.bio}</p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="btn-primary focus-ring"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save profile
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
