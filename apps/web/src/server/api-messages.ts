import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n';

/**
 * §API-i18n（2026-11-15）：API 错误文案「默认 zh」的翻译表。
 *
 * 背景：本仓所有 API 的 jsonError(…, { message }) 此前一律硬编码中文散文；
 * 英文界面遇到失败时屏幕上会残留中文。这条边上**不是**让每个路由自己维护 locale，
 * 而是把 163 条 distinct 文案（2026-11-15 源码 census，见 CURRENT-STATE cont. 132）
 * 全部钉成 zh→en 精确映射，`server/http.ts` 的 `jsonError` 在响应出口集中翻译——
 * 因此任何调用点不用改调用形，只需要把 `return` 补成 `await return`（helper 变成 async）。
 *
 * 传递纪律：
 * - 缺省（cookie 缺省 / 未知 / 读不到 cookie）＝ zh，与今日字节一致——默认行为零回归；
 * - 表里没有的串原样透传（宁可未翻译，不可错译）；
 * - 带参数的模板串尽量用 pattern（^ 锚定 + 同形替换），匹配不上的原样透传；
 * - `badRequest([...])` 的 issues 数组逐项翻译。
 */
export const API_MESSAGE_EXACT: Readonly<Record<string, string>> = {
  'Agent 名册是空的（跑一次 npm run db:seed 才会播种）：没有名册就不知道每一步该交给谁，也不该假装有人在做':
    'The agent roster is empty (no `npm run db:seed` yet): without it there is no way to know who does each step, and we will not pretend there is.',
  'CSRF 校验未通过': 'CSRF check failed',
  'SELECT 1 返回形状不认识': 'Unrecognized SELECT 1 result shape',
  'action 必须是 like / comment / remix': 'action must be one of like / comment / remix',
  'body: 请求体必须是 JSON 对象': 'Request body must be a JSON object',
  'branch 参数只接受 current；这个入口不支持按指定分支 id 筛':
    'branch only accepts "current"; filtering by branch id is not supported here',
  'count 必须是数字': 'count must be a number',
  'dead 列表在本次分页内已被头部 LPUSH 改写；请刷新重来（tail 相对下标整体平移）':
    'The dead-letter list was rewritten by a head LPUSH mid-page; refresh (tail offsets shifted as a block)',
  'fromSnapshotId 必须是字符串或 null': 'fromSnapshotId must be a string or null',
  'generateCharacterPortrait 需要同时提供 characterId': 'generateCharacterPortrait requires characterId alongside it',
  'kind 只认 tokens（凭据榜）/ endpoints（端点榜）':
    'kind only accepts tokens (credential leaderboard) / endpoints (endpoint leaderboard)',
  'name 必须是字符串': 'name must be a string',
  'nodeId 必填：批注要钉在某个元素上': 'nodeId is required: an annotation must pin to a specific element',
  'pageId 不是这一版的互动终点页（或这一版没有可走通的点击流程）':
    'pageId is not this version’s interactive end page (or this version has no click-flow)',
  'path 必须是一个公开作品地址': 'path must be a public work address',
  'previewAssetId: 这个素材不存在': 'previewAssetId: no such asset',
  'q 最长 200 字符': 'q is at most 200 characters',
  'sourceId 不能为空，且最多 200 字': 'sourceId is required and at most 200 characters',
  'text 必须是字符串': 'text must be a string',
  'visibility 必须是 private / unlisted / public': 'visibility must be one of private / unlisted / public',
  'visitorKey 不合法': 'visitorKey is invalid',
  '上报太频繁': 'Reports are too frequent',
  '上架太频繁了，稍后再试': 'Too many publish attempts; try again later',
  '下载太频繁': 'Too many downloads',
  '不能购买自己的物品': 'You cannot buy your own item',
  '举报列表只对审核员（role=admin）开放': 'The report queue is open to moderators (role=admin) only',
  '举报太频繁了，稍后再试': 'Too many reports; try again later',
  '人工复核队列只对审核员（role=admin）开放': 'The manual review queue is open to moderators (role=admin) only',
  '修改太频繁了，稍后再试': 'Too many edit attempts; try again later',
  '健康总览只对审核员（role=admin）开放': 'The health overview is open to moderators (role=admin) only',
  '免费物品无需购买': 'Free items do not need purchase',
  '公开评论没有「已解决」这一说：它不钉在任何元素上':
    'There is no "resolved" state for comments: they are not pinned to any element',
  '公网发布（public）不在 v1 的能力里：机检与人工裁决在平台界面那条路上，凭据背后没有可点批准的人。v1 收 unlisted（链接可达）与 private（收回发布）；要 public 回平台「发布」面板走完那一趟。':
    'Public is not in v1’s capabilities: moderation and human approval run through the platform’s publish surface, where no API credential can click approve. v1 accepts unlisted (link-reachable) and private (unpublish); for public, go to the platform’s “Publish” panel and complete that flow.',
  '关注太频繁了，稍后再试': 'Too many follow attempts; try again later',
  '关注操作太频繁了，稍后再试': 'Too many follow attempts; try again later',
  '分支不存在或还没有可切换的快照': 'Branch does not exist, or it has no switchable snapshot yet',
  '分镜标题': 'Scene title',
  '删除操作太频繁了，稍后再试': 'Too many delete attempts; try again later',
  '参考图在清单里，但存储里的字节不见了': 'The reference image is listed but its bytes are missing from storage',
  '取消太频繁，稍后再试': 'Too many cancel attempts; try again later',
  '只有创作者本人能下架这个物品': 'Only the creator can take this item off sale',
  '只有创作者本人能修改这个物品': 'Only the creator can edit this item',
  '只有审核员（role=admin）能下结论': 'Only moderators (role=admin) can close a case',
  '只有审核员（role=admin）能处置举报': 'Only moderators (role=admin) can act on reports',
  '回复不能单独标记：要标就标它所在的那条批注': 'A reply cannot be marked on its own: mark the annotation it belongs to',
  '回收操作太频繁了，稍后再试': 'Too many reclaim operations; try again later',
  '处置太频繁了，稍后再试': 'Too many actions; try again later',
  '实时总线状态只对审核员（role=admin）开放': 'Realtime bus status is open to moderators (role=admin) only',
  '实时通道只支持 GET': 'The realtime channel only supports GET',
  '审批太频繁了，稍后再试': 'Too many approval attempts; try again later',
  '对话太频繁，稍后再试': 'Too many conversations; try again later',
  '对话失败': 'Conversation failed',
  '导出失败，源项目不存在或无权访问': 'Export failed: the source project does not exist or you do not have access',
  '导出失败，请稍后重试': 'Export failed; please try again',
  '尚未购买此物品，请先完成购买': 'You have not purchased this item; please purchase it first',
  '尝试次数过多，请稍后再试': 'Too many attempts; try again later',
  '已经购买过此物品': 'Already purchased',
  '市场审计日志只对审核员（role=admin）开放': 'Marketplace audit logs are open to moderators (role=admin) only',
  '带角色时的参考图必须是这个角色自己的肖像：先给它生成肖像，再拿那张肖像生成场景':
    'When a character is involved, the reference image must be that character’s own portrait: generate the portrait first, then generate the scene with it',
  '库里没有这枚凭据：可能已被删除，或它来自另一套环境':
    'No such credential in the database: it may have been deleted, or it belongs to another environment',
  '建凭据太频繁了，稍后再试': 'Too many token creations; try again later',
  '建项目太频繁了，稍后再试': 'Too many project creations; try again later',
  '当前是确定性 Mock，只实现了有限的指令类型':
    'Running the deterministic mock; only a limited set of instruction types is implemented',
  '当时那份请求读不回来（可能已超出今天的契约）：请重新提交一次。':
    'The original request could not be read back (it may have fallen outside today’s contract); please resubmit it.',
  '快照或项目不存在': 'Snapshot or project not found',
  '恢复太频繁了，稍后再试': 'Too many restore attempts; try again later',
  '打字太快了，歇一秒再试': 'Too fast: give it a moment',
  '换头像太频繁了，稍后再试': 'Too many avatar changes; try again later',
  '接受太频繁，稍后再试': 'Too many accept attempts; try again later',
  '提交作业太频繁了，稍后再试': 'Too many job submissions; try again later',
  '提交作业太频繁，稍后再试': 'Too many job submissions; try again later',
  '操作太频繁了，稍后再试': 'Too many operations; try again later',
  '改档位太频繁了，稍后再试': 'Too many plan changes; try again later',
  '改角色太频繁了，稍后再试': 'Too many role changes; try again later',
  '文档 id 与项目 id 不一致': 'Document id and project id mismatch',
  '无法解析 cursor（或被改写）': 'Cannot parse the cursor (it may have been rewritten)',
  '有补丁没有落到目标上（可能对应的内容已被别处改掉），这一批一条都没写':
    'Some patches did not land on their targets (the matching content may have changed elsewhere); nothing from this batch was written',
  '服务器处理失败，请稍后重试': 'The server could not process the request; please try again',
  '未测到（/healthz 不可达或形状不认识）': 'Not measured (/healthz unreachable or shape unrecognized)',
  '未配置 NEXUS_REDIS_URL，导出不可用': 'NEXUS_REDIS_URL is not configured; export unavailable',
  '本地合成器没有给出图片': 'The local synthesizer produced no image',
  '查看者（viewer）角色只读；预检与发布权属于 owner 与 editor':
    'Viewer role is read-only; preflight and publish belong to owner and editor',
  '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里':
    'Viewer role is read-only for this project; write rights belong to owner and editor',
  '查询太频繁，稍后再试': 'Too many queries; try again later',
  '检索失败': 'Search failed',
  '死信只对审核员（role=admin）开放': 'Dead letters are open to moderators (role=admin) only',
  '没有这一行（或者它不属于你）': 'No such row, or it does not belong to you',
  '没有这个举报工单': 'No such report case',
  '没有这个作者': 'No such author',
  '没有这个公开页面，或它已经不再公开': 'No such public page, or it is no longer public',
  '没有这个条目，或它已经下架': 'No such entry, or it has been taken off sale',
  '没有这个物品，举报无从谈起': 'No such item to report',
  '没有这个物品，或它已经下架': 'No such item, or it has been taken off sale',
  '没有这个项目': 'No such project',
  '没有这个项目，或者它不属于你': 'No such project, or it does not belong to you',
  '注册过于频繁，请稍后再试': 'Too many sign-ups; try again later',
  '注销尝试太频繁了，稍后再试': 'Too many deletion attempts; try again later',
  '清单里有这条资产，但存储里的字节不见了': 'The asset is listed but its bytes are missing from storage',
  '物品不存在或已下架': 'Item not found or off sale',
  '生成图在清单里，但存储里的字节不见了':
    'The generated image is listed but its bytes are missing from storage',
  '生成请求太频繁了，稍后再试': 'Too many generate attempts; try again later',
  '确认词与项目名不一致，没有删除这个项目':
    'Confirmation word does not match the project name; nothing was deleted',
  '窗口只认 1 / 7 / 30 天': 'Only 1 / 7 / 30 days are accepted as windows',
  '细部': 'Details',
  '缓存读数只对审核员（role=admin）开放': 'Cache stats are open to moderators (role=admin) only',
  '缺少 document': 'Missing document',
  '缺少 layoutBranchId': 'Missing layoutBranchId',
  '缺少 visualBranchId': 'Missing visualBranchId',
  '缺少世界文档 document': 'Missing world document',
  '缺少分支名 name': 'Missing branch name',
  '缺少游戏文档 document': 'Missing game document',
  '缺少要关注的作者': 'Missing the author to follow',
  '网关态势只对审核员（role=admin）开放': 'Gateway posture is open to moderators (role=admin) only',
  '草图与参考图互斥：要照草图画就别带参考图（草图管构图，参考图管色调，同一张图别混着来源）':
    'A sketch and a reference image are mutually exclusive: draw from the sketch or carry the reference (the sketch governs composition, the reference governs tone; don’t mix sources for one image)',
  '补丁打完后的文档过不了规模/形状门，这一批一条都没写':
    'The document failed the size/shape gate after patching; nothing from this batch was written',
  '裁决太频繁了，稍后再试': 'Too many decisions; try again later',
  '要先给一句查询。': 'Provide a query first.',
  '要先选定清哪一类记忆（?scope=…）。': 'Choose which kind of memory to clear (?scope=…) first.',
  '要带 projectId': 'Provide projectId',
  '角色对话需要接上真 provider 的 AI Service。当前是 DEMO MODE：不生成回复，也不落对话记忆。':
    'Character chat needs a real provider-backed AI Service; right now it is DEMO MODE: no replies are generated and no memories are stored.',
  '角色肖像由档案驱动，不接受参考图。要复用某个角色的肖像，就生成它的场景（不要带 generateCharacterPortrait）':
    'Character portraits are profile-driven and do not accept reference images; to reuse a character’s portrait, generate a scene of that character (omit generateCharacterPortrait)',
  '角色肖像由档案驱动，不接受草图来源': 'Character portraits are profile-driven and do not accept sketch sources',
  '计划里一个步骤都没有': 'The plan contains no steps',
  '访问账全局视图只对审核员（role=admin）开放':
    'The account-access global view is open to moderators (role=admin) only',
  '访问账导出只对审核员（role=admin）开放':
    'The account-access export is open to moderators (role=admin) only',
  '评论太频繁了，一小时后再试': 'Too many comments; try again in an hour',
  '该物品没有可导出的源项目': 'This item has no exportable source project',
  '请求体必须包含 kind+enabled 或 settings 对象': 'The request body must contain kind+enabled or a settings object',
  '请求体必须是 JSON': 'Request body must be JSON',
  '请求体必须是 JSON 对象': 'Request body must be a JSON object',
  '读取语料块失败': 'Failed to read corpus chunk',
  '购买失败，请稍后重试': 'Purchase failed; please try again',
  '这一块的语料不在库里：可能来源已删除而索引还没重建（点「重建索引」核对）':
    'This corpus block is not in the database: the source may have been deleted and the index not rebuilt yet (use “Rebuild index” to check)',
  '这一条刚刚已经被决定过了，这次没有改动。': 'This item was decided moments ago; nothing changed this time.',
  '这一步的草稿读不回来：任务不存在、不属于你，或者不属于这个项目。':
    'The draft for this step could not be read back: the task does not exist, is not yours, or does not belong to this project.',
  '这一行建于重试功能之前，没有存下当时那份请求：重试不了，请重新提交一次。':
    'This row predates retry; the original request was not stored, so retry is not possible — please resubmit it.',
  '这一行是同步请求，没有队列里的作业可重试：再按一次执行就是重跑。':
    'This row is a synchronous request; there is no queued job to retry — running it again is the retry.',
  '这不是加载慢，也不是你操作错了。服务器如实回了一句：这里没有可给的东西。常见的原因有这么几种——':
    'This is not slow loading, and you did nothing wrong: the server honestly reported there is nothing to give here. Common causes: ',
  '这个 DEMO 作业在 web 进程的内存里查不到了（重启即失，它不落任何库）':
    'This DEMO job is no longer in the web process memory (lost on restart; it never persists)',
  '这个人不在项目名册上': 'This person is not on the project roster',
  '这个作业号在你的任务里查不到': 'This job id is not found in your tasks',
  '这个作品现在不公开': 'This work is not public right now',
  '这个账号先前已经注销过了': 'This account was already deleted',
  '这个账号的实时连接太多了，先关掉几个标签页':
    'Too many live connections on this account; close a few tabs first',
  '这个项目不存在，或者不属于你。': 'This project does not exist, or it is not yours.',
  '这个项目读不到设计文档：它可能已被删除，或不属于当前账号':
    'The design document for this project cannot be read: it may have been deleted, or it does not belong to the current account',
  '这个项目还没有分镜：先写一句话切出分镜，再来渲染':
    'This project has no storyboard yet: cut a storyboard from a sentence first, then render',
  '这份分镜排不出一帧：先切出至少一镜有时长的分镜':
    'This storyboard yields no frames: cut at least one shot with a duration first',
  '这台实例只做本机即时失效；跨实例要设 NEXUS_REDIS_URL。这不是"接了但没收发"。':
    'This instance only does local immediate-expiry; cross-instance requires setting NEXUS_REDIS_URL. This is not “connected but silent”.',
  '这张参考图没有可复用的主色': 'This reference image has no reusable dominant color',
  '这次既没有可用的设计文档，也没有目录：确定性规则要读权威文档才能产出合法补丁':
    'This time neither a design document nor a catalog is available: deterministic rules need the authoritative document to emit valid patches',
  '这次没测到缓存读数，请稍后再看': 'Cache reading not measured this time; check back later',
  '这次没测到网关态势，请稍后再看': 'Gateway posture not measured this time; check back later',
  '这次请求不符合合成器的规格上限': 'This request does not meet the synthesizer’s spec limits',
  '这段简介被机检挡下，没有保存': 'This bio was blocked by the reviewer and was not saved',
  '重试太频繁，稍后再试': 'Too many retries; try again later',
  '限流闸状态只对审核员（role=admin）开放':
    'Rate-limit gate status is open to moderators (role=admin) only',
  '需要先登录': 'Sign-in required',
  '需要登录': 'Sign-in required',
  '需要登录后才能下载此物品': 'Sign in to download this item',
  '页面': 'Page',
  '项目不存在': 'Project not found',
  '项目读不到了：发布前它刚被删掉的巧合也存在':
    'The project can no longer be read: even the coincidence that it was deleted right before the publish preflight exists',
};

