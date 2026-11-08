import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { IMPORT_MAX_ZIP_BYTES, importProjectZip } from '@/server/domain/import';
import { csrfOk } from '@/server/security/csrf';
import { failure, jsonError } from '@/server/http';

/**
 * §105 CODE IMPORT 的 ZIP 那一路：把一份本平台导出的包**导回成一个新项目**。
 *
 * 这一格存在的理由不是"能上传文件"，而是 §144 的那句锁定的反面：
 * 作者带走的那份 zip 必须还能装回来。ADR-0024 里那句
 * "所有导出必须能被另一个实例重新导入"从写下那天起就是一张欠条，这里开始还。
 *
 * 三条判法与别处同源：
 * - **写请求 → CSRF 双提交先过**（`docs/SECURITY.md`、ADR-0002，与资产上传同一道门）；
 * - **没登录 401**；导入的目标永远是新建项目、永远是调用者自己的，所以这里没有归属探测，也就没有 404/403 那一段；
 * - **体积先按 Content-Length 挡**（与上传那一格同一口径：别先把整包缓冲进内存再说不）。
 *   注意这一格挡的是**包本身**的字节，解压后的三档上限在 `@/lib/zip-read` 里判——
 *   一个 200MB 的包能解出 20GB，两道门管的是两件不同的事。
 *
 * 拒收时 `reason` 是一句话、`issues` 是逐条细节；界面把两者都列出来，不要只显示第一句
 * （"清单与包内容对不上"这种话，少了那几行路径就无从下手）。
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  try {
    // 用 nullable 那一个而不是 requireUser：后者在没有 cookie 时**抛错**，
    // 于是"没登录 401"这句注释会变成永远不会走的分支——未登录的请求拿到的是 500。
    // 这一格要的是真的 401，所以显式判空。
    const user = await currentUserOrNull();
    if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });

    const declared = Number(req.headers.get('content-length') ?? '0');
    if (declared > IMPORT_MAX_ZIP_BYTES) {
      return jsonError(413, 'too_large', {
        reason: `整包 ${Math.round(declared / 1024 / 1024)}MB 超过导入上限 ${Math.round(IMPORT_MAX_ZIP_BYTES / 1024 / 1024)}MB`,
      });
    }

    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonError(400, 'unsupported_media_type', { reason: '导入必须使用 multipart/form-data 的 file 字段' });
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return jsonError(400, 'no_file', { reason: '表单里没有找到 file 字段' });

    const bytes = new Uint8Array(await file.arrayBuffer());
    // 上限在这里再判一次：Content-Length 是客户端自己写的，不作数
    if (bytes.length > IMPORT_MAX_ZIP_BYTES) {
      return jsonError(413, 'too_large', {
        reason: `整包 ${bytes.length} 字节超过导入上限 ${IMPORT_MAX_ZIP_BYTES} 字节`,
      });
    }

    const outcome = await importProjectZip(user.id, bytes);
    if (!outcome.ok) {
      // 415 而不是 400：绝大多数拒收是"这份包不是本平台这个格式的包"，
      // 与"你表单填错了"是两件事，界面对这两件事的提示语完全不同
      return jsonError(415, 'import_refused', { reason: outcome.reason, issues: outcome.issues });
    }
    // outcome 里已经带了 ok:true，不再补一个（重复的键会被展开的那个覆盖，等于这里写了两遍同一件事）
    return NextResponse.json(outcome, { status: 201 });
  } catch (error) {
    return failure(error, 'POST /api/projects/import');
  }
}
