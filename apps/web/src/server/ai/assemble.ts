import type { AiRequest } from '@nexus/schemas';
import type { DesignDocument } from '@nexus/design-model';
import { WEB_APPROVAL_POLICY } from '@/server/ai/approvals';
import { buildCodeDigest, DEFAULT_CODE_CHAR_BUDGET } from '@/server/domain/code-index';
import { deriveContextFromDocument } from '@/server/ai/derive-context';
import { listAnnotations } from '@/server/domain/annotations';
import { loadRoster, resolveAgent, type ResolvedAgent } from '@/server/domain/agents';
import { buildProjectContext } from '@/server/domain/context';
import { projectVisibleTo } from '@/server/domain/team';

/**
 * §68 的落地半：AI 请求的上下文由**服务端装配**，客户端只报"我在哪、选了什么"。
 *
 * 为什么要抽成一处：这条边界上有三件事必须同时成立，分散在路由里写就会漏——
 * 1. 项目归属先查（这里会读别人的文档，不查就是 IDOR）；
 * 2. 发给 provider 的那一份是**预算内的目录**（`designIndex` + `codeDigest`），不是整份文档；
 * 3. 确定性规则要算"当前值"就得读权威文档，但那是**工具侧的本地读取**，
 *    不走网络、不进模型上下文，所以它和 §68 不冲突——冲突的是把文档塞进请求体。
 * 4. §74 的审批策略是**权限判断**，不是现场描述：请求方自己填的那一栏在这里被服务端改写。
 * 5. §112 的"这一轮由哪个 Agent 负责、它的职责是什么"同理：客户端可以**提名**（`agentKey`），
 *    但名册、职责与权限（`agent`）只有服务端这一份——让请求方自报职责，等于让它自己写"我可以改画布"。
 *
 * 三条都失败时各自给出读得懂的原因，不静默降级（§159）。
 */

export type AssembleResult =
  | {
      ok: true;
      /** 转发给 provider 的那一份：带目录，不带文档 */
      wire: AiRequest;
      /** 只给 web 进程内的确定性工具用；就是装配目录时读到的那一份，没有第二次读取 */
      toolDocument: DesignDocument;
      /** §111/§112：这一轮交给谁（含点了名但名册里没有的，路由要把它记进行并说给界面） */
      agent: ResolvedAgent;
    }
  | { ok: false; status: 400 | 404 | 409; code: string; message: string };

/** 客户端上传即拒绝的几份：都是"现场描述"或"权限"，服务端能自己算，让客户端发就等于让请求方定义现实 */
const SERVER_DERIVED = {
  document: '整份设计文档',
  selectionDigest: '选中节点的描述',
  designSystemDigest: '设计系统摘要',
  annotations: '元素上留下的批注',
  annotationsNote: '批注被省略的说明',
  agent: '这一轮负责的 Agent 及其职责与权限',
} as const;

/**
 * 由权威文档派生"这一轮的现场"：见 `derive-context.ts`。那里同时是夹具生成脚本的入口，
 * 所以这条派生逻辑全仓库只有一份。
 */

