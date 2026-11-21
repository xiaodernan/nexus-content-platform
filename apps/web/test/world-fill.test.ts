import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fillableKinds, parseChronicleReply, parseEchoReply, parseLinkReply, parseWorldFillReply, retrieveWorldContext } from '../src/lib/worldFill';

/**
 * §44 世界填料的入口门。宁可少收一条，也不把模型话术当设定写进用户的世界文档：
 * 这里只判形状，任何"看起来像但不可用"的回话都必须空手回去，由界面照实说没拿到。
 */
describe('worldFill · 填料回话解析', () => {
  it('接受顶层数组与 {entries} 两种合法形状，最多两条', () => {
    const two = '[{"title":"盐道","body":"路面永远有一层薄盐。"},{"title":"老石磨","body":"磨盘转起来没有声音。"}]';
    expect(parseWorldFillReply(two)).toEqual([
      { title: '盐道', body: '路面永远有一层薄盐。' },
      { title: '老石磨', body: '磨盘转起来没有声音。' },
    ]);
    expect(parseWorldFillReply('```json\n' + two + '\n```')).toHaveLength(2);
    expect(parseWorldFillReply('{"entries":' + two + '}')).toHaveLength(2);
  });

  it('超过两条截断，不把模型的"再给你三条"塞进世界', () => {
    const three = Array.from({ length: 3 }, (_, i) => ({ title: `条目${i}`, body: `细节${i}` }));
    expect(parseWorldFillReply(JSON.stringify(three))).toHaveLength(2);
  });

  it('非 JSON / 空标题 / 空正文 / 字段不是字符串 一律空手', () => {
    expect(parseWorldFillReply('好的，这是两条设定：')).toEqual([]);
    expect(parseWorldFillReply('{"title":"x","body":"y"}')).toEqual([]); // 不是数组
    expect(parseWorldFillReply(JSON.stringify([{ title: '', body: '有正文' }]))).toEqual([]);
    expect(parseWorldFillReply(JSON.stringify([{ title: '有标题', body: 42 }]))).toEqual([]);
    expect(parseWorldFillReply(JSON.stringify([null, 3, 'x']))).toEqual([]);
  });

  it('超长字段拒绝，不把一整本书塞进一个节点', () => {
    const long = JSON.stringify([{ title: 't'.repeat(121), body: 'b' }]);
    expect(parseWorldFillReply(long)).toEqual([]);
  });
});

describe('worldFill · 编年续写只认已有纪元', () => {
  const eras = ['灰灯纪', '灰烬纪'];
  it('挑中已有纪元原样返回，标题正文照常', () => {
    const text = '[{"title":"盐道封路","body":"潮退那夜石磨停了三圈，守夜人把盐道封了。","era":"灰灯纪"}]';
    expect(parseChronicleReply(text, eras)).toEqual({ title: '盐道封路', body: '潮退那夜石磨停了三圈，守夜人把盐道封了。', era: '灰灯纪' });
  });
  it('模型自造纪元时降级为未标纪元，不让编年页多出一个假分期', () => {
    const text = '[{"title":"盐道封路","body":"潮退那夜石磨停了三圈。","era":"新纪元"}]';
    expect(parseChronicleReply(text, eras)?.era).toBe('');
  });
  it('空纪元列表接受空串；没拿到合法条目返回 null', () => {
    expect(parseChronicleReply('[{"title":"a","body":"b","era":""}]', [])?.era).toBe('');
    expect(parseChronicleReply('模型话术', eras)).toBeNull();
  });
});

describe('worldFill · 记忆回声只收短刻痕', () => {
  it('合法回声原样取回正文', () => {
    expect(parseEchoReply('[{"title":"盐道","body":"石缝里那点咸味，退潮后才浮出来。"}]')).toBe('石缝里那点咸味，退潮后才浮出来。');
  });
  it('超长正文拒绝，不截断成半句', () => {
    expect(parseEchoReply(JSON.stringify([{ title: 'x', body: '长'.repeat(241) }]))).toBeNull();
  });
  it('空回话返回 null', () => {
    expect(parseEchoReply('没有可写的')).toBeNull();
  });
});

