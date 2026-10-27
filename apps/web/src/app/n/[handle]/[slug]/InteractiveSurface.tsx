'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import { visitorKey } from '@/lib/visitor-key';

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
export function InteractiveHotspots({ path, hotspots }: { path: string; hotspots: Hotspot[] }) {
  const router = useRouter();
  if (!hotspots.length) return null;
  return (
    <>
      {hotspots.map((spot) => (
        <button
          key={spot.nodeId}
          type="button"
          aria-label={`前往「${spot.targetName}」`}
          data-interactive-hotspot={spot.nodeId}
          data-interactive-target={spot.targetPageId}
          onClick={() => {
            try {
              window.sessionStorage.setItem(walkedKey(path), '1');
            } catch {
              // 标不上就走不远：到了终点页只会显示"没有从入口点过来"
            }
            router.push(`${path}?page=${encodeURIComponent(spot.targetPageId)}`);
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
          className="rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nexus-color-accent-2)] hover:ring-2 hover:ring-inset hover:ring-[var(--nexus-color-accent-2)]"
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
export function InteractiveEnd({ path, pageId }: { path: string; pageId: string }) {
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
      className="px-[var(--nexus-space-4)] pt-[var(--nexus-space-3)] text-12 text-fg-2"
      data-interactive-end
      data-interactive-record={
        record === 'recorded' ? 'yes' : record === 'already' ? 'already' : record === 'failed' ? 'failed' : undefined
      }
    >
      <span className="text-fg-1">这一页没有下一步，它是这一版的终点。</span>{' '}
      {record === 'checking' ? '只有从入口点着走过来的人会被记一次「走通」。' : null}
      {record === 'not-walked' ? '你这一次是直接打开这一页的，没有从入口点过来 ⇒ 不算走通，也没有上报。' : null}
      {record === 'recording' ? '正在记这一次走通…' : null}
      {record === 'recorded' ? '这一次走通记上了：同一版同一个人只记一次，计的是「多少人走通过」。' : null}
      {record === 'already' ? '这一次走通此前已经记过：同一版同一个人只记一次。' : null}
      {record === 'failed' ? '这一次走通没有记上（网络或服务端失败）⇒ 它不会被算进「互动完成」。' : null}
    </p>
  );
}
