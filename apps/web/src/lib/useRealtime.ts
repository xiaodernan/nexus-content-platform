'use client';

import { useEffect, useRef, useState } from 'react';
import { RealtimeEventSchema, type RealtimeEvent } from '@nexus/schemas';

/**
 * §163 的客户端订阅（传输取舍见 `docs/adr/0010-realtime-sse-not-websocket.md`）。
 *
 * 一条连接覆盖两个频道：用户频道（通知）与可选的项目频道（生成/构建/预览进度）。
 *
 * 四条纪律：
 * - **报文必须过契约**。`RealtimeEventSchema` 校验失败的事件直接丢掉，不渲染一个来路不明的
 *   JSON——服务端将来加事件类型时，老前端最多是"没显示"，不会显示错东西。
 * - **断线不重放帧，但重开必须把权威读回来**。浏览器 `EventSource` 会自动重连，断开期间的事件
 *   就是没收到（为什么不重放帧、为什么不在服务端按 `Last-Event-ID` 补发，写在
 *   `docs/adr/0029-…`：收件箱的 `level` 根本不在表里，补出来的那一帧会把失败画成成功）。
 *   所以这一层只能用来"让界面快点看到"，权威状态永远由页面自己读库；`onReconnect` 就是
 *   "这条连接断过、现在接回来了"这一格信号——拿到它的人应当立刻重读一次，
 *   而不是等下一条事件或让用户手动刷新。state 为 closed 时 UI 显示"以刷新后的数据为准"。
 * - **projectId 变了就重开连接**。复用旧连接会让上一个项目的进度继续往当前界面里推。
 * - **没有会话就不要开**。这条连接要过会话鉴权，匿名访客开它只会拿到一次 401；
 *   `enabled=false` 时 state 是 `idle`，UI 该显示"还没连"而不是"连接失败"。
 */

export type RealtimeState = 'idle' | 'connecting' | 'open' | 'closed';

/**
 * 四档连接状态的用户文案，三个订阅方（铃铛 / 命令栏 / 任务账本）共用这一份。
 * 以前各抄一份：文案改一次要改三处，漏一处就在同一个界面上出现两种"断开"的说法。
 * 保持裸状态词（不带"实时："前缀），前缀由各处按自己的句式拼：
 * 铃铛与账本是「实时：已连接」，命令栏是「实时通道：已连接」。
 * closed 那档必须自己带着"以刷新后的数据为准"——那是断开时唯一诚实的交代（ADR-0029）。
 */
export const REALTIME_TEXT: Record<RealtimeState, string> = {
  idle: '未开',
  connecting: '连接中',
  open: '已连接',
  closed: '已断开，以刷新后的数据为准',
};

export interface RealtimeOptions {
  /** 项目频道；不传就只订用户频道（通知） */
  projectId?: string | null;
  /** 明确等到"确实该开连接"再开，避免给没有会话的访客发一次注定 401 的长连接请求 */
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
  /**
   * 这条连接**断过之后又接回来**时调用一次（首次建立不算）。
   * 断开期间的事件一帧都没收到，所以拿到这一格信号的人应当立刻重读权威（§163，见 ADR-0029）。
   */
  onReconnect?: () => void;
}

export interface RealtimeStatus {
  state: RealtimeState;
  /** 最近一条**通过契约校验**的事件；没有则 null */
  lastEvent: RealtimeEvent | null;
  /** 这次挂载收到并通过校验的事件条数（诊断用："到底有没有人在听"） */
  received: number;
}

const IDLE: RealtimeStatus = { state: 'idle', lastEvent: null, received: 0 };

/**
 * 这条流用到的最小连接形状。
 *
 * 写成接口而不是直接用 `EventSource`：断线—重开这一圈必须能被驱动。真浏览器那条路我试过并且失败了——
 * CDP `Network.emulateNetworkConditions({offline:true})` **不会**打断已经建立的 SSE 连接，
 * 页面在 30 秒里一直是"实时：已连接"（那条红用例的原文留在 ADR-0029 的验证一节）。
 * 而这一格的全部语义都在"第几次 open"上：第一次不算、第二次才算，
 * 只有把 `onopen` 敲两次才能证明那句判断存在。
 *
 * 三个回调是 `attach` 一次性挂上去的，而不是三个可赋值的 `on*` 字段：DOM 上那几个的类型是
 * `(this: EventSource, ev: Event) => any`，把无参回调赋给它过不了 typecheck，
 * 而这一层根本不关心那个 Event——事件由浏览器造，不该由我去造。
 */
