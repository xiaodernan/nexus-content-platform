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
    return <div className="me-loading">加载中...</div>;
  }

  if (error) {
    return <div className="me-error">{error}</div>;
  }

  if (!summary) {
    return <div className="me-empty">暂无数据</div>;
  }

  return (
    <main className="me-root">
      <h1 className="me-title">创作者收入明细</h1>

      <section className="me-summary">
        <div className="me-summaryGrid">
          <div className="me-stat">
            <div className="me-statLabel">累计收入</div>
            <div className="me-statValue me-statValueAccent" data-earnings-total>
              {summary.totalEarned} credits
            </div>
          </div>
          <div className="me-stat">
            <div className="me-statLabel">总销量</div>
            <div className="me-statValue" data-earnings-sales>
              {summary.totalSales} 次
            </div>
          </div>
        </div>
      </section>

      {summary.dailyBreakdown.length > 0 ? (
        <section className="me-section">
          <h2 className="me-sectionTitle">每日明细</h2>
          <table className="me-table">
            <thead>
              <tr className="me-tr">
                <th className="me-th">日期</th>
                <th className="me-th me-thRight">销量</th>
                <th className="me-th me-thRight">收入</th>
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
          暂无销售记录。把你的作品上架到 Marketplace，开始获得收入吧！
        </section>
      )}
    </main>
  );
}
