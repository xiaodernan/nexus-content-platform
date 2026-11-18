'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/i18n';

/** 双语：每行文案按 cookie locale 选（不夹杂） */
const ME_TXT = {
  zh: {
    fetchFailed: (status: number) => `获取失败（${status}）`,
    loadFailed: '加载失败',
    loading: '加载中...',
    error: '加载失败',
    empty: '暂无数据',
    title: '创作者收入明细',
    totalEarned: '累计收入',
    totalSales: '总销量',
    salesUnit: '次',
    dailyBreakdown: '每日明细',
    thDate: '日期',
    thSales: '销量',
    thIncome: '收入',
    noSales: '暂无销售记录。把你的作品上架到 Marketplace，开始获得收入吧！',
  },
  en: {
    fetchFailed: (status: number) => `Could not fetch (${status})`,
    loadFailed: 'Load failed',
    loading: 'Loading...',
    error: 'Load failed',
    empty: 'No data yet',
    title: 'Creator earnings',
    totalEarned: 'Total earned',
    totalSales: 'Total sales',
    salesUnit: '',
    dailyBreakdown: 'Daily breakdown',
    thDate: 'Date',
    thSales: 'Sales',
    thIncome: 'Income',
    noSales: 'No sales records yet. Put your work on the Marketplace and start earning!',
  },
} as const;

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

export function EarningsClient({ locale = 'zh' }: { locale?: Locale }) {
  const T = ME_TXT[locale];
  const router = useRouter();
  const [summary, setSummary] = useState<CreatorEarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // 尝试获取用户信息，未登录会跳转
        const res = await fetch('/api/marketplace/earnings');
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (!res.ok) {
          throw new Error(T.fetchFailed(res.status));
        }
        const data = (await res.json()) as CreatorEarningsSummary;
        setSummary(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : T.loadFailed);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return <div className="me-loading">{T.loading}</div>;
  }

  if (error) {
    return <div className="me-error">{error}</div>;
  }

  if (!summary) {
    return <div className="me-empty">{T.empty}</div>;
  }

  return (
    <main className="me-root">
      <h1 className="me-title">{T.title}</h1>

      <section className="me-summary">
        <div className="me-summaryGrid">
          <div className="me-stat">
            <div className="me-statLabel">{T.totalEarned}</div>
            <div className="me-statValue me-statValueAccent" data-earnings-total>
              {summary.totalEarned} credits
            </div>
          </div>
          <div className="me-stat">
            <div className="me-statLabel">{T.totalSales}</div>
            <div className="me-statValue" data-earnings-sales>
              {summary.totalSales}{T.salesUnit ? ` ${T.salesUnit}` : ''}
            </div>
          </div>
        </div>
      </section>

      {summary.dailyBreakdown.length > 0 ? (
        <section className="me-section">
          <h2 className="me-sectionTitle">{T.dailyBreakdown}</h2>
          <table className="me-table">
            <thead>
              <tr className="me-tr">
                <th className="me-th">{T.thDate}</th>
                <th className="me-th me-thRight">{T.thSales}</th>
                <th className="me-th me-thRight">{T.thIncome}</th>
              </tr>
            </thead>
            <tbody>
              {summary.dailyBreakdown.map((day) => (
                <tr key={day.date} className="me-tr">
                  <td className="me-td">{day.date}</td>
                  <td className="me-td me-tdRight">{day.salesCount}</td>
                  <td className="me-td me-tdRight me-tdAccent">{day.totalAmount} credits</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="me-emptyDetail">
          {T.noSales}
        </section>
      )}
    </main>
  );
}
