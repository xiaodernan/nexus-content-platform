import { describe, expect, it } from 'vitest';
import {
  DESTRUCTIVE_OPS,
  destructiveActions,
  gateResponse,
  heldRecord,
  nodeNamer,
  WEB_APPROVAL_POLICY,
} from '@/server/ai/approvals';
import type { AiResponse, DesignPatchPayload } from '@nexus/schemas';
import type { DesignDocument } from '@nexus/design-model';

/**
 * §74 / §73 AI 审批门**纯规则层**的单测。
 *
 * 这一层决定"高危动作要不要被人批准才交回编辑区"，是删除类动作的最后一道闸；
 * 它的判定一旦错，要么是删库动作直接落地（漏拦），要么是正常动作被误挂起（谎报）。
 * 规则全在 `server/ai/approvals.ts` 里，不碰 DB、不碰 provider，所以能在单测里逐条钉死，
 * 不必拉整个 ai-service。
 *
 * 变异探针：下面的断言刻意锁住"并集去重""挂起时抽补丁而保留 held""越权 Agent 直接拒"——
 * 这几条任何一条被改坏，这里必须红。
 */

// 一份极简但字段齐全的设计文档，只给 nodeNamer 读的那几个字段
const doc = {
  tokens: [{ key: 'tk1' }],
  assets: [{ id: 'a1', name: '主图' }],
  components: [{ id: 'c1', name: '卡片' }],
  pages: [
    {
      id: 'p1',
      name: '首页',
      rootId: 'n-root',
      nodes: {
        'n-root': { id: 'n-root', name: '主体' },
        'n-footer': { id: 'n-footer', name: '页脚' },
      },
    },
  ],
} as unknown as DesignDocument;

function resp(patches: unknown[], extra: Partial<AiResponse> = {}): AiResponse {
  return { explanation: 'did something', patches: patches as AiResponse['patches'], ...extra } as unknown as AiResponse;
}

/** 把补丁 op 列表包成 DesignPatchPayload，避开字面量 op 联合类型的过度约束（测试夹具只关心 op 字段） */
function patch(ops: unknown[]): DesignPatchPayload {
  return { pageId: 'p1', ops: ops as DesignPatchPayload['ops'] } as DesignPatchPayload;
}

describe('nodeNamer：高危动作要报得出人读得懂的名字', () => {
  const nameOf = nodeNamer(doc);

  it('根节点要升格成"整页根节点"，不能让人低估成"页面"', () => {
    expect(nameOf('n-root')).toBe('首页 的根节点（删除等于清空这一页）');
  });

  it('资产 / 组件 / token 带各自的后缀，提示连带影响', () => {
    expect(nameOf('a1')).toBe('主图（资产，删除会连带清掉引用它的填充）');
    expect(nameOf('c1')).toBe('卡片（组件，删除会连带解开引用它的实例）');
    expect(nameOf('tk1')).toBe('tk1（设计 token）');
  });

  it('查不到就退回 null，绝不编一个"某个元素"', () => {
    expect(nameOf('nope')).toBeNull();
    expect(nameOf('')).toBeNull();
    expect(nameOf(undefined)).toBeNull();
  });
});

describe('destructiveActions：从补丁里扫出要审批的删除类动作', () => {
  const nameOf = nodeNamer(doc);

  it('策略不含 delete 时一律不拦（反向对照：别把策略写死成永远拦）', () => {
    const out = destructiveActions([patch([{ op: 'remove', nodeId: 'n-footer' }])], [], nameOf);
    expect(out).toEqual([]);
  });

  it('五种删除 op 全部识别，且给出可读理由', () => {
    const p = patch([
      { op: 'remove', nodeId: 'n-footer' },
      { op: 'removePage', pageId: 'p1' },
      { op: 'removeToken', key: 'tk1' },
      { op: 'removeAsset', assetId: 'a1' },
      { op: 'removeComponent', componentId: 'c1' },
    ]);
    const out = destructiveActions([p], WEB_APPROVAL_POLICY, nameOf);
    expect(out).toHaveLength(DESTRUCTIVE_OPS.length);
    expect(out.map((a) => a.action)).toEqual(['delete', 'delete', 'delete', 'delete', 'delete']);
    expect(out[0]!.reason).toContain('页脚');
    expect(out[1]!.reason).toContain('首页（整页）');
  });

  it('非删除 op（add / update / move）不当作高危', () => {
    const p = patch([
      { op: 'add', nodeId: 'n-new', node: {} },
      { op: 'update', nodeId: 'n-footer', props: {} },
      { op: 'reparent', nodeId: 'n-footer', parentId: 'n-root' },
    ]);
    expect(destructiveActions([p], WEB_APPROVAL_POLICY, nameOf)).toEqual([]);
  });

  it('每个删除 op 都产生一条（去重交给定门时的 union，这里只负责扫全）', () => {
    const p = patch([{ op: 'remove', nodeId: 'n-footer' }, { op: 'remove', nodeId: 'n-footer' }]);
    const out = destructiveActions([p], WEB_APPROVAL_POLICY, nameOf);
    // 两个相同的删除 op → 两条原始记录；并到一条是 gateResponse 里 union 的职责
    expect(out).toHaveLength(2);
    expect(out.every((a) => a.reason === 'remove → 页脚')).toBe(true);
  });
});

