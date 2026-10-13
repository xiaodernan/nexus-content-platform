import { NextResponse } from 'next/server';
import { generateGameCode, CODEGEN_LIMITS } from '@nexus/game-model';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { loadGame } from '@/server/domain/games';
import { failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §52 那条链最后一格（Code）的出口：把**库里那份游戏设计**投影成一份拿得走的产物。
 *
 * 为什么它不写库：`generateGameCode` 是纯字符串投影（§16：设计文档是唯一真值，产物只是它的一个投影）。
 * 设计改一个数、重新生成一次就是新的字节——所以这里**没有**"保存产物"这一步，
 * 也就不用回答"产物存哪、任务行放不放整份 HTML"（那是下一格的事）。落库的仍只有设计本身。
 *
 * 三条限度随产物一起念出来，不只写在注释里（CODEGEN_LIMITS）：
 * - 产物是引擎的**转写**，不是说"产物就是平台跑的那一套"；
 * - §81：这一格不 eval、不起子进程、不读写文件、不联网，产物自带 CSP（connect-src 'none'）；
 * - 响应体有界：超过上限回 413 并报出字节数，而不是把一份 unbounded 的 JSON 塞给客户端。
 */

/** 响应体上限（字节）。判据是"端点响应不该无界"，不是量出来的档位——超了回 413 并说清数 */
const MAX_RESPONSE_BYTES = 1_000_000;

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();

    const result = await loadGame(projectId);
    if (!result) {
      return jsonError(404, 'game_missing', {
        message: '这份项目还没有游戏设计：先在游戏面板里「创建游戏骨架」，再回来生成产物。',
      });
    }
    if (!result.ok) return jsonError(500, 'game_unreadable', { message: result.reason });

    const output = generateGameCode(result.document);
    if (output.bytes > MAX_RESPONSE_BYTES) {
      return jsonError(413, 'code_too_large', {
        message: `产物 ${output.bytes} 字节，超过单次响应上限 ${MAX_RESPONSE_BYTES}：先把设计拆小，或走下载通道（那一格还没接）。`,
        bytes: output.bytes,
        limit: MAX_RESPONSE_BYTES,
      });
    }

    return NextResponse.json({
      ok: true,
      files: output.files,
      notes: output.notes,
      bytes: output.bytes,
      limits: CODEGEN_LIMITS,
    });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/game/code`);
  }
}
