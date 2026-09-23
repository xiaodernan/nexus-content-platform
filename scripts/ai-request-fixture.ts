import { buildDesignIndex, createDocument, fitIndexToBudget, type DesignDocument } from '../packages/design-model/src';
import { AiRequestSchema, type AiRequest } from '../packages/schemas/src';
import { buildCodeDigest, buildCodeIndex, fitCodeIndexToBudget } from '../apps/web/src/server/domain/code-index';
import { deriveContextFromDocument } from '../apps/web/src/server/ai/derive-context';

/** 导出位置（相对仓库根）；Python 侧 `tests/test_prompt.py` 读的就是这一份 */
export const AI_REQUEST_FIXTURE_FILE = 'contracts/fixtures/ai-request-with-index.json';

function stabilizeIds(document: DesignDocument): DesignDocument {
  // uid() 给的是随机号，每次导出都不同 ⇒ 夹具会无谓地产生 diff。换成稳定名字（长的先替换，避免互相吃掉）
  const ids = new Set<string>([document.id, document.activePageId ?? '']);
  for (const page of document.pages) {
    ids.add(page.id);
    ids.add(page.rootId);
    for (const node of Object.values(page.nodes)) ids.add(node.id);
  }
  let text = JSON.stringify(document);
  [...ids]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach((id, index) => {
      text = text.split(id).join(`fx${String(index).padStart(3, '0')}`);
    });
  const stable = JSON.parse(text) as DesignDocument;
  // 时间戳同理：不钉住的话每次导出都产生一条"什么都没变"的 diff
  stable.metadata.createdAt = '2026-01-01T00:00:00.000Z';
  stable.metadata.updatedAt = stable.metadata.createdAt;
  return stable;
}

/**
 * 一份**真的**由装配代码算出来的 AiRequest（§68 之后线上没有 document，只有两份目录）。
 * 为什么导出来而不是在 Python 里手抄一份：手抄的目录会漂——TS 侧改了字段，
 * Python 的测试仍然对着旧形状全绿，而真实请求已经读不到东西。
 * 纯内存、不碰库、同一输入两次输出字节相同（`contract-fixture.test.ts` 钉这两条）。
 */
export function buildAiRequestFixture(): AiRequest {
  const document = stabilizeIds(createDocument('契约夹具'));
  const page = document.pages[0]!;
  const headline = Object.values(page.nodes).find((node) => node.name === 'Headline')!;
  const index = fitIndexToBudget(buildDesignIndex(document));
  const digest = buildCodeDigest(fitCodeIndexToBudget(buildCodeIndex(document)), {
    query: '把 Hero 的主标题改成 72px',
    pageId: page.id,
    nodeIds: [headline.id],
  });
  // 现场那一份（选中了什么 / 设计系统里有什么）走服务端同一个函数：夹具不是手抄出来的
  const derived = deriveContextFromDocument(document, { pageId: page.id, selection: [headline.id] });
  return AiRequestSchema.parse({
    requestId: 'req_fixture',
    intent: 'design-edit',
    prompt: '把 Hero 的主标题改成 72px',
    modelClass: 'balanced',
    variants: 1,
    context: {
      projectId: 'fx_project',
      pageId: page.id,
      viewport: 'desktop',
      selection: [headline.id],
      selectionDigest: derived.selectionDigest,
      designSystemDigest: derived.designSystemDigest,
      designIndex: index,
      codeDigest: digest,
      indexChars: JSON.stringify(index).length,
      budgetChars: 20_000,
      recentChanges: [],
    },
    references: [],
    approvalPolicy: [],
    dryRun: false,
  });
}

/** 落盘的文本形态：与 `writeFileSync(..., JSON.stringify(fixture, null, 2) + "\n")` 一致 */
export function renderAiRequestFixture(): string {
  return `${JSON.stringify(buildAiRequestFixture(), null, 2)}\n`;
}
