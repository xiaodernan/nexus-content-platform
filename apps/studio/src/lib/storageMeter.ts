/**
 * M5 v185 — the save area's QUOTA METER.
 *
 * v180 taught the store to refuse a full quota with a sentence; v185 gives the save area the numbers
 * that sentence is about. Two facts, each owned by whoever can actually measure it:
 *
 * * The store's own footprint — how many saves and how many chars the namespace holds. This is
 *   MEASURED: `footprintOf` sums the per-save sizes the decorated listing already pulled across the
 *   seam. The store's own rule stands (`list()` reads no bytes — a menu that costs O(total bytes) is
 *   the wrong seam); the meter is the caller that pays the cost ON PURPOSE, because a meter that
 *   guesses would be a decoration.
 * * The origin's usage — what `navigator.storage.estimate()` reports. The browser owns this number,
 *   it covers EVERY storage API on the origin (not just localStorage), and it is an estimate; the
 *   label says so. Where the browser exposes no estimate, or answers without numbers, the meter says
 *   so instead of inventing one (§60).
 *
 * The unit is CHARS, not bytes: the measured figure is a JS string's `length` (UTF-16 code units) —
 * the same unit localStorage quotas are counted in. "bytes" would be a claim about encodings this
 * module does not make.
 */

/** What one decorated listing entry says about its file. `chars` is absent when the file could not be
 *  read — the footprint sums what was measured and counts the saves as listed. */
export interface FootprintEntry {
  chars?: number;
}

export interface StoreFootprint {
  saves: number;
  chars: number;
}

/** Sum the listing into a footprint. Unreadable entries stay in the save COUNT (they are listed) and
 *  contribute nothing to the chars total — a meter that invented a size would be a lie with digits. */
export function footprintOf(entries: FootprintEntry[]): StoreFootprint {
  let chars = 0;
  for (const entry of entries) {
    if (typeof entry.chars === 'number' && Number.isFinite(entry.chars)) chars += entry.chars;
  }
  return { saves: entries.length, chars };
}

/** The store line, with the namespace named so two stores never read as one. */
export function formatFootprint(footprint: StoreFootprint, namespace: string): string {
  const noun = footprint.saves === 1 ? 'save' : 'saves';
  return `${footprint.saves} ${noun} · ${footprint.chars} chars in '${namespace}'`;
}

/** One decimal, 1024-based units, engine-neutral — the framing the browser's own quota numbers use. */
export function formatBytes(n: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** The browser's own answer about the ORIGIN. Each half is optional because engines differ; a missing
 *  half is reported as unknown, never guessed. */
export type OriginStorageEstimateView =
  | { kind: 'unavailable' }
  | { kind: 'estimate'; usage: number | null; quota: number | null };

/** The structural slice of `navigator` the meter needs — small enough for every test fake. */
export type StorageEstimateHost = {
  storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> };
};

/** Ask the host for its origin estimate. No host, no `storage`, no `estimate`, or an estimate that
 *  throws all answer `unavailable` — a meter that crashed on a missing capability would be a meter
 *  that only works where it is not needed. */
export async function originStorageEstimate(host: StorageEstimateHost | undefined): Promise<OriginStorageEstimateView> {
  const storage = host?.storage;
  const estimate = storage?.estimate;
  if (!storage || typeof estimate !== 'function') return { kind: 'unavailable' };
  try {
    const raw = await estimate.call(storage);
    return {
      kind: 'estimate',
      usage: typeof raw?.usage === 'number' && Number.isFinite(raw.usage) ? raw.usage : null,
      quota: typeof raw?.quota === 'number' && Number.isFinite(raw.quota) ? raw.quota : null,
    };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** The meter's reading, 0..100, or `null` when it cannot be computed honestly — a missing half, or a
 *  zero quota (dividing by it invents a number). The bar renders only when this is a number. */
export function quotaPct(view: OriginStorageEstimateView | null): number | null {
  if (!view || view.kind !== 'estimate' || view.usage === null || view.quota === null) return null;
  if (view.quota <= 0) return null;
  return Math.min(100, Math.max(0, (view.usage / view.quota) * 100));
}

/** The origin line. Every branch names what the browser actually said — including "nothing usable". */
export function formatOriginEstimate(view: OriginStorageEstimateView | null): string {
  if (!view || view.kind === 'unavailable') {
    return 'origin: the browser exposes no storage estimate here';
  }
  const tag = 'browser estimate, all storage APIs';
  const { usage, quota } = view;
  if (usage === null && quota === null) {
    return `origin: the browser's estimate carried no numbers (${tag})`;
  }
  if (usage !== null && quota !== null) {
    const pct = quotaPct(view);
    return `origin ≈ ${formatBytes(usage)} of ${formatBytes(quota)} used (${pct === null ? 'unknown %' : `${pct.toFixed(2)}%`}, ${tag})`;
  }
  if (usage !== null) {
    return `origin ≈ ${formatBytes(usage)} used (quota unknown, ${tag})`;
  }
  return `origin: quota ${quota === null ? 'unknown' : formatBytes(quota)} (usage unknown, ${tag})`;
}