export async function assembleAiRequest(request: AiRequest, ownerId: string): Promise<AssembleResult> {
  // §112：负责这一轮的 Agent 由服务端定，客户端上传的那一份在这里被摘掉
  const { agent: clientAgent, ...rest } = request;
  const {
    document: clientDocument,
    selectionDigest: clientSelection,
    designSystemDigest: clientSystem,
    annotations: clientAnnotations,
    annotationsNote: clientAnnotationsNote,
    ...context
  } = rest.context;
  // 这几份契约上都刻意没有默认值：`!== undefined` 就是"客户端确实发了这一份"
  for (const [value, field] of [
    [clientDocument, 'document'],
    [clientSelection, 'selectionDigest'],
    [clientSystem, 'designSystemDigest'],
    [clientAnnotations, 'annotations'],
    [clientAnnotationsNote, 'annotationsNote'],
    [clientAgent, 'agent'],
  ] as const) {
    if (value !== undefined) {
      return {
        ok: false,
        status: 400,
        code: field === 'agent' ? 'agent_not_allowed' : `context_${field}_not_allowed`,
        message:
          field === 'agent'
            ? '这一轮由哪个 Agent 负责、它的职责与权限，由服务端按名册装配（§112）。客户端只发 agentKey 提名，或者直接在提示词里 @xxx。'
            : `上下文里的${SERVER_DERIVED[field]}由服务端按库里的权威文档装配，客户端不再上传（§68）。` +
              '只发 projectId/pageId/selection 就够了。',
      };
    }
  }

  const { projectId } = context;
  if (!(await projectVisibleTo(projectId, ownerId))) {
    return { ok: false, status: 404, code: 'project_not_found', message: '这个项目不存在，或者不属于你。' };
  }

  // §49 × §66-71：这一轮的提示词就是语料的查询词。用户说什么，就去项目自己的语料里
  // 按相关性取回什么（世界条目、角色、记忆、分镜、游戏设计、设计正文），
  // 而不是只报一个"库里有多少块"。
  const assembled = await buildProjectContext(projectId, ownerId, { corpusQuery: request.prompt });
  if (!assembled.ok) {
    return { ok: false, status: 409, code: 'context_unavailable', message: assembled.reason };
  }

  // §69：代码目录按这一轮请求排序后只发靠前的几份。位置（当前页、选中节点）与关键词同权，
  // 因为"我在改哪一页"比"用户怎么措辞"更可靠地指向要动的文件。
  const codeDigest = buildCodeDigest(assembled.context.code, {
    query: request.prompt,
    pageId: context.pageId ?? null,
    nodeIds: context.selection,
    maxChars: DEFAULT_CODE_CHAR_BUDGET,
  });
  if (assembled.context.code.dropped) {
    codeDigest.trimmed.push('上下文里的代码目录被预算裁过：排序只看得到裁剩的符号，被裁掉的那部分不参与命中');
  }

  const document = assembled.document;
  // §111：批注从库里按项目读，再由 derive 按文档核对定位——客户端说的 nodeId 不算数。
  // 已标记「已解决」的那部分不带上去：它的意思是"这句话已经处理过了"，
  // 再喂给模型就是让它把已经收工的事重做一遍。少给的那几条由 note 说明，不静默。
  const stored = await listAnnotations(projectId);
  const open = stored.filter((a) => a.resolvedAt === null);
  const derived = deriveContextFromDocument(document, {
    ...context,
    annotations: open.map((a) => ({ nodeId: a.nodeId, body: a.body })),
    resolvedCount: stored.length - open.length,
  });
  // §112：这一轮交给谁。提名可以来自三处——请求那一栏、提示词里的 @xxx、批注里的 @xxx；
  // 名册是唯一的裁判，而它读的是库（`scripts/db-seed.mts` 播种的那 13 行）。
  const resolved = resolveAgent(await loadRoster(), {
    agentKey: rest.agentKey,
    prompt: rest.prompt,
    annotations: open.map((a) => a.body),
  });
  return {
    ok: true,
    toolDocument: document,
    agent: resolved,
    wire: {
      ...rest,
      /**
       * §74：审批策略由服务端定，客户端带的一律丢掉。契约上 `approvalPolicy` 有默认值（`[]`），
       * 也就是说"不发这一栏"与"发一个空的"过 zod 之后长得一样——既然分不出，就不能只改非空的那些：
       * 这一栏每一次都由 `WEB_APPROVAL_POLICY` 重写。留给请求方填，等于让请求方自己勾选"这次不要审批"。
       */
      approvalPolicy: [...WEB_APPROVAL_POLICY],
      /** §112：职责与权限随报文走。provider 不连业务库，名册只能这样递过去 */
      ...(resolved.agent
        ? {
            agent: {
              key: resolved.agent.key,
              name: resolved.agent.name,
              responsibilities: resolved.agent.responsibilities,
              capabilities: resolved.agent.capabilities,
            },
          }
        : {}),
      context: {
        ...context,
        designIndex: assembled.context.design,
        codeDigest,
        // §49 × §66-71：这一轮按提示词从项目语料库取回的内容也发给 provider
        corpus: assembled.context.corpus,
        indexChars: assembled.context.sizes.indexChars,
        budgetChars: assembled.context.sizes.budgetChars,
        selectionDigest: derived.selectionDigest,
        designSystemDigest: derived.designSystemDigest,
        annotations: derived.annotations,
        ...(derived.annotationsNote ? { annotationsNote: derived.annotationsNote } : {}),
      },
    },
  };
}
