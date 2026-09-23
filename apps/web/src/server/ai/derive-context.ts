import type { DesignDocument } from '@nexus/design-model';
import { buildSelectionDigest } from '@nexus/design-model';

/**
 * 「这一轮的现场」唯一的算法（§68）：选中了什么、设计系统里有什么，全部由**权威文档**回答。
 *
 * 为什么单独一个文件：这份逻辑同时被两处用——服务端装配 AI 请求时，和
 * `scripts/ai-request-fixture.ts` 生成 Python 侧夹具时。放一起是为了让"漂移"无处可藏：
 * 改了这里的形状，导出的夹具和 `test_prompt.py` 会当场不一致，而不是各自演化成两套现实。
 * 纯函数：不读库、不碰时钟，所以夹具那一路不需要连上 Postgres。
 */
export function deriveContextFromDocument(
  document: DesignDocument,
  context: { pageId?: string | null; selection: string[] },
) {
  return {
    // "选了哪个节点"由文档回答：认不出的 id 进 missing，从页面根走不到的进 unreachable，
    // 谎报或过期的 id 会被如实带下去，而不是被当成现场（§159）
    selectionDigest: buildSelectionDigest(document, {
      pageId: context.pageId ?? null,
      selection: context.selection,
    }),
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
