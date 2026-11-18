'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * ──SHIP-DIGEST · /ship 的"AI 平台速览"（cont. 204）──────────────────────────
 *
 * 展示服务端 /api/ship/digest 起草的速览——依据 git log 的机械统计；
 * 数字全是真的，文字全由大模型写；本组件只负责按钮与展示。
 *
 * 纪律：
 *  1. 挂载即触发一次（公开页，SSR 无产出，mount 后取数）；
 *  2. 失败安静消失——公共页，错误只留在本地日志；
 *  3. 常驻 disclaimer：AI 速览 · 依据真实 git 日志 · 非人工背书。
 */

export interface ShipGlanceInput {
  shownDays: number;
  totalCommits: number;
  adrs: number;
  counts: Record<string, number>;
  latest: { kind: string; subject: string; date: string }[];
}

interface DigestOk {
  digest: string;
  model: string;
  disclaimer: string;
  cached: boolean;
}

const COPY = {
  zh: {
    kicker: 'AI 平台速览',
    loading: '模型正在读这一串提交……',
  },
  en: {
    kicker: 'AI platform at a glance',
    loading: 'The model is reading these commits…',
  },
} as const;

export function ShipDigest({ input, locale }: { input: ShipGlanceInput; locale: Locale }) {
  const c = COPY[locale];
  const [ok, setOk] = useState<DigestOk | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/ship/digest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, locale }),
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as DigestOk;
      })
      .then((json) => {
        if (alive && typeof json.digest === 'string') setOk(json);
      })
      .catch(() => {
        /* 公共页：出错安静消失 */
      });
    return () => {
      alive = false;
    };
    // 只在挂载时触发——新提交会改变输入摘要，服务端 24h LRU 按输入计费
  }, []);

  if (!ok) return null;
  return (
    <aside className="shd-strip" data-ship-digest-root aria-label={c.kicker}>
      <p className="shd-kicker">{c.kicker}</p>
      <p className="shd-digest">{ok.digest}</p>
      <p className="shd-disclaimer">{ok.disclaimer}</p>
    </aside>
  );
}
