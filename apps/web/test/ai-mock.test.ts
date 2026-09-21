import { describe, expect, it } from 'vitest';
import { createDocument, findPage } from '@nexus/design-model';
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
});
