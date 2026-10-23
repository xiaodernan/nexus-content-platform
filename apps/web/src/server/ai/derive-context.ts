import type { DesignDocument } from '@nexus/design-model';
import { buildSelectionDigest } from '@nexus/design-model';
import type { AnnotationContext } from '@nexus/schemas';

/** 一次请求最多带多少条批注：再多就把话说完，模型不必在 200 条便签里找线索 */
export const ANNOTATION_CONTEXT_LIMIT = 20;

/**
 * 「这一轮的现场」唯一的算法（§68）：选中了什么、设计系统里有什么、元素上留了什么话，
 * 全部由**权威文档**回答。
 *
 * 为什么单独一个文件：这份逻辑同时被两处用——服务端装配 AI 请求时，和
 * `scripts/ai-request-fixture.ts` 生成 Python 侧夹具时。放一起是为了让"漂移"无处可藏：
 * 改了这里的形状，导出的夹具和 `test_prompt.py` 会当场不一致，而不是各自演化成两套现实。
 * 纯函数：不读库、不碰时钟，所以夹具那一路不需要连上 Postgres
 * （批注由调用方从库里取好传进来，这里只负责按文档核对与截断）。
 */
export function deriveContextFromDocument(
  document: DesignDocument,
  context: {
    pageId?: string | null;
    selection: string[];
    annotations?: { nodeId: string; body: string }[];
    /** 已标记「已解决」而被略过的条数：不带上去，但要说明少了几条（§159 不静默降级） */
    resolvedCount?: number;
  },
) {
  return {
    // "选了哪个节点"由文档回答：认不出的 id 进 missing，从页面根走不到的进 unreachable，
    // 谎报或过期的 id 会被如实带下去，而不是被当成现场（§159）
    selectionDigest: buildSelectionDigest(document, {
      pageId: context.pageId ?? null,
      selection: context.selection,
    }),
    ...deriveAnnotations(document, context.annotations ?? [], context.resolvedCount ?? 0),
    designSystemDigest: {
      tokens: document.tokens.map((token) => ({ key: token.key, type: token.type, value: token.value })),
      components: document.components.map((component) => ({
        id: component.id,
        name: component.name,
        props: Object.fromEntries(
          component.props.map((prop) => [prop.name, { type: prop.type, default: prop.default }]),
        ),
      })),
    },
  };
}

/**
 * 批注的定位由文档回答：节点在哪个页面、叫什么名字，看文档而不是看调用方给的；
 * 节点已经不在文档里的批注不带（并写进 note），因为"钉在一个不存在的元素上"
 * 只会让模型去猜那个 id 像什么。
 *
 * `resolvedCount` 是调用方已经滤掉的那部分（§111「已解决」）：它不带上来，
 * 但要写进 note——静默少给几条，模型只会以为"这个人没别的话要说"。
 */
function deriveAnnotations(
  document: DesignDocument,
  incoming: { nodeId: string; body: string }[],
  resolvedCount: number,
): { annotations: AnnotationContext[]; annotationsNote?: string } {
  const located = new Map<string, { pageId: string; pageName: string; nodeName: string }>();
  for (const page of document.pages) {
    for (const node of Object.values(page.nodes)) {
      if (!located.has(node.id)) located.set(node.id, { pageId: page.id, pageName: page.name, nodeName: node.name });
    }
  }

  const kept: AnnotationContext[] = [];
  let dangling = 0;
  for (const annotation of incoming) {
    const where = located.get(annotation.nodeId);
    const body = annotation.body.trim().slice(0, 1000);
    if (!where || !body) {
      dangling += 1;
      continue;
    }
    kept.push({ nodeId: annotation.nodeId, pageId: where.pageId, pageName: where.pageName, nodeName: where.nodeName, body });
  }

  const entries = kept.slice(0, ANNOTATION_CONTEXT_LIMIT);
  const notes: string[] = [];
  if (kept.length > entries.length) {
    notes.push(`批注共 ${kept.length} 条，只带上前 ${ANNOTATION_CONTEXT_LIMIT} 条（按写入时间从新到旧）`);
  }
  if (dangling) {
    notes.push(`${dangling} 条批注钉的节点已经不在文档里，没有带上——批注要能定位才有意义`);
  }
  if (resolvedCount > 0) {
    notes.push(`${resolvedCount} 条批注已标记为已解决，没有带上——要动它们标的那个元素就重新打开`);
  }
  return notes.length
    ? { annotations: entries, annotationsNote: `；${notes.join('；')}`.slice(1) }
    : { annotations: entries };
}
