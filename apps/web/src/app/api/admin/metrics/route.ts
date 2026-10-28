import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { readLedger } from '@/server/domain/metrics';
import { exposition, snapshot } from '@/server/observability';
import { jsonError } from '@/server/http';

/**
 * 观测数据的机器读出口（`docs/ROADMAP.md` 里"metrics/tracing 也没接"那一格的读侧）。
 *
 * 三条口径写在报文里而不是写在文档里，因为它们是最容易被误读的东西：
 * - `scope`：进程内计数器**只覆盖这一个实例、从它启动那一刻算起，重启清零**。多实例部署时这一份不是全局。
 *   不写这一句，读的人会把一个实例的数当成整站的数——那是"有指标但指标说谎"这一类故障的入口。
 * - 库里那三本账（`ledger`）才是跨重启的：审计决定、任务终态与时长、凭据用量。
 * - 这个端点只对 `role=admin` 开，与 `/admin/*` 其余几张页同一口径；它读的是聚合次数，
 *   不含邮箱、IP 与项目 id（标签按 `observability.ts` 的名单封顶，库侧也只取分组计数）。
 *
 * `?format=text` 出 Prometheus 文本 exposition，给真抓取端用；JSON 给人和脚本用。
 */

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: `这个端点对 role=${user.role} 不开放，只对 role=admin 可见` });
  }

  const params = new URL(req.url).searchParams;
  if (params.get('format') === 'text') {
    // 抓取端要的 MIME 是 text/plain；`version=0.0.4` 是这一格式的事实版本标识，不是装饰
    return new NextResponse(exposition(), {
      headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const hours = Number(params.get('hours') ?? 24);
  return NextResponse.json(
    {
      scope: {
        kind: 'single-process',
        note: 'process 那一段是本实例内存里的计数器，重启清零、多实例不合并；ledger 那一段才是跨重启的库账',
        pid: process.pid,
        uptimeMs: Math.round(process.uptime() * 1000),
        startedAt: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
        node: process.version,
      },
      process: snapshot(),
      ledger: await readLedger(Number.isFinite(hours) ? hours : 24),
    },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}
