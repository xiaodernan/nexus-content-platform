import { NextResponse } from 'next/server';
import { platformPulse } from '@/server/domain/pulse';

export const dynamic = 'force-dynamic';

/**
 * §PULSE 公测观测大厅的数据端点（`/pulse` 用）
 *
 * 纪律：
 * - 不做任何读"个人"的 API——这里只回**聚合匿名**数字，所以没有门槛（密码 123 是公开的，谁都能进）；
 * - 爬虫照常能爬到这些数——这是本端点存在的目的，不是漏洞；
 * - 库炸了就是 503，绝不编一个数。页面会如实写失败态，不是让网关给你一个"看起来还挺全"的数字。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const pulse = await platformPulse();
    return NextResponse.json(pulse, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('[pulse] aggregation failed', error);
    return NextResponse.json(
      { error: 'pulse_unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