describe('worldFill · 星图牵线只认候选 id', () => {
  const ids = ['wn_a', 'wn_b'];
  it('合法目标与具体关系名原样取回', () => {
    expect(parseLinkReply('{"toId":"wn_b","label":"效忠"}', ids)).toEqual({ toId: 'wn_b', label: '效忠' });
  });
  it('模型自造 id 直接拒绝，不让图上出现不存在的端点', () => {
    expect(parseLinkReply('{"toId":"wn_ghost","label":"无关"}', ids)).toBeNull();
  });
  it('空标签/超长标签/围栏外的话术都拒绝', () => {
    expect(parseLinkReply('{"toId":"wn_b","label":""}', ids)).toBeNull();
    expect(parseLinkReply('{"toId":"wn_b","label":"' + '长'.repeat(41) + '"}', ids)).toBeNull();
    expect(parseLinkReply('好的，我找到一条关系', ids)).toBeNull();
  });
});

describe('WorldPanel 四种填料按钮接线（web 侧限流期间的静态保底）', () => {
  const panel = readFileSync(join(process.cwd(), 'apps/web/src/studio/WorldPanel.tsx'), 'utf8');
  it('每个按钮都有钩子、有教学 title、且真的把 mode 发到服务端', () => {
    for (const [hook, flag, parser] of [
      ['data-world-ai-fill', 'newKind', 'parseWorldFillReply'],
      ['data-world-ai-chronicle', 'chronicle: true', 'parseChronicleReply'],
      ['data-world-ai-echo', 'echo: true', 'parseEchoReply'],
      ['data-world-ai-link', 'link: true', 'parseLinkReply'],
      ['data-world-ai-fill-all', 'fillAllEmpty', 'WORLD_KINDS.filter'],
      ['data-world-ai-fill', 'retrieveWorldContext(doc.nodes', 'retrieveWorldContext'],
    ] as const) {
      expect(panel, hook).toContain(hook);
      expect(panel, flag).toContain(flag);
      expect(panel, parser).toContain(parser);
    }
  });
  it('三种写回都走 setLocal + commit，不绕过契约直写库', () => {
    expect(panel).toContain('worldStore.setLocal');
    expect(panel).toContain('worldStore.commit()');
    // 牵线必须经过 linkWorldNodes 的自环/重复边门
    expect(panel).toContain('linkWorldNodes(doc');
    // 批量循环必须从 store 快照取最新文档，否则前几轮的写入被覆盖（E2E 抓到过）
    expect(panel).toContain('worldStore.getSnapshot().world');
  });
});

describe('worldFill · 一键补全的空节判定', () => {
  const kinds = ['lore', 'history', 'geography', 'factions'];
  it('空壳节点不算有内容（E2E 抓到的真 bug：骨架九类各一条空壳）', () => {
    const nodes = kinds.map(k => ({ kind: k, body: '' }));
    expect(fillableKinds(nodes, kinds)).toEqual(kinds);
  });
  it('有正文的节跳过，空白节保留', () => {
    const nodes = [
      { kind: 'lore', body: ' 有内容 ' },
      { kind: 'history', body: '   ' },
      { kind: 'geography', body: '' },
    ];
    expect(fillableKinds(nodes, kinds)).toEqual(['history', 'geography', 'factions']);
  });
});

describe('worldFill · RAG-lite 世界证据检索', () => {
  const nodes = [
    { title: '老石磨', body: '院中一口老石磨，潮退时磨出盐，盐粒带着陌生刻痕。' },
    { title: '守夜人', body: '守夜人交接时数磨盘转数，记下潮时。' },
    { title: '空壳', body: '   ' },
  ];
  it('按正文相关性取 top-K，跳过空壳', () => {
    const got = retrieveWorldContext(nodes, '潮退 盐 磨盘', 2);
    expect(got.length).toBe(2);
    expect([...got.map(x => x.title)].sort()).toEqual(['守夜人', '老石磨'].sort());
    for (const x of got) expect(x.body.length).toBeGreaterThan(0);
  });
  it('正文截断到 300 字，不把整篇塞进提示词', () => {
    const long = { title: '长文', body: '盐'.repeat(500) };
    expect(retrieveWorldContext([long], '盐盐', 1)[0]!.body.length).toBe(300);
  });
  it('空查询返回空证据', () => {
    expect(retrieveWorldContext(nodes, '   ', 3)).toEqual([]);
  });
});
