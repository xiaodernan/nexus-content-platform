'use client';

import { useCallback, useRef } from 'react';
import type { GameDocument, GameProjection } from '@nexus/game-model';
import { csrfHeaders } from '@/lib/csrf';
import { visitorKey } from '@/lib/visitor-key';
import { PlayByKind } from './PlayByKind';

/**
 * §168：公开可玩页上的那一层——**通关了就把这一声报出去**。
 *
 * 为什么要单独一个客户端组件（而不是让服务端那一页直接传回调）：
 * 回调是函数，不能从服务端组件穿过边界传到客户端组件（§16 的边界纪律），
 * 所以"谁报的"这件事只能落在客户端这一侧 ⇒ 由它渲染播放器并提供回调。
 *
 * 三条边界：
 * 1. **只报一次**（`reported` 这把锁）：一次游玩里通关了就是一次，
 *    重开一局再通关不该变成两次"通关过的人"；
 * 2. **匿名 key 与访客现场同一把**（`@/lib/visitor-key`）⇒ 于是
 *    "谁通关了"与"谁看过这一页"指的是同一个人；
 * 3. **报错了也不打断游玩**：catch 掉，界面上一句话都不说——
 *    统计是副产品，玩家的游戏是正事。
 */
export function PublicPlay({
  document,
  projection,
  path,
}: {
  document: GameDocument;
  projection: GameProjection;
  /** 这一版的公开路径（`/n/<handle>/<slug>`）：服务端靠它认出是哪一版 */
  path: string;
}) {
  const reported = useRef(false);
  const onComplete = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    void fetch('/api/published/game-complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify({
        path,
        visitorKey: visitorKey(),
        // 与访客现场同一句自报：自动化工具里它是 true（服务端另看 UA）
        webdriver: navigator.webdriver === true,
      }),
    }).catch(() => undefined);
  }, [path]);

  return <PlayByKind document={document} projection={projection} onComplete={onComplete} />;
}