export interface RealtimeSourceLike {
  attach(handlers: { open: () => void; error: () => void; message: (data: string) => void }): void;
  readonly readyState: number;
  close(): void;
}

/** `EventSource.CLOSED` 按规范是 2。写死这个数字是因为注入进来的对象拿不到那个静态常量 */
const SOURCE_CLOSED = 2;

/** 生产用的那条连接：浏览器的 `EventSource`，带会话 cookie */
function browserSource(url: string): RealtimeSourceLike {
  const es = new EventSource(url, { withCredentials: true });
  return {
    attach: ({ open, error, message }) => {
      es.addEventListener('open', open);
      es.addEventListener('error', error);
      es.addEventListener('message', (ev) => message(ev.data));
    },
    get readyState() {
      return es.readyState;
    },
    close: () => es.close(),
  };
}

export interface RealtimeStreamHandlers {
  /** 一条通过契约校验的事件（校验就在这条路上，不给调用方留"先对象化再用"的机会） */
  onEvent: (event: RealtimeEvent) => void;
  /** 连接状态，每次变化报一次 */
  onState: (state: Exclude<RealtimeState, 'idle'>) => void;
  /** 这条连接断过又接回来了 */
  onReconnect: () => void;
}

/**
 * 一条连接的开场记账：`open` 第一次响是首连，之后再响都是"断过又接回来"。
 *
 * 之所以做成一个对象而不是一句 `if (opened)`：换 projectId 会让 effect 重跑、开一条新连接，
 * 那时首连必须重新算——旧连接断没断与这条新连接无关，把两段混在一起会在换项目之后
 * 立刻发一次没有意义的重读。每次开连接新建一份（就在 `openRealtimeStream` 里）。
 */
export function createOpenTracker(): { observe: () => 'first' | 'reconnect' } {
  let opened = false;
  return {
    observe() {
      const kind = opened ? 'reconnect' : 'first';
      opened = true;
      return kind;
    },
  };
}

/**
 * 接上这条流并返回它，交给调用方在卸载时 `close()`。
 * `create` 默认用浏览器的 `EventSource`；测试注入一个假的来敲那三个回调。
 */
export function openRealtimeStream(
  url: string,
  handlers: RealtimeStreamHandlers,
  create: (url: string) => RealtimeSourceLike = browserSource,
): RealtimeSourceLike {
  const source = create(url);
  const opened = createOpenTracker();

  source.attach({
    open: () => {
      handlers.onState('open');
      // 断掉那段时间一帧都没收到，所以接回来的这一刻让调用方去库里重读一次（ADR-0029）。
      // 首连不发：那时页面自己刚挂载完，权威已经读过一遍了。
      if (opened.observe() === 'reconnect') handlers.onReconnect();
    },
    // 浏览器自己会重连（readyState 仍是 CONNECTING）；只有彻底关掉才算断开
    error: () => handlers.onState(source.readyState === SOURCE_CLOSED ? 'closed' : 'connecting'),
    message: (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      const result = RealtimeEventSchema.safeParse(parsed);
      if (!result.success) return;
      handlers.onEvent(result.data);
    },
  });

  return source;
}

export function useRealtime(options: RealtimeOptions): RealtimeStatus {
  const { projectId = null, enabled = true } = options;
  const [status, setStatus] = useState<RealtimeStatus>(enabled ? { state: 'connecting', lastEvent: null, received: 0 } : IDLE);
  const callback = useRef(options.onEvent);
  callback.current = options.onEvent;
  const reconnect = useRef(options.onReconnect);
  reconnect.current = options.onReconnect;

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
    const source = openRealtimeStream(url, {
      onEvent: (event) => {
        setStatus((prev) => ({ state: 'open', lastEvent: event, received: prev.received + 1 }));
        callback.current?.(event);
      },
      onState: (state) => setStatus((prev) => ({ ...prev, state })),
      onReconnect: () => reconnect.current?.(),
    });

    return () => {
      source.close();
    };
  }, [projectId, enabled]);

  return status;
}
