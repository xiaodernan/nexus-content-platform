import type { ReactElement } from 'react';
import type { DailyPoint } from '@/server/domain/analytics';

/**
 * §168 的按天曲线。**服务端组件**：没有交互、没有状态，所以不需要 'use client'——
 * 浏览器那一侧一行 JS 都不为它付。
 *
 * 三条与"别把图画成谎话"有关的选择：
 *
 * 1. **三个量各画一张图，各有各的纵轴。** 打开次数是"次"、访客是"人"、时长是"秒"，
 *    挤进同一个坐标系里，读者一定会去比柱子的高矮——那个比较没有任何含义。
 *    代价是多占两行地方，换来的是每一根柱子都能单独读。
 * 2. **没有数据的日子画成基线上一小段虚线，不跳过、也不画成满高。** 跳过会把"停更了一周"
 *    画成连续有人来；画成满高虚线柱又会被读成"那天最高"。虚线短柱说的是"这一天没有心跳"。
 * 3. **纵轴上限就是窗口内的最大值（至少 1）**，所以一根满高的柱子永远意味着
 *    "这是这段窗口里最高的一天"，而不是"越过了某个固定阈值"。上限写在标题右边，可以直接核对。
 */

const WIDTH = 720;
const PAD_LEFT = 44;
const PAD_RIGHT = 8;
/** 缺数据那天的占位高度：够看见，又不会像一根柱子 */
const MISSING_STUB = 3;

function dayLabel(day: string): string {
  return day.slice(5).replace('-', '/');
}

interface SeriesSpec {
  /** 给 data 属性用的稳定名字（e2e 用，不给人看） */
  key: string;
  title: string;
  /** 纵轴顶端那一格怎么写（含单位） */
  formatMax: (value: number) => string;
  pick: (point: DailyPoint) => number;
  /** 这一天缺没缺；缺的那天画虚线短柱而不是 0 */
  missing: (point: DailyPoint) => boolean;
  color: string;
  read: (point: DailyPoint) => string;
}

function MiniChart({
  days,
  spec,
  height,
  showAxis,
}: {
  days: readonly DailyPoint[];
  spec: SeriesSpec;
  height: number;
  /** 只在最后一张图上标日期：三张图共用同一条时间轴，标三遍只是噪音 */
  showAxis: boolean;
}): ReactElement {
  const top = 6;
  const plot = height - top - (showAxis ? 16 : 4);
  const step = (WIDTH - PAD_LEFT - PAD_RIGHT) / Math.max(days.length, 1);
  const barWidth = Math.max(1, Math.min(step - 2, 22));
  let max = 0;
  for (const point of days) {
    if (!spec.missing(point) && spec.pick(point) > max) max = spec.pick(point);
  }
  max = Math.max(max, 1);
  // 窗口长的时候只标一部分日期，否则 90 天的窗口底部会挤成一片糊
  const labelEvery = Math.max(1, Math.ceil(days.length / 12));

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-11">
        <span className="text-fg-2">{spec.title}</span>
        <span className="text-fg-3" data-analytics-series-max={spec.key}>
          纵轴 0 → {spec.formatMax(max)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${spec.title}：${days.length} 天，最高 ${spec.formatMax(max)}`}
        data-analytics-series={spec.key}
      >
        <line
          x1={PAD_LEFT}
          y1={top + plot}
          x2={WIDTH - PAD_RIGHT}
          y2={top + plot}
          stroke="var(--nexus-color-border-subtle)"
        />
        {days.map((point, index) => {
          const empty = spec.missing(point);
          const barHeight = empty ? MISSING_STUB : Math.max(1, Math.round((spec.pick(point) / max) * plot));
          const x = PAD_LEFT + index * step + (step - barWidth) / 2;
          return (
            <rect
              key={point.day}
              x={x}
              y={top + plot - barHeight}
              width={barWidth}
              height={barHeight}
              fill={empty ? 'transparent' : spec.color}
              stroke={empty ? spec.color : 'none'}
              strokeDasharray={empty ? '2 2' : undefined}
              strokeOpacity={empty ? 0.5 : undefined}
              data-analytics-bar={spec.key}
              data-analytics-bar-day={point.day}
              data-analytics-bar-state={empty ? 'missing' : 'value'}
            >
              <title>{`${point.day} · ${spec.read(point)}`}</title>
            </rect>
          );
        })}
        {showAxis
          ? days.map((point, index) =>
              index % labelEvery === 0 || index === days.length - 1 ? (
                <text
                  key={point.day}
                  x={PAD_LEFT + index * step + step / 2}
                  y={height - 3}
                  textAnchor="middle"
                  className="fill-[var(--nexus-color-fg-3)] text-[9px]"
                >
                  {dayLabel(point.day)}
                </text>
              ) : null,
            )
          : null}
      </svg>
    </div>
  );
}

export function TrendChart({ days, emptyNote }: { days: readonly DailyPoint[]; emptyNote: string }): ReactElement {
  const secondOf = (ms: number) => Math.round(ms / 1000);
  return (
    <div className="mt-3" data-analytics-charts>
      <MiniChart
        days={days}
        height={92}
        showAxis={false}
        spec={{
          key: 'opens',
          title: '每天打开次数（只数真人；爬虫/自动化的打开另计在窗口汇总里，不画进这条曲线）',
          formatMax: (value) => `${value} 次`,
          pick: (point) => point.opens,
          missing: () => false,
          color: 'var(--nexus-color-accent-2)',
          read: (point) => `打开 ${point.opens} 次`,
        }}
      />
      <MiniChart
        days={days}
        height={92}
        showAxis={false}
        spec={{
          key: 'visitors',
          title: '每天访客数（同一人同一天只算一个；这一天没有人来就是 0）',
          formatMax: (value) => `${value} 人`,
          pick: (point) => point.visitors,
          missing: () => false,
          color: 'var(--nexus-color-brand)',
          read: (point) => `访客 ${point.visitors} 人`,
        }}
      />
      <MiniChart
        days={days}
        height={108}
        showAxis
        spec={{
          key: 'playTimeMs',
          title: '每天可见时长（虚线短柱 = 那一天一条心跳都没有，不是 0 秒）',
          formatMax: (value) => `${secondOf(value)} 秒`,
          pick: (point) => point.playTimeMs ?? 0,
          missing: (point) => point.playTimeMs === null,
          color: 'var(--nexus-color-success)',
          read: (point) =>
            point.playTimeMs === null ? '未采集（这一天没有心跳）' : `可见 ${secondOf(point.playTimeMs)} 秒`,
        }}
      />
      {days.every((point) => point.visitors === 0 && point.opens === 0) ? (
        <p className="mt-2 text-11 text-fg-3" data-analytics-chart-empty>
          {emptyNote}
        </p>
      ) : null}
    </div>
  );
}
