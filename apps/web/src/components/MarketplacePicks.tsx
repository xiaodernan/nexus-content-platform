'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * ──MARKETPLACE-PICKS · /marketplace 的"AI 选品"（cont. 196）─────────────────
 *
 * 展示服务端 /api/marketplace/picks 起草的 1-5 条短荐语——每条只围绕该物品的
 * 实测字段（价格 / 下载量），不编造作品质量。
 *
 * 纪律：
 *  1. 失败时安静消失——这是公共页，错误信息只留给本地日志；
 *  2. 荐语只引用输入字段——你可以点进去亲眼分辨；
 *  3. 缓存 24h（服务端 LRU）：同一货架一天被读多少次，provider 只付一次。
 */

export interface MarketplacePickInput {
  id: string;
  title: string;
  itemType: string;
  priceCredits: number;
  downloadCount: number;
}

interface PicksOk {
  picks: { itemId: string; note: string }[];
  disclaimer: string;
}

const COPY = {
  zh: {
    kicker: '选品员的荐语',
  },
  en: {
    kicker: 'The clerk’s notes',
  },
} as const;

export function MarketplacePicks({ items, locale }: { items: MarketplacePickInput[]; locale: Locale }) {
  const c = COPY[locale];
  const [ok, setOk] = useState<PicksOk | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    let alive = true;
    const payload = {
      locale,
      items: items.map((i) => ({
        itemId: i.id,
        title: i.title,
        type: i.itemType,
        priceCredits: i.priceCredits,
        downloads: i.downloadCount,
      })),
    };
    fetch('/api/marketplace/picks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as PicksOk;
      })
      .then((json) => {
        if (alive && Array.isArray(json.picks)) setOk(json);
      })
      .catch(() => {
        /* 公共页：出错安静消失 */
      });
    return () => {
      alive = false;
    };
    // 只在挂载时触发一次——同一货架的荐语由服务端 24h LRU 兜底
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ok) return null;
  const byId = new Map(ok.picks.map((p) => [p.itemId, p.note] as const));
  const rows = items
    .map((item) => ({ item, note: byId.get(item.id) }))
    .filter((r): r is { item: MarketplacePickInput; note: string } => Boolean(r.note));

  if (rows.length === 0) return null;
  return (
    <aside className="mkp-strip" data-marketplace-picks-root aria-label={c.kicker}>
      <p className="mkp-kicker">{c.kicker}</p>
      <ol className="mkp-list">
        {rows.map(({ item, note }) => (
          <li key={item.id} className="mkp-item" data-marketplace-pick={item.id}>
            <span className="mkp-name">{item.title}</span>
            <span className="mkp-noteText">{note}</span>
          </li>
        ))}
      </ol>
      <p className="mkp-disclaimer">{ok.disclaimer}</p>
    </aside>
  );
}
