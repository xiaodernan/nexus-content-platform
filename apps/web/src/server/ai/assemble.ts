import type { AiRequest } from '@nexus/schemas';
import type { DesignDocument } from '@nexus/design-model';
import { buildCodeDigest, DEFAULT_CODE_CHAR_BUDGET } from '@/server/domain/code-index';
import { buildProjectContext } from '@/server/domain/context';
import { projectBelongsTo } from '@/server/domain/projects';

/**
 * §68 的落地半：AI 请求的上下文由**服务端装配**，客户端只报"我在哪、选了什么"。
 *
 * 为什么要抽成一处：这条边界上有三件事必须同时成立，分散在路由里写就会漏——
 * 1. 项目归属先查（这里会读别人的文档，不查就是 IDOR）；
 * 2. 发给 provider 的那一份是**预算内的目录**（`designIndex` + `codeDigest`），不是整份文档；
 * 3. 确定性规则要算"当前值"就得读权威文档，但那是**工具侧的本地读取**，
 *    不走网络、不进模型上下文，所以它和 §68 不冲突——冲突的是把文档塞进请求体。
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
    }
  | { ok: false; status: 400 | 404 | 409; code: string; message: string };

export async function assembleAiRequest(request: AiRequest, ownerId: string): Promise<AssembleResult> {
  const { document: clientDocument, ...context } = request.context;
  if (clientDocument !== undefined) {
    return {
      ok: false,
      status: 400,
      code: 'context_document_not_allowed',
      message: '上下文里的整份设计文档由服务端装配，客户端不再上传（§68）。只发 projectId/pageId/selection 就够了。',
    };
  }

  const { projectId } = context;
  if (!(await projectBelongsTo(projectId, ownerId))) {
    return { ok: false, status: 404, code: 'project_not_found', message: '这个项目不存在，或者不属于你。' };
  }

  const assembled = await buildProjectContext(projectId, ownerId, {});
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

  return {
    ok: true,
    toolDocument: assembled.document,
    wire: {
      ...request,
      context: {
        ...context,
        designIndex: assembled.context.design,
        codeDigest,
        indexChars: assembled.context.sizes.indexChars,
        budgetChars: assembled.context.sizes.budgetChars,
      },
    },
  };
}
