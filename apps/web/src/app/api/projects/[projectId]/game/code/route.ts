import { NextResponse } from 'next/server';
import { CODEGEN_LIMITS } from '@nexus/game-model';
import { requireUser } from '@/server/domain/session';
import { MAX_CODE_JSON_BYTES, MAX_CODE_ZIP_BYTES, projectGameCode } from '@/server/domain/gameCode';
import { failure, jsonError } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §52 那条链最后一格（Code）的出口：把**库里那份游戏设计**投影成一份拿得走的产物。
 *
 * 为什么它不写库：`generateGameCode` 是纯字符串投影（§16：设计文档是唯一真值，产物只是它的一个投影）。
 * 设计改一个数、重新生成一次就是新的字节——所以这里**没有**"保存产物"这一步，
 * 也就不用回答"产物存哪、任务行放不放整份 HTML"。落库的仍只有设计本身。
 *
 * 归属判定、"还没有设计"、"设计读不出来"三件事都在 `projectGameCode` 那一格里，
 * 与 `.../game/code/zip` 共用同一条闸口——只有 413 那一档留在这里，因为它量的是**这一路**的响应体。
 *
 * 三条限度随产物一起念出来，不只写在注释里（CODEGEN_LIMITS）：
 * - 产物是引擎的**转写**，不是说"产物就是平台跑的那一套"；
 * - §81：这一格不 eval、不起子进程、不读写文件、不联网，产物自带 CSP（connect-src 'none'）；
 * - 响应体有界：超过上限回 413 并报出字节数，而不是把一份 unbounded 的 JSON 塞给客户端。
 */

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    const gate = await projectGameCode(user, projectId);
    if (!gate.ok) {
      const { refusal } = gate;
      return jsonError(refusal.status, refusal.error, 'message' in refusal ? { message: refusal.message } : {});
    }

    const { output } = gate;
    if (output.bytes > MAX_CODE_JSON_BYTES) {
      return jsonError(413, 'code_too_large', {
        message: `产物 ${output.bytes} 字节，超过单次 JSON 响应上限 ${MAX_CODE_JSON_BYTES}：改用「打包下载」（zip 那一档是 ${MAX_CODE_ZIP_BYTES} 字节），或者把设计拆小。`,
        bytes: output.bytes,
        limit: MAX_CODE_JSON_BYTES,
      });
    }

    return NextResponse.json({
      ok: true,
      files: output.files,
      notes: output.notes,
      bytes: output.bytes,
      limits: CODEGEN_LIMITS,
      kindPipeline: output.kindPipeline,
      artifactChain: output.artifactChain,
      kindNote: output.kindNote,
    });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/game/code`);
  }
}
