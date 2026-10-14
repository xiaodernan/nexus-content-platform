import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { slug } from '@/server/domain/export';
import { MAX_CODE_ZIP_BYTES, projectGameCode } from '@/server/domain/gameCode';
import { textEntry, zipStore } from '@/lib/zip';
import { failure, jsonError } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §52 最后一格的**下载出口**：把同一份产物打成一次拿得走的 zip。
 *
 * 为什么要有这一格而不只是 JSON 那一个：JSON 那一路把七个文件的内容放进报文里，
 * 客户端要自己一个个存盘；一份认真要做的设计（几百个实体）本来就撑得过 1MB 那一档，
 * 于是"超过上限就把设计拆小"这句劝告对它是真的，对"我就想整份拿走"不是。
 * zip 这一路吃的仍是**库里那份设计**（`projectGameCode`，与 JSON 同一个闸口、同一套 404/500），
 * 所以两个出口里的 `plan.json` 逐字节相同——这一条有集成测试钉着，因为它就是"同一份真值、两个投影"的意思。
 *
 * §144 的那份 zip 写入器只用 store（不压缩）：包里全是文本，体积不是瓶颈，
 * 而路径要先过 `safePath` 那道 zip slip 检查（绝对路径 / `..` / 盘符都会让解压方把文件写到包外）。
 *
 * 这一格只读、不写库、不执行产物（§81）：生成的字节直接从内存进响应，不落盘也不 eval。
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

    const { document, output } = gate;
    if (output.bytes > MAX_CODE_ZIP_BYTES) {
      return jsonError(413, 'code_too_large', {
        message: `产物 ${output.bytes} 字节，超过单次下载上限 ${MAX_CODE_ZIP_BYTES}：把这一份拆成几份设计（zip 是 store 不压缩，拆小才会真的变小）。`,
        bytes: output.bytes,
        limit: MAX_CODE_ZIP_BYTES,
      });
    }

    const bytes = zipStore(output.files.map((file) => textEntry(file.path, file.contents)));
    // 回执上的数字是服务端自己数的（§159）：客户端要解包才知道有几个文件，
    // 而"打包成功"这句话不该等到那时才敢说。zip 的字节数与响应头里的 content-length 同源。
    // 头只收 Latin1：中文设计名必须编码后再进 `x-nexus-code-receipt`，否则整个响应会因为
    // 一个字符抛错回 500（`Cannot convert argument to a ByteString`）——集成测试用一份
    // 中文命名的设计钉这一条。用 URI 编码而不是 `\uXXXX`：JSON.stringify 会把反斜杠再转义一次，
    // 客户端拿回来的是转义文本而不是那个字符。
    const receipt = JSON.stringify({
      files: output.files.length,
      artifactBytes: output.bytes,
      zipBytes: bytes.length,
      documentName: encodeURIComponent(document.name),
    });
    // HTTP 头比 zip 内部挑剔：filename 只留 ASCII 兜底，真名走 RFC 5987 的 filename*
    const filename = `nexus-game-${slug(document.name)}.zip`;
    const ascii = filename.replace(/[^\x20-\x7e]/g, '') || 'nexus-game.zip';
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'content-length': String(bytes.length),
        'x-nexus-code-receipt': receipt,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/game/code/zip`);
  }
}
