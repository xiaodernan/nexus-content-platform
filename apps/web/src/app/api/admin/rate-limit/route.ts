import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError } from '@/server/http';
import { snapshot, type MetricName } from '@/server/observability';
import { getRateLimiter, IP_RATE_RULES } from '@/server/security/rateLimit';
import { REDIS_URL_ENV } from '@/server/security/rateLimitRedis';

/**
 * §SEC 第三十五片：限流闸的现场诊断入口。
 *
 * 三个 ADR 挂了同一句"仍欠"（ADR-0076 仍欠 2 / 0077 仍欠 1 / 0081 仍欠 1）：**"这台实例现在用的
 * 是哪个驱动"没有界面位**，答案只在启动那一行日志与 `nexus_rate_limit_driver_fallbacks_total` 里。
 * 那句话不是装饰——不设 `NEXUS_REDIS_URL` 时"10 次/15 分钟/邮箱"逐字变成"每台 10 次"，
 * 而部署里看得见的人没有一个会去 grep 那台进程的 stdout。
 *
 * 门与实时总线那一页同一句口径（默认拒绝，`role=admin`）：交出的是"整台实例的闸怎么装的"，
 * 含键前缀与上界数字——不是每个人机密，但也不是每个人的事。
 *
 * 回执**不做二次加工**：驱动自报那份原样端出，因为加工一层就多一处把 `null` 抹成 0 的机会
 * （那三个 `null` 各是一句"不适用"，见 `RateLimiterReadout` 的注释）。
 * 两个按原因的账从 metrics 现读，而不是让驱动再自报一份——同一句话有两个写入方就会有两个答案。
 *
 * `rules` 是静态的那一半：每条 IP 窗口闸的 `limit/windowMs` 从 `IP_RATE_RULES` 原样整表端出，
 * 不做挑挑选选——改动那张表就是产品决策本身；任何调用点都不再各抄一份数字。
 */
function counterByReason(name: MetricName): Record<string, number> {
  const metric = snapshot().find((entry) => entry.name === name);
  if (!metric || metric.kind !== 'counter') return {};
  const out: Record<string, number> = {};
  for (const series of metric.series) {
    const reason = series.labels['reason'];
    if (reason === undefined) continue;
    out[reason] = (out[reason] ?? 0) + series.value;
  }
  return out;
}

export async function GET(): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '限流闸状态只对审核员（role=admin）开放' });
  }
  const readout = getRateLimiter().describe();
  return NextResponse.json({
    ...readout,
    // 部署那句与现场那句分开写：变量设了没设是**该装哪个**，`driver` 是**现在在跑哪个**。
    // 两者不一致的唯一现实形状是测试里 `setRateLimiter()` 换过单例——那一格也要看得见，
    // 否则诊断页会在换过驱动的那台进程上说出一个和部署不符的答案而没人知道为什么。
    deployment: {
      envVar: REDIS_URL_ENV,
      redisUrlConfigured: (process.env[REDIS_URL_ENV]?.trim() ?? '') !== '',
      pid: process.pid,
    },
    fallbackByReason: counterByReason('nexus_rate_limit_driver_fallbacks_total'),
    bucketsPrunedByReason: counterByReason('nexus_rate_limit_buckets_pruned_total'),
    /** 每条 IP 窗口闸怎么装的（唯一真值，见 `IP_RATE_RULES` 那份注释）；e2e/paced 照它画节奏 */
    rules: IP_RATE_RULES,
  });
}
