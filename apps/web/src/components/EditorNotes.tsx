'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';

/**
 * ──EDITOR-NOTES · /discover 热度榜下的"馆长批注"（cont. 192）────────────────
 *
 * 展示服务端 /api/editor-note 起草的 1-5 条短批注（每条围绕该作品的真实指标数）。
 * 纪律：
 *  1. 失败时安静消失——这是公共页，错误信息只留给本地日志（不给访客渲染 502）；
 *  2. 批注只引用输入指标——不编造内容断言（你可以点进去亲眼分辨）；
 *  3. 缓存 24h（服务端 LRU）：同一张榜一天被读多少次，provider 只付一次。
 */

export interface EditorNoteCardInput {
  publicationId: string;
  path: string;
  name: string;
  kind: string;
  views: number;
  likes: number;
  comments: number;
  remixes: number;
  score?: number;
}

interface NoteOk {
  notes: { publicationId: string; note: string }[];
  disclaimer: string;
}

const COPY = {
  zh: {
    kicker: '馆长的批注',
    loading: '正在让模型读这些数字……',
  },
  en: {
    kicker: 'The curator’s notes',
    loading: 'The model is reading these numbers…',
  },
} as const;

export function EditorNotes({ cards, locale }: { cards: EditorNoteCardInput[]; locale: Locale }) {
  const c = COPY[locale];
  const [ok, setOk] = useState<NoteOk | null>(null);

  useEffect(() => {
    if (cards.length === 0) return;
    let alive = true;
    const payload = {
      locale,
      cards: cards.map(({ publicationId, name, kind, views, likes, comments, remixes, score }) => ({
        publicationId, name, kind, views, likes, comments, remixes,
        ...(score !== undefined ? { score } : {}),
      })),
    };
    fetch('/api/editor-note', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as NoteOk;
      })
      .then((json) => {
        if (alive && Array.isArray(json.notes)) setOk(json);
      })
      .catch(() => {
        /* 公共页：出错安静消失 */
      });
    return () => {
      alive = false;
    };
    // 只在挂载时触发一次——同一张榜的批注由服务端 24h LRU 兜底
  }, []);

  if (!ok) return null;
  const byId = new Map(ok.notes.map((n) => [n.publicationId, n.note] as const));
  const rows = cards
    .map((card) => ({ card, note: byId.get(card.publicationId) }))
    .filter((r): r is { card: EditorNoteCardInput; note: string } => Boolean(r.note));

  if (rows.length === 0) return null;
  return (
    <aside className="en-strip" data-editor-notes-root aria-label={c.kicker}>
      <p className="en-kicker">{c.kicker}</p>
      <ol className="en-list">
        {rows.map(({ card, note }) => (
          <li key={card.publicationId} className="en-item" data-editor-note={card.publicationId}>
            <Link href={card.path} className="en-link">
              <span className="en-name">{card.name}</span>
              <span className="en-noteText">{note}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="en-disclaimer">{ok.disclaimer}</p>
    </aside>
  );
}
