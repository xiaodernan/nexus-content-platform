'use client';

import { useEffect, useState } from 'react';
import type { SavingsSummary } from '@/lib/savings';

/**
 * 「节省账单」（v699 / ROADMAP）—— /tasks/<项目> 页上的用户可感知一格。
 *
 * 视觉纪律：
 * - 只用现有设计系统 token（brand 渐变 / accent 系 / fg 与 bg 系文本背景变量），不引入新色板；
 * - 数字走 font-mono + tabular-nums；大数字用 text-gradient-brand（与全页品牌标题同一笔法）；
 * - 动画只发生一次（挂载后 ~1s），prefers-reduced-motion 直接落终值；
 *
 * 诚实边界（§159 / §3）：
 * - 计数 = provider 前缀缓存复用的 prompt token（不是"省钱"——本仓没有价格表，费用 0 写 0）；
 * - tokensIn 为 0 时命中率渲染 '—'，不写 0% 冒充"测过没有命中"；
 * - 应用级 Redis 完成缓存（整条响应复用）不在这个数里——它只活在 /healthz 计数器上；
 * - savings 为 null（读侧失败）时上层不渲染这一格，账本页不会因为它缺货而 500。
 */

function formatTokens(n: number): string {
  if (n < 10_000) return String(Math.round(n));
  if (n < 100_000_000) {
    const wan = n / 10_000;
    return `${wan >= 100 ? wan.toFixed(0) : wan.toFixed(1)} 万`;
  }
  return `${(n / 100_000_000).toFixed(2)} 亿`;
}

function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -7 * t);
}

function useCountUp(target: number, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(t >= 1 ? target : Math.round(target * easeOutExpo(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

export function SavingsCard({ savings }: { savings: SavingsSummary }) {
  const animatedTokens = useCountUp(savings.cachedTokens);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // 让 bar 的 width 从 0 过渡一次；无 JS 时 style 为 0（静态 SSR 不承诺满宽）
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const barWidth = savings.savedShare === null ? 0 : Math.round(savings.savedShare * 100);
  const empty = savings.turns === 0;

  return (
    <section
      data-savings-card
      aria-label="AI 节省账单"
      className="relative overflow-hidden rounded-2xl border border-[var(--nexus-color-brand)]/30 bg-gradient-to-br from-bg-1 via-bg-2 to-bg-1 p-5 shadow-[0_0_48px_rgb(91_108_255/0.16)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgb(91_108_255/0.22)_0%,transparent_65%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -bottom-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgb(34_211_238/0.14)_0%,transparent_65%)] blur-2xl"
      />

      {empty ? (
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 text-10 uppercase tracking-[0.18em] text-fg-3">
            <BoltIcon /> AI 节省账单
          </span>
          <p className="mt-3 text-13 text-fg-2">
            这个项目还没有跑过任何一轮 AI——提一个请求，之后这里会记下缓存帮你省下的重复计算。
          </p>
        </div>
      ) : (
        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-[230px]">
            <span className="inline-flex items-center gap-1.5 text-10 uppercase tracking-[0.18em] text-fg-3">
              <BoltIcon /> AI 节省账单
            </span>
            <div
              className="mt-2 font-mono text-[44px] font-black leading-none text-gradient-brand tabular-nums"
              data-savings-tokens
            >
              {formatTokens(animatedTokens)}
            </div>
            <p className="mt-2 max-w-[280px] text-11 leading-relaxed text-fg-3">
              缓存复用的 prompt token——同一批目录、品牌规范与选区不用重复计算（provider 前缀缓存）。
            </p>
          </div>

          <div className="flex min-w-[280px] flex-1 flex-col gap-3">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-11">
                <span className="text-fg-3">输入计算复用率</span>
                <span className="font-mono text-12 text-fg-1 tabular-nums" data-savings-share>
                  {formatRate(savings.savedShare)}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-[var(--nexus-color-border-subtle)]"
                role="img"
                aria-label={`缓存复用占输入 token 的 ${formatRate(savings.savedShare)}`}
              >
                <div
                  data-savings-bar
                  className="h-full rounded-full bg-gradient-to-r from-[var(--nexus-color-brand)] via-[var(--nexus-color-accent-1)] to-[var(--nexus-color-accent-2)] shadow-[0_0_12px_rgb(91_108_255/0.55)] transition-[width] duration-1000 ease-out"
                  style={{ width: mounted ? `${barWidth}%` : '0%' }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2" data-savings-chips>
              <Chip marker="rate" label="命中率" value={formatRate(savings.hitRate)} />
              <Chip marker="real" label="真模型轮次" value={String(savings.realTurns)} />
              {savings.demoTurns > 0 ? <Chip marker="demo" label="DEMO 轮次" value={String(savings.demoTurns)} /> : null}
              {savings.legacyRows > 0 ? (
                <Chip marker="legacy" label="旧账本未记录" value={String(savings.legacyRows)} muted />
              ) : null}
            </div>

            <p className="text-10 leading-relaxed text-fg-4">
              口径：usage.cachedTokens（provider prompt_tokens_details）按本项目台账累计；应用级 Redis
              完成缓存（整条响应复用）不计入此数。{savings.legacyRows > 0 ? `${savings.legacyRows} 行旧账本不记缓存字段，按未记录处理。` : ''}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Chip({
  marker,
  label,
  value,
  muted = false,
}: {
  marker: string;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <span
      data-savings-chip={marker}
      className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-10 ${
        muted
          ? 'border-[var(--nexus-color-border-subtle)] text-fg-3'
          : 'border-[var(--nexus-color-brand)]/40 bg-[var(--nexus-color-brand)]/10 text-accent-2-ink'
      }`}
    >
      <span className="text-fg-4">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </span>
  );
}

function BoltIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[var(--nexus-color-brand)]">
      <path
        d="M13 2 4.5 13.5H11L9.5 22 18 10.5h-6.5L13 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="currentColor"
        fillOpacity="0.25"
      />
    </svg>
  );
}
