/**
 * §DAILY · 今日潮候 · Daily Tide Edition
 *
 * The platform has had 179+ echoes and thirteen chapters for a while; what it lacks is a reason
 * to come back tomorrow. This module is the deterministic spine of a daily bulletin:
 *
 * 1. A date picks one canon entry — never the whole bible, never an invented tale. The model
 *    only ever sees that one excerpt (same discipline as §CHAPTER-DIGEST).
 * 2. The AI reads it and writes three sentences plus one ponder question. Nothing about the
 *    rest of the canon is claimed; anything beyond the excerpt is invention and is rejected.
 * 3. One edition per (date, locale) per process; 24 h LRU. At most 2 provider calls a day —
 *    the token cost of keeping the whole platform feeling alive.
 *
 * Everything here is pure and unit-testable with zero provider involvement.
 */
import { BIBLE_CHAPTERS, BIBLE_ECHOES, type BibleChapter } from '@/world-bible/generated';

/** Epoch day number (UTC, 1970-01-01). Stable across timezones — same day, same leaf, worldwide. */
export function epochDay(dateIso: string): number {
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(t)) return 0;
  return Math.floor(t / 86_400_000);
}

/** All canon entries in a stable order (chapters first, then echoes). */
export const DAILY_ENTRIES: readonly BibleChapter[] = [...BIBLE_CHAPTERS, ...BIBLE_ECHOES];

export function entryIndexFor(dateIso: string, count: number = DAILY_ENTRIES.length): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const day = epochDay(dateIso);
  // Fold into [0, count) with a positive modulus (epoch days can be negative for pre-1970 dates).
  return ((day % count) + count) % count;
}

export function entryForDate(dateIso: string): BibleChapter | null {
  if (DAILY_ENTRIES.length === 0) return null;
  return DAILY_ENTRIES[entryIndexFor(dateIso)] ?? null;
}

/** `digest` accepts the model's three sentences; `ponder` requires the "Ponder: / 思考：" marker line. */
export interface EditionParse {
  digest: string;
  ponder: string;
}
export type EditionParseResult = { ok: true; value: EditionParse } | { ok: false; reason: string };

export function parseEditionOutput(raw: string, locale: 'zh' | 'en'): EditionParseResult {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, reason: 'empty' };
  if (text.length > 1600) return { ok: false, reason: 'too-long' };
  const marker = locale === 'en' ? /Ponder:\s*/i : /思考[:：]\s*/;
  const match = marker.exec(text);
  if (!match) return { ok: false, reason: 'missing-ponder' };
  const digest = text.slice(0, match.index).trim();
  const ponder = text.slice(match.index + match[0].length).trim();
  if (digest.length < 12) return { ok: false, reason: 'digest-too-short' };
  if (ponder.length < 6) return { ok: false, reason: 'ponder-too-short' };
  if (!/[?？]/.test(ponder)) return { ok: false, reason: 'ponder-not-question' };
  return { ok: true, value: { digest, ponder } };
}

export function editionKey(slug: string, locale: 'zh' | 'en', dateIso: string): string {
  // Not a cache key for cross-process use — the LRU is in-process per deployment.
  return `${dateIso}|${slug}|${locale}`;
}
