import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectWriteAccess } from '@/server/domain/team';
import { projectVisibleTo } from '@/server/domain/team';
import { currentBranchId, listBranches } from '@/server/domain/branches';
import { createSnapshot, listSnapshots } from '@/server/domain/snapshots';
import { parseDocument } from '@/server/validation';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §27：快照列表只回元信息，文档体在需要时单独取。
 * 分支一起返回：历史面板同时画这两样，拆成两个请求只会让面板多一处会不同步的状态。
 *
 * `?branch=current` 把列表收窄成"当前那条线上的快照"（§27 历史面板的「只看当前分支」）。
 * 两件事要说清：
 * - 筛选在**服务端**做，不是把全量发给浏览器再裁。`listSnapshots` 带着 200 行上限，
 *   客户端裁得到的是"最近 200 条里属于这一分支的"，服务端筛的才是"这一分支最近的 200 条"——
 *   分支切换越勤，两者的差额越大（每次切换都往原分支补一条现场快照）。
 * - 只认字面量 `current`，不认分支 id。别的名词一律 400：把 `?branch=<uuid>` 当成"没这个参数"
 *   悄悄回全量，面板上那句"只看当前分支"就成了谎话。
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  const branchParam = new URL(req.url).searchParams.get('branch');
  if (branchParam !== null && branchParam !== 'current') {
    return badRequest(['branch 参数只接受 current；这个入口不支持按指定分支 id 筛']);
  }
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    // 先取分支、再取快照，两处都是为了让"当前"只有一个答案：
    // ① 筛选用的是同一份 branchList 里标了 current 的那条，面板高亮与列表内容不会各算一次而分叉
    //    （currentBranchId() 与 listBranches 的 tie-break 规则并不完全同源：一个按 createdAt，一个先按 isDefault）；
    // ② listBranches 里的 ensureDefaultBranch 会把没挂分支的快照认领进 main。今天的新项目建出来就带着
    //    main（domain/projects.ts 的 writeNewProject），所以这条路只剩老项目与将来真的删分支时才会走到——
    //    但顺序反了就会在那一天当场出错：先算 currentBranchId 得到 null，筛的是 branch_id IS NULL 那一批，
    //    而响应里的 branchList 已经把同一批算成 main 的了，面板高亮 main、行上却一个章都没盖。
    const branchList = await listBranches(projectId);
    const currentId = branchList.find((branch) => branch.current)?.id ?? null;
    const snapshotList = await listSnapshots(projectId, branchParam === null ? undefined : { branchId: currentId });
    return NextResponse.json({ snapshots: snapshotList, branches: branchList });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/snapshots`);
  }
}

/** 客户端能建的快照类型：手工命名与 AI 事务。import/publish/branch 由服务端流程自己写。 */
const CLIENT_SOURCES = new Set(['manual', 'ai']);

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return badRequest(['请求体必须是 JSON 对象']);
  const { document, label, summary, source } = body as {
    document?: unknown;
    label?: unknown;
    summary?: unknown;
    source?: unknown;
  };
  if (!document) return badRequest(['缺少 document']);
  const parsed = parseDocument(document);
  if (!parsed.ok) return badRequest(parsed.issues);
  if (parsed.document.id !== projectId) {
    return jsonError(409, 'id_mismatch', { message: '文档 id 与项目 id 不一致' });
  }
  const kind = typeof source === 'string' && CLIENT_SOURCES.has(source) ? source : 'manual';
  try {
    const user = await requireUser();
    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });
    const snapshot = await createSnapshot(projectId, {
      document: parsed.document,
      source: kind as 'manual' | 'ai',
      label: typeof label === 'string' ? label : null,
      summary: typeof summary === 'string' ? summary : null,
      createdById: user.id,
      // 手动/AI 快照落在当前分支上，并推进它的 head（§28）；
      // 没有分支行（历史项目）时返回 null，快照就留在分支线之外，仍可恢复。
      branchId: await currentBranchId(projectId),
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/snapshots`);
  }
}
