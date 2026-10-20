import { describe, expect, it } from 'vitest';
import { createDocument, createNode, findPage } from '@nexus/design-model';
import type { DesignDocument } from '@nexus/design-model';
import { MAX_NODES_PER_DOCUMENT, parseDocument } from '@/server/validation';

/**
 * `parseDocument` 的**形状门与结构门**的第一份单测（规模门另有集成测试在用户走的那条路上打）。
 *
 * 为什么这一格值得补：`parseDocument` 是 `PUT /api/projects/[id]`、快照、导入、
 * 公开 API 写端点**四道门共用的那一个**（`server/validation.ts`）。它有两层：
 * ① zod 形状门（大小、类型、必需字段）——坏在哪要说得出来（路径 + 消息）；
 * ② `validateDocument` 结构门（孤儿节点、环、重复 id）——不静默修数据（§159）。
 * 两层都失败时，返回给用户的是**人话**，不是堆栈。
 *
 * 现有覆盖里规模门（整份文档 20000 节点）被 `projects.integration.test.ts` 钉住了，
 * 走的是用户实际走的那道门（ADR-0015 的要求）；**形状门与结构门没有直接的单测**——
 * 那一层坏了，集成测试只会看到"某个 400"，说不清是哪一条约束。
 *
 * 纯函数：不读库、不碰时钟。
 */

function baseDocument(): DesignDocument {
  return createDocument('validation-probe');
}

describe('parseDocument · 合法文档', () => {
  it('一份刚建好的文档过得去，且原样带出', () => {
    const doc = baseDocument();
    const parsed = parseDocument(JSON.parse(JSON.stringify(doc)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.document.name).toBe(doc.name);
      expect(parsed.document.pages).toHaveLength(doc.pages.length);
    }
  });

  it('多余的字段不拦（zod 默认剥掉未知键，但这里只问"过不过"）', () => {
    const doc = baseDocument() as unknown as Record<string, unknown>;
    doc.somethingExtra = { a: 1 };
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(true);
  });
});

describe('parseDocument · 形状门（坏在哪要说得出来）', () => {
  it('缺 name → issues 点名 name', () => {
    const doc = baseDocument() as unknown as Record<string, unknown>;
    delete doc.name;
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.join('；')).toContain('name');
  });

  it('name 超 120 字 → 拒', () => {
    const doc = baseDocument();
    doc.name = 'x'.repeat(121);
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
  });

  it('schemaVersion 不是 1 → 拒（跨版本不许悄悄存进去）', () => {
    const doc = baseDocument();
    (doc as unknown as { schemaVersion: number }).schemaVersion = 2;
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.join('；')).toContain('schemaVersion');
  });

  it('一个页面都没有 → 拒（zod 的形状门就挡了）', () => {
    const doc = baseDocument();
    doc.pages = [];
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
  });

  it('页面数超过 64 → 拒', () => {
    const doc = baseDocument();
    const page = doc.pages[0]!;
    doc.pages = Array.from({ length: 65 }, (_, i) => ({ ...page, id: `p${i}` }));
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
  });

  it('页面宽高不是整数 → 拒（尺寸要是整数，1.5 宽的页面没有意义）', () => {
    const doc = baseDocument();
    doc.pages[0]!.width = 1.5;
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
  });

  it('页面宽高超出上限 → 拒', () => {
    const doc = baseDocument();
    doc.pages[0]!.width = 20001;
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
  });

  it('组件数超过 512 → 拒', () => {
    const doc = baseDocument();
    doc.components = Array.from({ length: 513 }, (_, i) => ({
      id: `c${i}`,
      name: 'C',
      rootId: 'r',
      props: [],
      variants: [],
      slots: [],
    }));
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
  });
});

describe('parseDocument · 结构门（不静默修数据）', () => {
  it('activePageId 指向不存在的页面 → 拒，并说清是哪一条结构问题', () => {
    const doc = baseDocument();
    doc.activePageId = '根本没这一页';
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.join('；')).toContain('missing-child');
  });

  it('两个页面同 id → 拒（duplicate-id）', () => {
    const doc = baseDocument();
    const page = doc.pages[0]!;
    doc.pages = [page, { ...page, name: '第二页' }];
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.join('；')).toContain('duplicate-id');
  });

  it('节点挂在不存在的父节点下 → 拒（结构不自洽就不许落库）', () => {
    const doc = baseDocument();
    const page = findPage(doc)!;
    const orphan = createNode({ type: 'text', parentId: '不存在的父节点', name: '孤儿', text: 'x' });
    page.nodes[orphan.id] = orphan;
    const parsed = parseDocument(doc);
    expect(parsed.ok).toBe(false);
  });
});

describe('parseDocument · 规模门（整份文档，不是一页）', () => {
  it('节点数超过整份上限 → 单独那一条 issue 说清数与上限', () => {
    const doc = baseDocument();
    const page = doc.pages[0]!;
    // 直接把 nodes 撑到上限之上：这道门数的是**整份文档**的节点总数（ADR-0015）
    const filler = createNode({ type: 'text', parentId: page.rootId, name: '撑量' });
    page.nodes[filler.id] = filler;
    const count = Object.keys(page.nodes).length;
    expect(count).toBeLessThanOrEqual(MAX_NODES_PER_DOCUMENT);

    // 造一份超量的：把同一个节点塞进很多页（页面数有上限 64，所以用节点数堆）
    const big = baseDocument();
    const bigPage = big.pages[0]!;
    const nodes: Record<string, unknown> = { ...bigPage.nodes };
    const proto = createNode({ type: 'text', parentId: bigPage.rootId, name: 'n' });
    for (let i = 0; i <= MAX_NODES_PER_DOCUMENT; i += 1) {
      nodes[`${proto.id}-${i}`] = { ...proto, id: `${proto.id}-${i}` };
    }
    bigPage.nodes = nodes as typeof bigPage.nodes;

    const parsed = parseDocument(big);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues.join('；')).toContain(`上限 ${MAX_NODES_PER_DOCUMENT}`);
    }
  });
});
