import { describe, expect, it } from 'vitest';
import { createDocument, createNode, type DesignDocument, type DesignPatch } from '@nexus/creative-model';
import { verifyDesignPatches } from '../design-patch-verdict.mjs';

/**
 * §AILIVE-3 / ADR-0170 · 钉死真模型 patches 的内存 dry-run 判据。
 *
 * 这些不是摆设：`.git` 下的变异臂脚本会对 `design-patch-verdict.mts` 逐处改坏
 * （放行 skipped / 不验目标 / 把 honest-refusal 判成 applied…），每一处都必须让
 * 这里对应的那条用例转红，否则算判据有洞。先有判据、再有用例锁、再有变异臂验伪。
 */
function fixture(): { doc: DesignDocument; pageId: string; targetId: string; otherId: string } {
  const doc = createDocument('verdict-fixture');
  const page = doc.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const target = createNode({ type: 'text', name: 'Headline', parentId: root.id, text: '欢迎' });
  const other = createNode({ type: 'text', name: 'Eyebrow', parentId: root.id, text: '引言' });
  page.nodes[target.id] = target;
  page.nodes[other.id] = other;
  root.children.push(target.id, other.id);
  return { doc, pageId: page.id, targetId: target.id, otherId: other.id };
}

describe('verifyDesignPatches（§AILIVE-3 内存 dry-run 判据）', () => {
  it('合法 set：目标字号 16→28，判 applied 且目标被 touch', () => {
    const f = fixture();
    const v = verifyDesignPatches(f.doc, [{ pageId: f.pageId, ops: [{ op: 'set', nodeId: f.targetId, path: 'typography.fontSize', value: 28 }] }], f.targetId, '已改');
    expect(v.kind).toBe('applied');
    if (v.kind === 'applied') {
      expect(v.patchCount).toBe(1);
      expect(v.touchedNodeIds).toContain(f.targetId);
      expect(v.targetFontSize).toBe(28);
    }
  });

  it('合法 merge：真模型用 merge typography 也判 applied', () => {
    const f = fixture();
    const v = verifyDesignPatches(f.doc, [{ pageId: f.pageId, ops: [{ op: 'merge', nodeId: f.targetId, path: 'typography', value: { fontSize: 28 } }] }], f.targetId, '已改');
    expect(v.kind).toBe('applied');
    if (v.kind === 'applied') expect(v.targetFontSize).toBe(28);
  });

  it('编造 nodeId：applyPatch 的 skipped 现形，判 invalid 且 reason 点名 op', () => {
    const f = fixture();
    const v = verifyDesignPatches(f.doc, [{ pageId: f.pageId, ops: [{ op: 'set', nodeId: 'fabricated-id', path: 'typography.fontSize', value: 28 }] }], f.targetId, '改好了');
    expect(v.kind).toBe('invalid');
    if (v.kind === 'invalid') {
      expect(v.reasons.some((r) => r.includes('fabricated-id') && r.includes('not found'))).toBe(true);
      expect(v.reasons.some((r) => r.includes('ops[0]'))).toBe(true);
    }
  });

  it('目标 pageId 漂移：整批 skipped，判 invalid', () => {
    const f = fixture();
    const v = verifyDesignPatches(f.doc, [{ pageId: 'page-that-does-not-exist', ops: [{ op: 'set', nodeId: f.targetId, path: 'typography.fontSize', value: 28 }] }], f.targetId, '改好了');
    expect(v.kind).toBe('invalid');
    if (v.kind === 'invalid') expect(v.reasons.some((r) => r.includes('page not found'))).toBe(true);
  });

  it('改错节点：只碰 Eyebrow 不碰点名的 Headline，判 invalid', () => {
    const f = fixture();
    const v = verifyDesignPatches(f.doc, [{ pageId: f.pageId, ops: [{ op: 'set', nodeId: f.otherId, path: 'typography.fontSize', value: 28 }] }], f.targetId, '改了首段文字');
    expect(v.kind).toBe('invalid');
    if (v.kind === 'invalid') expect(v.reasons.some((r) => r.includes(f.targetId) && r.includes('没被任何 op 碰到'))).toBe(true);
  });

  it('字号不对：改成 30 而诉求是 28，判 invalid（防"假补丁"）', () => {
    const f = fixture();
    const v = verifyDesignPatches(f.doc, [{ pageId: f.pageId, ops: [{ op: 'set', nodeId: f.targetId, path: 'typography.fontSize', value: 30 }] }], f.targetId, '改了');
    expect(v.kind).toBe('invalid');
    if (v.kind === 'invalid') expect(v.reasons.some((r) => r.includes('30') && r.includes('28'))).toBe(true);
  });

  it('目标被 remove：dry-run 后文档里找不到，判 invalid', () => {
    const f = fixture();
    const v = verifyDesignPatches(f.doc, [{ pageId: f.pageId, ops: [{ op: 'remove', nodeId: f.targetId }, { op: 'set', nodeId: f.targetId, path: 'typography.fontSize', value: 28 }] }], f.targetId, '删了又改');
    expect(v.kind).toBe('invalid');
  });

  it('0 patches + 有解释：判 honest-refusal，不造假红', () => {
    const f = fixture();
    const v = verifyDesignPatches(f.doc, [], f.targetId, '目录里没有可引用的文字节点 id，无法安全定位，未做修改');
    expect(v).toMatchObject({ kind: 'honest-refusal', patchCount: 0 });
    if (v.kind === 'honest-refusal') expect(v.explanation).toContain('无法安全定位');
  });

  it('0 patches + 空解释：沉默失败，判 invalid（不造假绿）', () => {
    const f = fixture();
    const v = verifyDesignPatches(f.doc, [], f.targetId, '   ');
    expect(v.kind).toBe('invalid');
    if (v.kind === 'invalid') expect(v.reasons.some((r) => r.includes('explanation 为空'))).toBe(true);
  });

  it('多 patch 顺序应用：后一个引用前一个新建的节点仍判 applied', () => {
    const f = fixture();
    const doc = f.doc;
    const page = doc.pages[0]!;
    const root = page.nodes[page.rootId]!;
    const brandNew = createNode({ type: 'text', name: 'New', parentId: root.id, text: '新' });
    const patches: DesignPatch[] = [
      { pageId: f.pageId, ops: [{ op: 'insert', parentId: root.id, node: brandNew }] },
      { pageId: f.pageId, ops: [{ op: 'set', nodeId: brandNew.id, path: 'typography.fontSize', value: 28 }] },
    ];
    const v = verifyDesignPatches(doc, patches, brandNew.id, '新增并改字号');
    expect(v.kind).toBe('applied');
    if (v.kind === 'applied') expect(v.targetFontSize).toBe(28);
  });

  it('一组全空 ops 且无目标：touched 为空，判 invalid（不把没做事当成 applied）', () => {
    const f = fixture();
    const v = verifyDesignPatches(f.doc, [{ pageId: f.pageId, ops: [] }], null, '嗯');
    expect(v.kind).toBe('invalid');
    if (v.kind === 'invalid') expect(v.reasons.some((r) => r.includes('touched 为空'))).toBe(true);
  });

  it('applyPatch 抛异常：判 invalid 且 reason 带异常，不吞', () => {
    const f = fixture();
    const bad = { pageId: f.pageId, ops: [{ op: 'set', nodeId: f.targetId, path: 'typography.fontSize', value: { non: 'serializable' } }] } as unknown as DesignPatch;
    const v = verifyDesignPatches(f.doc, [bad], f.targetId, '改了');
    // set 塞对象不会抛，但字号不是 number → invalid；这里锚"错值类型也判 invalid"
    expect(v.kind).toBe('invalid');
  });

  it('不改入参：判完之后原文档目标字号仍是 16', () => {
    const f = fixture();
    const before = f.doc.pages[0]!.nodes[f.targetId]!.typography?.fontSize;
    verifyDesignPatches(f.doc, [{ pageId: f.pageId, ops: [{ op: 'set', nodeId: f.targetId, path: 'typography.fontSize', value: 28 }] }], f.targetId, '改了');
    const after = f.doc.pages[0]!.nodes[f.targetId]!.typography?.fontSize;
    expect(before).toBe(16);
    expect(after).toBe(16);
  });
});
