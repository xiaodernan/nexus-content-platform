'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/i18n';

const STORAGE_KEY = 'nexus-guide-reading-v1';

function storedAnchors(anchors: readonly string[]): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(anchors);
    return [...new Set(parsed.filter((value): value is string => typeof value === 'string' && allowed.has(value)))];
  } catch {
    return [];
  }
}

export function GuideReadingProgress({
  anchors,
  visibleAnchors,
  locale,
}: {
  anchors: readonly string[];
  visibleAnchors: readonly string[];
  locale: Locale;
}) {
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const anchorKey = anchors.join('|');
  const visibleKey = visibleAnchors.join('|');
  const pct = anchors.length ? Math.round((read.size / anchors.length) * 100) : 0;

  useEffect(() => {
    const allowed = anchorKey ? anchorKey.split('|') : [];
    try {
      setRead(new Set(storedAnchors(allowed)));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
    setHydrated(true);
  }, [anchorKey]);

  useEffect(() => {
    if (!hydrated) return;
    const allowed = anchorKey ? anchorKey.split('|') : [];
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allowed.filter((anchor) => read.has(anchor))));
    } catch {
      setStorageAvailable(false);
    }
  }, [anchorKey, hydrated, read]);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-guide-section]'));
    for (const section of sections) section.dataset.guideRead = String(read.has(section.dataset.guideSection ?? ''));
  }, [anchorKey, read, visibleKey]);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-guide-section]'));
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entered = entries.filter((entry) => entry.isIntersecting).map((entry) => (entry.target as HTMLElement).dataset.guideSection);
      if (entered.length === 0) return;
      setRead((previous) => {
        const next = new Set(previous);
        for (const anchor of entered) if (anchor) next.add(anchor);
        return next;
      });
    }, { threshold: 0.01 });
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [locale, visibleKey]);

  const reset = () => {
    setRead(new Set());
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  };

  return (
    <section className="gd-progress" aria-label={locale === 'zh' ? '本机阅读记录' : 'Local reading record'} data-guide-progress>
      <div className="gd-progressHead">
        <span>{locale === 'zh' ? '本机阅读记录' : 'Local reading record'}</span>
        <span data-guide-read-count>{read.size} / {anchors.length} · {pct}%</span>
      </div>
      <div
        className="gd-progressBar"
        role="progressbar"
        aria-label={locale === 'zh' ? '已进入视口的章节' : 'Sections entered the viewport'}
        aria-valuemin={0}
        aria-valuemax={anchors.length}
        aria-valuenow={read.size}
      >
        <span className="gd-progressFill" style={{ width: `${pct}%` }} />
      </div>
      <p className="gd-progressNote">
        {locale === 'zh'
          ? '只记录滚动到视口的章节，不代表读懂、完成操作或完成任务；记录仅保存在这台设备。'
          : 'This records sections that entered the viewport, not comprehension, completed actions or finished tasks; it stays on this device.'}
      </p>
      <div className="gd-progressActions">
        <button type="button" className="gd-reset" onClick={reset} disabled={read.size === 0} data-guide-read-reset>
          {locale === 'zh' ? '清空阅读记录' : 'Clear reading record'}
        </button>
        {!storageAvailable ? (
          <span className="gd-storageNote" data-guide-storage-unavailable>
            {locale === 'zh' ? '本机存储不可用：本次记录不会跨刷新保留。' : 'Local storage is unavailable: this record will not survive a refresh.'}
          </span>
        ) : null}
      </div>
    </section>
  );
}
