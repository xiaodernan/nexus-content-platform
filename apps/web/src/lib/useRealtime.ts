'use client';

import { useEffect, useRef, useState } from 'react';
import { RealtimeEventSchema, type RealtimeEvent } from '@nexus/schemas';

/**
 * §163 的客户端订阅（传输取舍见 `docs/adr/0010-realtime-sse-not-websocket.md`）。
 *
 * 一条连接覆盖两个频道：用户频道（通知）与可选的项目频道（生成/构建/预览进度）。
 *
 * 三条纪律：
 * - **报文必须过契约**。`RealtimeEventSchema` 校验失败的事件直接丢掉，不渲染一个来路不明的
 *   JSON——服务端将来加事件类型时，老前端最多是"没显示"，不会显示错东西。
 * - **断线不补发**。浏览器 `EventSource` 会自动重连，但断开期间的事件就是丢了（ADR 后果第 4 条）。
 *   所以这一层只能用来"让界面快点看到"，权威状态永远由页面自己读库；state 为 closed 时
 *   UI 要显示"以刷新后的数据为准"，而不是假装还在实时。
 * - **projectId 变了就重开连接**。复用旧连接会让上一个项目的进度继续往当前界面里推。
 * - **没有会话就不要开**。这条连接要过会话鉴权，匿名访客开它只会拿到一次 401；
 *   `enabled=false` 时 state 是 `idle`，UI 该显示"还没连"而不是"连接失败"。
 */

export type RealtimeState = 'idle' | 'connecting' | 'open' | 'closed';

export interface RealtimeOptions {
  /** 项目频道；不传就只订用户频道（通知） */
  projectId?: string | null;
  /** 明确等到"确实该开连接"再开，避免给没有会话的访客发一次注定 401 的长连接请求 */
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
}

export interface RealtimeStatus {
  state: RealtimeState;
  /** 最近一条**通过契约校验**的事件；没有则 null */
  lastEvent: RealtimeEvent | null;
  /** 这次挂载收到并通过校验的事件条数（诊断用："到底有没有人在听"） */
  received: number;
}

const IDLE: RealtimeStatus = { state: 'idle', lastEvent: null, received: 0 };

export function useRealtime(options: RealtimeOptions): RealtimeStatus {
  const { projectId = null, enabled = true } = options;
  const [status, setStatus] = useState<RealtimeStatus>(enabled ? { state: 'connecting', lastEvent: null, received: 0 } : IDLE);
  const callback = useRef(options.onEvent);
  callback.current = options.onEvent;

  useEffect(() => {
    if (!enabled) {
      setStatus((prev) => (prev.state === 'idle' ? prev : IDLE));
      return;
    }
    if (typeof EventSource === 'undefined') {
      setStatus({ state: 'closed', lastEvent: null, received: 0 });
      return;
    }
    setStatus((prev) => ({ ...prev, state: 'connecting' }));
    const url = `/api/realtime${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
    const source = new EventSource(url, { withCredentials: true });
    source.onopen = () => setStatus((prev) => ({ ...prev, state: 'open' }));
    // 浏览器自己会重连（readyState 仍为 CONNECTING）；只有彻底关掉才算断开
    source.onerror = () =>
      setStatus((prev) => ({ ...prev, state: source.readyState === EventSource.CLOSED ? 'closed' : 'connecting' }));

    source.onmessage = (raw: MessageEvent<string>) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.data);
      } catch {
        return;
      }
      const result = RealtimeEventSchema.safeParse(parsed);
      if (!result.success) return;
      setStatus((prev) => ({ state: 'open', lastEvent: result.data, received: prev.received + 1 }));
      callback.current?.(result.data);
    };

    return () => {
      source.close();
    };
  }, [projectId, enabled]);

  return status;
}
