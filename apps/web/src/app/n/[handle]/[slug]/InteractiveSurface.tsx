'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import { visitorKey } from '@/lib/visitor-key';
import type { Locale } from '@/lib/i18n';

/** 一个"点了会换页"的节点，几何是发布那一刻快照算出来的绝对坐标 */
export interface Hotspot {
  nodeId: string;
  targetPageId: string;
  targetName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type RecordState = 'checking' | 'not-walked' | 'recording' | 'recorded' | 'already' | 'failed';

/** 双语：终点页的每行文案按 cookie locale 选一份（中文模式全中文，英文模式全英文，不夹杂） */
const IS_TXT = {
  zh: {
    ariaGo: (name: string) => `前往「${name}」`,
    endStrong: '这一页没有下一步，它是这一版的终点。',
    checking: '只有从入口点着走过来的人会被记一次「走通」。',
    notWalked: '你这一次是直接打开这一页的，没有从入口点过来 ⇒ 不算走通，也没有上报。',
    recording: '正在记这一次走通…',
    recorded: '这一次走通记上了：同一版同一个人只记一次，计的是「多少人走通过」。',
    already: '这一次走通此前已经记过：同一版同一个人只记一次。',
    failed: '这一次走通没有记上（网络或服务端失败）⇒ 它不会被算进「互动完成」。',
  },
  en: {
    ariaGo: (name: string) => `Go to “${name}”`,
    endStrong: 'There is no next step on this page — it is the end of this version.',
    checking: 'Only visitors who clicked their way here from the entry are recorded once.',
    notWalked: 'You opened this page directly without clicking through from the entry — it does not count as walked through, and it is not reported.',
    recording: 'Recording this walk-through…',
    recorded: 'Walk-through recorded: once per version per person — what is counted is how many people made it through.',
    already: 'This walk-through was already recorded earlier: once per version per person.',
    failed: 'This walk-through was not recorded (network or server failure) — it will not be counted as “interaction completed”.',
  },
} as const;

/** "这个人从入口点着走过一次"的标记：按标签页记，不是按浏览器记 */
function walkedKey(path: string): string {
  return `nexus.interactive.${path}`;
}

/**
 * 同一个标签页里已经报过的那几个终点页。
 *
 * 为什么要模块级：dev 下 React StrictMode 会把 effect 跑两遍，
 * 不先去重就是一次走通发两次上报（第二次会返回 duplicate，界面就会从"记上了"
 * 翻成"此前已经记过"——那是**我们自己的**重复，不是访客的）。
 * 整页重新加载时这个 Map 自然清空 ⇒ 会真的再报一次，服务端回 duplicate 也照实显示。
 */
const outcomes = new Map<string, RecordState>();

/**
 * §167/§168 的互动运行时，第一半：把设计稿里 `click → navigate` 的节点铺成可点的热点。
 *
 * 几何直接用发布快照算出来的绝对坐标——不量 DOM、不猜哪块是"按钮"：
 * 模型说这个节点在哪、多大，热点就在哪、多大（§16：界面是模型的投影）。
 *
 * 只认 `click` + `navigate`：悬停、提交、开弹窗这些交互在这版里不会发生，
 * 页面上有一句说明（`data-interactive-note`）——把它们也铺成按钮，
 * 等于让"点了没反应"冒充"功能没做好"（§159）。
 */
export function InteractiveHotspots({
  path,
  hotspots,
  keepParams = {},
  locale = 'zh',
}: {
  path: string;
  hotspots: Hotspot[];
  /** 访客当前的查看器参数（viewport / zoom）。翻页是"换一页看"，不该把取景框重置掉（ADR-0063 同一条纪律） */
  keepParams?: Record<string, string>;
  locale?: Locale;
}) {
  const IS = IS_TXT[locale];
  const router = useRouter();
  if (!hotspots.length) return null;
  return (
    <>
      {hotspots.map((spot) => (
        <button
          key={spot.nodeId}
          type="button"
          aria-label={IS.ariaGo(spot.targetName)}
          data-interactive-hotspot={spot.nodeId}
          data-interactive-target={spot.targetPageId}
          onClick={() => {
            try {
              window.sessionStorage.setItem(walkedKey(path), '1');
            } catch {
              // 标不上就走不远：到了终点页只会显示"没有从入口点过来"
            }
            const sp = new URLSearchParams(keepParams);
            sp.set('page', spot.targetPageId);
            router.push(`${path}?${sp.toString()}`);
          }}
          style={{
            position: 'absolute',
            left: spot.x,
            top: spot.y,
            width: spot.width,
            height: spot.height,
            background: 'transparent',
            border: 0,
            padding: 0,
            cursor: 'pointer',
          }}
          className="is-hotspot"
        />
      ))}
    </>
  );
}

/**
 * 第二半：终点页。访客**点着走过来**时上报一次"走通"（一人一版一次）——
 * 直接打开终点页不算：没有点过任何热点就上报，会把"有人发了个链接"记成
 * "有人走完了"，那是这个数唯一想回答的问题之外的信号。
 *
 * 上报失败照实说，不显示成功：一句假的"记上了"会让人以为数据在涨。
 */
export function InteractiveEnd({ path, pageId, locale = 'zh' }: { path: string; pageId: string; locale?: Locale }) {
  const IS = IS_TXT[locale];
  const [record, setRecord] = useState<RecordState>('checking');

  useEffect(() => {
    const scope = `${path}|${pageId}`;
    const cached = outcomes.get(scope);
    if (cached) {
      setRecord(cached);
      return;
    }
    let walked = false;
    try {
      walked = window.sessionStorage.getItem(walkedKey(path)) === '1';
    } catch {
      // 隐私模式拿不到 sessionStorage：标不出"走过来的"⇒ 不报（宁可不记，不记错）
      walked ||= false;
    }
    if (!walked) {
      // 直达的不进 outcomes：同一份文档里此后真点着走进来（SPA 翻页不换文档）还要能正常上报
      setRecord('not-walked');
      return;
    }
    outcomes.set(scope, 'recording');
    setRecord('recording');
    void (async () => {
      const settle = (next: RecordState): void => {
        outcomes.set(scope, next);
        setRecord(next);
      };
      try {
        const res = await fetch('/api/published/work-complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({
            path,
            pageId,
            visitorKey: visitorKey(),
            webdriver: navigator.webdriver === true,
          }),
        });
        if (!res.ok) {
          settle('failed');
          return;
        }
        const body = (await res.json().catch(() => null)) as { recorded?: boolean } | null;
        settle(body?.recorded === true ? 'recorded' : 'already');
      } catch {
        settle('failed');
      }
    })();
  }, [path, pageId]);

  return (
    <p
      className="is-endNote"
      data-interactive-end
      data-interactive-record={
        record === 'recorded' ? 'yes' : record === 'already' ? 'already' : record === 'failed' ? 'failed' : undefined
      }
    >
      <span className="is-endStrong">{IS.endStrong}</span>{' '}
      {record === 'checking' ? IS.checking : null}
      {record === 'not-walked' ? IS.notWalked : null}
      {record === 'recording' ? IS.recording : null}
      {record === 'recorded' ? IS.recorded : null}
      {record === 'already' ? IS.already : null}
      {record === 'failed' ? IS.failed : null}
    </p>
  );
}
