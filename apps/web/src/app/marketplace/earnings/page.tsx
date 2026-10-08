'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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
          throw new Error(`获取失败（${res.status}）`);
        }
        const data = (await res.json()) as CreatorEarningsSummary;
        setSummary(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return <div className="p-6 text-13 text-fg-2">加载中...</div>;
  }

  if (error) {
    return <div className="p-6 text-13 text-danger">{error}</div>;
  }

  if (!summary) {
    return <div className="p-6 text-13 text-fg-2">暂无数据</div>;
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-[var(--nexus-font-size-24)] font-semibold">创作者收入明细</h1>

      <section className="mb-6 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-4">
        <div className="flex gap-8">
          <div>
            <div className="text-11 text-fg-3">累计收入</div>
            <div className="text-[var(--nexus-font-size-21)] font-semibold text-accent-2" data-earnings-total>
              {summary.totalEarned} credits
            </div>
          </div>
          <div>
            <div className="text-11 text-fg-3">总销量</div>
            <div className="text-[var(--nexus-font-size-21)] font-semibold" data-earnings-sales>
              {summary.totalSales} 次
            </div>
          </div>
        </div>
      </section>

      {summary.dailyBreakdown.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[var(--nexus-font-size-16)] font-medium">每日明细</h2>
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-[var(--nexus-color-border-subtle)]">
                <th className="py-2 text-left font-medium text-fg-2">日期</th>
                <th className="py-2 text-right font-medium text-fg-2">销量</th>
                <th className="py-2 text-right font-medium text-fg-2">收入</th>
              </tr>
            </thead>
            <tbody>
              {summary.dailyBreakdown.map((day) => (
                <tr key={day.date} className="border-b border-[var(--nexus-color-border-subtle)]">
                  <td className="py-2 text-fg-1">{day.date}</td>
                  <td className="py-2 text-right text-fg-1">{day.salesCount}</td>
                  <td className="py-2 text-right text-accent-2">{day.totalAmount} credits</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-4 text-13 text-fg-2">
          暂无销售记录。把你的作品上架到 Marketplace，开始获得收入吧！
        </section>
      )}
    </main>
  );
}
