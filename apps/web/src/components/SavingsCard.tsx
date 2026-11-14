'use client';

import { useEffect, useState } from 'react';
import type { SavingsSummary } from '@/lib/savings';

/**
 * 「节省账单」（v699 / ROADMAP）—— /tasks/<项目> 页上的用户可感知一格。
 * §FE-SV 门面版：全部 `.sv-*`（tokens，零 hex，零裸 atom）；钩子守恒（data-savings-*）。
 *
 * 视觉纪律：
 * - 只用现有设计系统 token（brand 渐变 / accent 系 / fg 与 bg 系文本背景变量），不引入新色板；
 * - 数字走 font-mono + tabular-nums；大数字用 .sv-tokens（brand 渐变墨字，与 .brand-title 同笔法）；
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
      className="sv-root"
    >
      <div aria-hidden="true" className="sv-glowRight" />
      <div aria-hidden="true" className="sv-glowLeft" />

      {empty ? (
        <div className="sv-copy">
          <span className="sv-kicker">
            <BoltIcon /> AI 节省账单
          </span>
          <p className="sv-empty">
            这个项目还没有跑过任何一轮 AI——提一个请求，之后这里会记下缓存帮你省下的重复计算。
          </p>
        </div>
      ) : (
        <div className="sv-layout">
          <div className="sv-colLead">
            <span className="sv-kicker">
              <BoltIcon /> AI 节省账单
            </span>
            <div className="sv-tokens" data-savings-tokens>
              {formatTokens(animatedTokens)}
            </div>
            <p className="sv-tokenNote">
              缓存复用的 prompt token——同一批目录、品牌规范与选区不用重复计算（provider 前缀缓存）。
            </p>
          </div>

          <div className="sv-colMain">
            <div>
              <div className="sv-barHead">
                <span className="sv-barLabel">输入计算复用率</span>
                <span className="sv-barValue" data-savings-share>
                  {formatRate(savings.savedShare)}
                </span>
              </div>
              <div
                className="sv-barTrack"
                role="img"
                aria-label={`缓存复用占输入 token 的 ${formatRate(savings.savedShare)}`}
              >
                <div
                  data-savings-bar
                  className="sv-barFill"
                  style={{ width: mounted ? `${barWidth}%` : '0%' }}
                />
              </div>
            </div>

            <div className="sv-chips" data-savings-chips>
              <Chip marker="rate" label="命中率" value={formatRate(savings.hitRate)} />
              <Chip marker="real" label="真模型轮次" value={String(savings.realTurns)} />
              {savings.demoTurns > 0 ? <Chip marker="demo" label="DEMO 轮次" value={String(savings.demoTurns)} /> : null}
              {savings.legacyRows > 0 ? (
                <Chip marker="legacy" label="旧账本未记录" value={String(savings.legacyRows)} muted />
              ) : null}
            </div>

            <p className="sv-note">
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
    <span data-savings-chip={marker} className={muted ? 'sv-chipMuted' : 'sv-chip'}>
      <span className="sv-chipLabel">{label}</span>
      <span className="sv-chipValue">{value}</span>
    </span>
  );
}

function BoltIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="sv-kickerIcon">
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
