import { NextResponse } from 'next/server';
import type { RealtimeEvent } from '@nexus/schemas';
import { currentUserOrNull } from '@/server/domain/session';
import { projectVisibleTo } from '@/server/domain/team';
import { channels, getRealtimeBus } from '@/server/realtime/bus';
import { acquireConnection, releaseConnection } from '@/server/realtime/connections';
import { jsonError } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * §163 的实时通道。传输用 SSE，取舍与限度写在 `docs/adr/0010-realtime-sse-not-websocket.md`。
 *
 * 一条连接覆盖两个频道：**用户频道**（§164 的通知，与项目无关）与**项目频道**
 * （generation / agent / build / preview 进度，要带 `?projectId=` 且校验所有权）。
 * 拆成两条连接会让每个标签页占两条长连接，而浏览器对同源 HTTP/1.1 只有约 6 条。
 *
 * 三件必须做的事：
 * - **鉴权与所有权走同一条路**。SSE 是普通 HTTP，所以会话与 `projectVisibleTo` 原样生效——
 *   这也是不选独立 WS 进程的理由之一（见 ADR）。
 * - **心跳**。没有数据的连接会被中间代理静默掐断，且断了客户端不知道；定期发一行注释保活。
 * - **断开就退订**。客户端关页面时浏览器会 abort，不清理就会留下一个永远收不到人的定时器。
 */

/** 25s：低于常见代理的 30–60s 空闲超时，又不至于让心跳占满带宽 */
const HEARTBEAT_MS = 25_000;

/**
 * 最长连接寿命（毫秒），0 = 不限（生产默认）。
 *
 * 这格旋钮只有一个用途：给 e2e 一条**诚实**的断线制造法。CDP 的
 * `emulateNetworkConditions({offline:true})` 打不断已建立的 SSE（旧 e2e 因此删掉而不说假话，
 * 记在 ADR-0029 的验证一节），而"服务端主动关流"正是生产断线在客户端走的那条同一路径：
 * 流结束 → error（浏览器自动重连）→ open → onReconnect 重读权威。
 * 到点走的是同一个 `cleanup`（退订 + 停心跳 + 释放名额），不会留下半条连接。
 */
const MAX_LIFETIME_MS = Number(process.env.NEXUS_REALTIME_MAX_LIFETIME_MS ?? 0) || 0;

export async function GET(req: Request): Promise<Response> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });

  const projectId = new URL(req.url).searchParams.get('projectId');
  if (projectId && !(await projectVisibleTo(projectId, user.id))) {
    // 与其它入口同一口径：不属于你的项目一律 404，不区分"不存在"与"不是你的"
    return jsonError(404, 'not_found');
  }

  if (!acquireConnection(user.id)) {
    return jsonError(429, 'too_many_streams', { message: '这个账号的实时连接太多了，先关掉几个标签页' });
  }

  const bus = getRealtimeBus();
  const encoder = new TextEncoder();

  let unsubscribeUser: (() => void) | null = null;
  let unsubscribeProject: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let lifetime: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  /** 收尾：退订 + 停心跳 + 释放名额。必须幂等——abort 与 stream.cancel 都可能走到这里 */
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (lifetime) clearTimeout(lifetime);
    unsubscribeUser?.();
    unsubscribeProject?.();
    releaseConnection(user.id);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: RealtimeEvent) => {
        if (closed) return;
        try {
          // SSE 帧格式：event 行 + data 行 + 空行结尾。JSON 里的换行不会出现（报文是单行 JSON）
          controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // 连接已经断了但 abort 还没到：直接收尾，别继续往一个死 controller 里写
          cleanup();
        }
      };

      // 先发一条注释，让客户端立刻知道连接已经建立（不用等第一个真实事件）
      controller.enqueue(encoder.encode(': connected\n\n'));

      unsubscribeUser = bus.subscribe(channels.user(user.id), send);
      if (projectId) unsubscribeProject = bus.subscribe(channels.project(projectId), send);

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      const onAbort = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // 已经关了，忽略
        }
      };
      if (req.signal.aborted) onAbort();
      else req.signal.addEventListener('abort', onAbort, { once: true });

      // 寿命到点：与断开同一条收尾路径（幂等），然后真正关掉流——客户端看到的就是一次断线
      if (MAX_LIFETIME_MS > 0) {
        lifetime = setTimeout(() => {
          cleanup();
          try {
            controller.close();
          } catch {
            // 已经关了，忽略
          }
        }, MAX_LIFETIME_MS);
      }
    },
    cancel() {
      // 客户端主动取消（关标签页、切路由）
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // 告诉 nginx 这类反代别缓冲，否则事件会攒着一起发
      'x-accel-buffering': 'no',
    },
  });
}

/** 这条通道是只读的，写请求一律拒绝（避免有人把它当 RPC 端点用） */
export async function POST(): Promise<NextResponse> {
  return jsonError(405, 'method_not_allowed', { message: '实时通道只支持 GET' });
}
