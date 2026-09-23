import { describe, expect, it } from 'vitest';
import { buildDesignIndex, createDocument, findPage } from '@nexus/design-model';
import { AiResponseSchema, type AiRequest } from '@nexus/schemas';
import { mockProvider } from '@/server/ai/mock';

/**
 * Mock provider 的契约测试：它必须永远标注为 demo（§160），输出必须能通过 AiResponseSchema，
 * 而且不能对本轮未覆盖的文档结构崩掉。
 */
function request(
  prompt: string,
  overrides: { pageId?: string; selection?: string[] } = {},
  document = createDocument('契约测试', 'website'),
): AiRequest {
  return {
    requestId: 'req_test',
    intent: 'design-edit',
    prompt,
    modelClass: 'balanced',
    variants: 1,
    references: [],
    approvalPolicy: [],
    dryRun: false,
    context: {
      projectId: 'prj_test',
      pageId: overrides.pageId ?? document.activePageId,
      selection: overrides.selection ?? [],
      selectionDigest: [],
      designSystemDigest: {
        tokens: document.tokens.map((t) => ({ key: t.key, type: t.type, value: t.value })),
        components: [],
      },
      recentChanges: [],
      document: document as unknown as Record<string, unknown>,
    },
  };
}

describe('DeterministicMockProvider', () => {
  it('labels every result as demo capability', async () => {
    const response = await mockProvider.run(request('Make the hero 30% taller.'));
    expect(response.capability).toBe('demo');
    expect(response.usage.demoMode).toBe(true);
    expect(response.provider).toBe('mock');
  });

  it('emits patches that satisfy the response contract', async () => {
    const response = await mockProvider.run(request('make it cinematic'));
    expect(AiResponseSchema.safeParse(response).success).toBe(true);
    expect(response.patches.length).toBeGreaterThan(0);
  });

  it('resizes the named target instead of guessing a node', async () => {
    const document = createDocument('契约测试', 'website');
    const page = findPage(document, document.activePageId)!;
    const root = page.nodes[page.rootId]!;
    const response = await mockProvider.run(request('把首屏加高 50%', { selection: [root.id] }, document));
    const ops = response.patches.flatMap((p) => p.ops);
    expect(ops.some((op) => op.op === 'set' && op.path === 'size.height' && op.nodeId === root.id)).toBe(true);
  });

  it('explains instead of inventing a height when the target hugs its content', async () => {
    const document = createDocument('契约测试', 'website');
    const hero = Object.values(findPage(document, document.activePageId)!.nodes).find((n) => n.name === 'Hero')!;
    expect(hero.size.height).toBe('hug');
    const response = await mockProvider.run(request('把 Hero 加高 50%', { selection: [hero.id] }, document));
    expect(response.patches.length).toBe(0);
    expect(response.explanation).toContain('高度');
  });

  it('rewrites palette through tokens, not per-node colours', async () => {
    const response = await mockProvider.run(request('make it cinematic'));
    const ops = response.patches.flatMap((p) => p.ops);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every((op) => op.op === 'setToken' || op.op === 'set')).toBe(true);
    expect(ops.filter((op) => op.op === 'setToken').length).toBeGreaterThan(0);
  });

  it('adds a section built from token references', async () => {
    const response = await mockProvider.run(request('Add a section: 三档定价卡片'));
    const inserted = response.patches.flatMap((p) => p.ops).filter((op) => op.op === 'insert');
    expect(inserted.length).toBeGreaterThan(1);
  });

  it('answers an audit prompt with findings and no patches', async () => {
    const response = await mockProvider.run(request('Find accessibility issues.'));
    expect(response.patches.length).toBe(0);
    expect(response.explanation.length).toBeGreaterThan(0);
  });

  it('reports provider-unavailable for prompts it cannot honour', async () => {
    const response = await mockProvider.run(request('生成一段 3D 角色动画'));
    expect(response.error?.code).toBe('provider-unavailable');
    expect(response.patches.length).toBe(0);
  });

  it('§174 项目已有 Visual DNA 时，配色遵循 DNA 而不是内置配方', async () => {
    const document = createDocument('契约测试', 'website');
    document.visualDna = {
      source: { method: 'pixel-stats', extractedAt: '2026-09-22T00:00:00.000Z' },
      palette: [
        { role: 'background', color: '#101418' },
        { role: 'foreground', color: '#f5f7ff' },
        { role: 'accent', color: '#ff7a1a' },
      ],
      descriptors: ['暗色底'],
    };
    const response = await mockProvider.run(request('make it cinematic', {}, document));
    const tokenOps = response.patches
      .flatMap((p) => p.ops)
      .filter((op): op is { op: 'setToken'; key: string; value: unknown; mode?: string } => op.op === 'setToken')
      .map((op) => [op.key, op.value] as const);
    const byKey = Object.fromEntries(tokenOps);
    expect(byKey['color.background']).toBe('#101418');
    expect(byKey['color.primary']).toBe('#ff7a1a');
    // 内置 cinematic 配方不得混进来：DNA 里没有 surface，就不该被顺手改掉
    expect(byKey['color.surface']).toBeUndefined();
    expect(JSON.stringify(response.patches)).toContain('项目 DNA');
  });

  it('没有 DNA 时仍走内置配方，且如实标注来源', async () => {
    const response = await mockProvider.run(request('make it cinematic'));
    const ops = response.patches.flatMap((p) => p.ops);
    expect(JSON.stringify(ops)).toContain('#05060a');
    expect(JSON.stringify(response.patches)).not.toContain('项目 DNA');
  });

  it('上下文只带目录时读工具侧注入的权威文档，并把这件事写进 Activity（§68）', async () => {
    const document = createDocument('契约测试', 'website');
    const page = findPage(document, document.activePageId)!;
    const root = page.nodes[page.rootId]!;
    const withDoc = request('把首屏加高 50%', { selection: [root.id] }, document);
    const { document: clientDocument, ...context } = withDoc.context;
    expect(clientDocument).toBeTruthy();

    const response = await mockProvider.run(
      { ...withDoc, context: { ...context, designIndex: buildDesignIndex(document), indexChars: 1234, budgetChars: 20_000 } },
      { document },
    );

    expect(response.error).toBeUndefined();
    const ops = response.patches.flatMap((p) => p.ops);
    expect(ops.some((op) => op.op === 'set' && op.path === 'size.height' && op.nodeId === root.id)).toBe(true);
    const line = response.activities.find((a) => a.stage === 'context');
    expect(line?.summary).toContain('发给模型的是目录');
    expect(line?.summary).toContain('1234 字符');
    expect(line?.summary).toContain('选中 1 个');
  });

  it('目录之外两份文档都没有：说清缺哪一份，不产补丁也不假成功', async () => {
    const withoutDoc = request('make it cinematic');
    const { document: clientDocument, ...context } = withoutDoc.context;
    expect(clientDocument).toBeTruthy();
    const response = await mockProvider.run({ ...withoutDoc, context });
    expect(response.patches).toHaveLength(0);
    expect(response.error?.code).toBe('invalid-context');
    expect(response.error?.message).toContain('权威文档');
  });
});
