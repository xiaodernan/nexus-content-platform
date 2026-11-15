import type { ReactElement } from 'react';
import type { DailyPoint } from '@/server/domain/analytics';
import type { Locale } from '@/lib/i18n';

/**
 * §168 的按天曲线。**服务端组件**：没有交互、没有状态，所以不需要 'use client'——
 * 浏览器那一侧一行 JS 都不为它付。
 *
 * 三条与"别把图画成谎话"有关的选择（不变）：
 *
 * 1. **三个量各画一张图，各有各的纵轴。** 打开次数是"次"、访客是"人"、时长是"秒"，
 *    挤进同一个坐标系里，读者一定会去比柱子的高矮——那个比较没有任何含义。
 *    代价是多占两行地方，换来的是每一根柱子都能单独读。
 * 2. **没有数据的日子画成基线上一小段虚线，不跳过、也不画成满高。** 跳过会把"停更了一周"
 *    画成连续有人来；画成满高虚线柱又会被读成"那天最高"。虚线短柱说的是"这一天没有心跳"。
 * 3. **纵轴上限就是窗口内的最大值（至少 1）**，所以一根满高的柱子永远意味着
 *    "这是这段窗口里最高的一天"，而不是"越过了某个固定阈值"。上限写在标题右边，可以直接核对。
 *
 * v782：双语化（locale prop，默认 zh）；文案与三轴结构映射不变。
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

const COPY: Record<Locale, {
  axisMaxPrefix: string;
  opens: { title: string; maxUnit: string; read: (n: number) => string };
  visitors: { title: string; maxUnit: string; read: (n: number) => string };
  duration: { title: string; missingText: string; logPrefix: string; unit: string };
}> = {
  zh: {
    axisMaxPrefix: '纵轴 0 → ',
    opens: {
      title: '每天打开次数（只数真人；爬虫/自动化的打开另计在窗口汇总里，不画进这条曲线）',
      maxUnit: '次',
      read: (n) => `打开 ${n} 次`,
    },
    visitors: {
      title: '每天访客数（同一人同一天只算一个；这一天没有人来就是 0）',
      maxUnit: '人',
      read: (n) => `访客 ${n} 人`,
    },
    duration: {
      title: '每天可见时长（虚线短柱 = 那一天一条心跳都没有，不是 0 秒）',
      missingText: '未采集（这一天没有心跳）',
      logPrefix: '可见 ',
      unit: '秒',
    },
  },
  en: {
    axisMaxPrefix: 'Y 0 → ',
    opens: {
      title: 'Opens per day (humans only; crawler/automation opens are counted separately in the window totals and are NOT drawn into this curve)',
      maxUnit: ' opens',
      read: (n) => `${n} opens`,
    },
    visitors: {
      title: 'Visitors per day (one person per day counts once; a day with no one is 0)',
      maxUnit: ' visitors',
      read: (n) => `${n} visitors`,
    },
    duration: {
      title: 'Visible seconds per day (dashed stub = no heartbeat that day, not 0 seconds)',
      missingText: 'Not measured (no heartbeat that day)',
      logPrefix: 'visible ',
      unit: 's',
    },
  },
};

function MiniChart({
  days,
  spec,
  height,
  showAxis,
  locale,
}: {
  days: readonly DailyPoint[];
  spec: SeriesSpec;
  height: number;
  /** 只在最后一张图上标日期：三张图共用同一条时间轴，标三遍只是噪音 */
  showAxis: boolean;
  locale: Locale;
}): ReactElement {
  const c = COPY[locale];
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
    <div className="tc-chart">
      <div className="tc-head">
        <span className="tc-title">{spec.title}</span>
        <span className="tc-max" data-analytics-series-max={spec.key}>
          {c.axisMaxPrefix}{spec.formatMax(max)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="tc-svg"
        role="img"
        aria-label={`${spec.title}：${days.length} ${locale === 'en' ? 'days, peak' : ' 天，最高 '} ${spec.formatMax(max)}`}
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
                  className="tc-axisLabel"
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

export function TrendChart({ days, emptyNote, locale = 'zh' }: { days: readonly DailyPoint[]; emptyNote: string; locale?: Locale }): ReactElement {
  const c = COPY[locale];
  const secondOf = (ms: number) => Math.round(ms / 1000);
  return (
    <div className="tc-root" data-analytics-charts>
      <MiniChart
        days={days}
        height={92}
        showAxis={false}
        locale={locale}
        spec={{
          key: 'opens',
          title: c.opens.title,
          formatMax: (value) => `${value}${c.opens.maxUnit}`,
          pick: (point) => point.opens,
          missing: () => false,
          color: 'var(--nexus-color-accent-2)',
          read: (point) => c.opens.read(point.opens),
        }}
      />
      <MiniChart
        days={days}
        height={92}
        showAxis={false}
        locale={locale}
        spec={{
          key: 'visitors',
          title: c.visitors.title,
          formatMax: (value) => `${value}${c.visitors.maxUnit}`,
          pick: (point) => point.visitors,
          missing: () => false,
          color: 'var(--nexus-color-brand)',
          read: (point) => c.visitors.read(point.visitors),
        }}
      />
      <MiniChart
        days={days}
        height={108}
        showAxis
        locale={locale}
        spec={{
          key: 'playTimeMs',
          title: c.duration.title,
          formatMax: (value) => `${secondOf(value)}${c.duration.unit}`,
          pick: (point) => point.playTimeMs ?? 0,
          missing: (point) => point.playTimeMs === null,
          color: 'var(--nexus-color-success)',
          read: (point) =>
            point.playTimeMs === null
              ? c.duration.missingText
              : `${c.duration.logPrefix}${secondOf(point.playTimeMs)}${c.duration.unit}`,
        }}
      />
      {days.every((point) => point.visitors === 0 && point.opens === 0) ? (
        <p className="tc-empty" data-analytics-chart-empty>
          {emptyNote}
        </p>
      ) : null}
    </div>
  );
}