describe('gateResponse：过门结果', () => {
  const nameOf = nodeNamer(doc);

  it('没有删除动作 → 原样交回，held 与 delivered 同一份', () => {
    const r = resp([{ pageId: 'p1', ops: [{ op: 'add', nodeId: 'x', node: {} }] }]);
    const g = gateResponse(r, WEB_APPROVAL_POLICY, nameOf);
    expect(g.approvals).toEqual([]);
    expect(g.delivered).toBe(r);
    expect(g.held).toBe(r);
    expect(g.heldOpCount).toBe(0);
    expect(g.refused).toBeUndefined();
  });

  it('有删除动作 → 挂起：delivered 抽走补丁、标 approval-required，但 held 完整保留', () => {
    const r = resp([{ pageId: 'p1', ops: [{ op: 'removePage', pageId: 'p1' }, { op: 'remove', nodeId: 'n-footer' }] }]);
    const g = gateResponse(r, WEB_APPROVAL_POLICY, nameOf);
    expect(g.approvals.length).toBeGreaterThan(0);
    expect(g.delivered.patches).toEqual([]);
    expect(g.delivered.error?.code).toBe('approval-required');
    expect(g.held).toBe(r); // 原样保留，批准时交回的是用户看过的那一版
    expect(g.heldOpCount).toBe(2);
  });

  it('provider 报的理由与 web 扫出的重复 → 合并成一条（变异探针：union 去重坏了这里红）', () => {
    const r = resp([{ pageId: 'p1', ops: [{ op: 'remove', nodeId: 'n-footer' }] }], {
      approvals: [{ action: 'delete', reason: 'remove → 页脚' }],
    });
    const g = gateResponse(r, WEB_APPROVAL_POLICY, nameOf);
    expect(g.approvals).toHaveLength(1);
  });

  it('点了名但名册里没有 design.patch 的 Agent → 直接拒收（不是"弹个卡片问一句"），且不挂起', () => {
    const r = resp([{ pageId: 'p1', ops: [{ op: 'removePage', pageId: 'p1' }] }]);
    const agent = { name: 'QA', capabilities: ['design.review'] };
    const g = gateResponse(r, WEB_APPROVAL_POLICY, nameOf, agent);
    expect(g.refused).toEqual({ agent: 'QA', opCount: 1 });
    expect(g.approvals).toEqual([]);
    expect(g.delivered.error?.code).toBe('permission-denied');
  });

  it('Agent 越权但这次没有任何补丁（opCount=0）→ 不被拒（越权只在"要落地"时才致命）', () => {
    const r = resp([]);
    const agent = { name: 'QA', capabilities: ['design.review'] };
    const g = gateResponse(r, WEB_APPROVAL_POLICY, nameOf, agent);
    expect(g.refused).toBeUndefined();
    expect(g.approvals).toEqual([]);
  });
});

describe('heldRecord：保留被挂起的那一版的完整凭据', () => {
  it('把 GateResult 转成可落库的形状，值原样透传', () => {
    const gate = gateResponse(
      resp([{ pageId: 'p1', ops: [{ op: 'removePage', pageId: 'p1' }] }]),
      WEB_APPROVAL_POLICY,
      nodeNamer(doc),
    );
    const record = heldRecord(gate, WEB_APPROVAL_POLICY);
    expect(record.held).toBe(gate.held);
    expect(record.delivered).toBe(gate.delivered);
    expect(record.approvals).toBe(gate.approvals);
    expect(record.policy).toBe(WEB_APPROVAL_POLICY);
    expect(record.heldOpCount).toBe(1);
  });
});
