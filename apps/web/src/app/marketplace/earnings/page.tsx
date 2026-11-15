'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientLocale } from '@/lib/client-locale';
import type { Locale } from '@/lib/i18n';

/**
 * 双语 COPY（2026-11-15 公开试玩面 wave）：en 逐字对应 zh；组件只做选择。
 * 服务端产出的 error 字面原文显示（与其余面板一致）。
 */
const COPY: Record<Locale, {
  loading: string;
  fetchFailed: (status: number) => string;
  loadFailed: string;
  empty: string;
  title: string;
  totalRevenue: string;
  salesCount: string;
  salesUnit: string;
  dailyTitle: string;
  thDate: string;
  thSales: string;
  thRevenue: string;
  creditsUnit: string;
  emptyDetail: string;
}> = {
  zh: {
    loading: '加载中...',
    fetchFailed: (status) => `获取失败（${status}）`,
    loadFailed: '加载失败',
    empty: '暂无数据',
    title: '创作者收入明细',
    totalRevenue: '累计收入',
    salesCount: '总销量',
    salesUnit: '次',
    dailyTitle: '每日明细',
    thDate: '日期',
    thSales: '销量',
    thRevenue: '收入',
    creditsUnit: 'credits',
    emptyDetail: '暂无销售记录。把你的作品上架到 Marketplace，开始获得收入吧！',
  },
  en: {
    loading: 'Loading…',
    fetchFailed: (status) => `Fetch failed (${status})`,
    loadFailed: 'Failed to load',
    empty: 'No data yet',
    title: 'Creator earnings',
    totalRevenue: 'Total earned',
    salesCount: 'Total sales',
    salesUnit: ' sales',
    dailyTitle: 'Daily breakdown',
    thDate: 'Date',
    thSales: 'Sales',
    thRevenue: 'Revenue',
    creditsUnit: 'credits',
    emptyDetail: 'No sales yet. List your work on the Marketplace and start earning!',
  },
};

interface DailyEarnings {
  date: string;
  totalAmount: number;
  salesCount: number;
}

interface CreatorEarningsSummary {
  totalEarned: number;
  totalSales: number;
  dailyBreakdown: DailyEarnings[];
}

export default function EarningsPage() {
  const router = useRouter();
  // 客户端 locale 直接从 <html lang> 同步读（"zh-first 缺省与服务端一致）——版本里频繁重渲染一致输出
  const locale = clientLocale() as Locale;
  const c = COPY[locale];
  const [summary, setSummary] = useState<CreatorEarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const local = COPY[clientLocale()];
        // 尝试获取用户信息，未登录会跳转
        const res = await fetch('/api/marketplace/earnings');
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (!res.ok) {
          throw new Error(local.fetchFailed(res.status));
        }
        const data = (await res.json()) as CreatorEarningsSummary;
        setSummary(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : COPY[clientLocale()].loadFailed);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return <div className="me-loading">{c.loading}</div>;
  }

  if (error) {
    return <div className="me-error">{error}</div>;
  }

  if (!summary) {
    return <div className="me-empty">{c.empty}</div>;
  }

  return (
    <main className="me-root">
      <h1 className="me-title">{c.title}</h1>

      <section className="me-summary">
        <div className="me-summaryGrid">
          <div className="me-stat">
            <div className="me-statLabel">{c.totalRevenue}</div>
            <div className="me-statValue me-statValueAccent" data-earnings-total>
              {summary.totalEarned} {c.creditsUnit}
            </div>
          </div>
          <div className="me-stat">
            <div className="me-statLabel">{c.salesCount}</div>
            <div className="me-statValue" data-earnings-sales>
              {summary.totalSales}
              {c.salesUnit}
            </div>
          </div>
        </div>
      </section>

      {summary.dailyBreakdown.length > 0 ? (
        <section className="me-section">
          <h2 className="me-sectionTitle">{c.dailyTitle}</h2>
          <table className="me-table">
            <thead>
              <tr className="me-tr">
                <th className="me-th">{c.thDate}</th>
                <th className="me-th me-thRight">{c.thSales}</th>
                <th className="me-th me-thRight">{c.thRevenue}</th>
              </tr>
            </thead>
            <tbody>
              {summary.dailyBreakdown.map((day) => (
                <tr key={day.date} className="me-tr">
                  <td className="me-td">{day.date}</td>
                  <td className="me-td me-tdRight">{day.salesCount}</td>
                  <td className="me-td me-tdRight me-tdAccent">{day.totalAmount} {c.creditsUnit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="me-emptyDetail">
          {c.emptyDetail}
        </section>
      )}
    </main>
  );
}