/** 模板消息的同形替换（中文原文含 ${} 参数位置，只能按形状匹配）。 */
const API_MESSAGE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /^项目 .+ 不在这一枚凭据所属的人名下、已被删除，或库里还没有文档$/,
    'This project is not under this credential’s owner, was deleted, or the store has no document.',
  ],
  [
    /^项目 .+ 不在这一枚凭据所属的人名下，或已被删除$/,
    'This project is not under this credential’s owner, or it has been deleted.',
  ],
  [/^项目 .+ 不存在$/, 'Project not found.'],
  [/^项目 .+ 不存在，或不属于你$/, 'Project not found, or not yours.'],
];

export type ApiMessageLocale = Locale;

/** middleware / server funnel 入口：读 cookie 得到 locale（缺省 zh，与历史一致）。 */
export async function apiLocale(): Promise<ApiMessageLocale> {
  try {
    const store = await cookies();
    const raw = store.get(LOCALE_COOKIE)?.value;
    return raw === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

/** 翻译单条 API 文案；`zh` 原文原样返回。未命中**原样透传**（宁缺毋错）。 */
export function translateApiMessage(message: string, locale: ApiMessageLocale): string {
  if (locale === 'zh') return message;
  const exact = API_MESSAGE_EXACT[message];
  if (exact !== undefined) return exact;
  for (const [re, en] of API_MESSAGE_PATTERNS) {
    if (re.test(message)) return en;
  }
  return message;
}

/** 逐项翻译 issues 数组（badRequest 的整数组出口），保持数组形状。 */
export function translateApiIssues(issues: readonly unknown[], locale: ApiMessageLocale): unknown[] {
  if (locale === 'zh') return [...issues];
  return issues.map((item) => (typeof item === 'string' ? translateApiMessage(item, locale) : item));
}
