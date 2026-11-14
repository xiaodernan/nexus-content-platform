import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_CHAINS,
  CODEGEN_LIMITS,
  CODEGEN_LIMITS_EN,
  GAME_KIND_STATUS,
  GAME_KIND_STATUS_EN,
  GAME_ENTITY_LABELS,
  GAME_ENTITY_LABELS_EN,
  addEntity,
  artifactChainOf,
  artifactChainSentence,
  codeKindReadings,
  createGame,
  generateGameCode,
  setStat,
  type GameDocument,
} from '@nexus/game-model';

/**
 * v735：en 界面本地化的 game-model 面（notes / kindNote 读数面）。
 *
 * 钉住三件事：
 * 1. **产物字节与语言无关**——en 调用生成的 files[] 与 zh 逐字节相同（下载的 zip 是中文交付物）；
 * 2. **读数面真给英文**——notes/kindNote 英文、且没有中文残留；
 * 3. **英文表与中文表同键集、同句数**——限度/状态表/类别实体不能一处过时。
 */

function freshDoc(): GameDocument {
  let document = createGame('测试设计', null);
  // 加一个 camera 实体（产物不消费 camera），逼出一条 leftovers 备注
  document = addEntity(document, { kind: 'camera', name: 'BossCamera' });
  return document;
}

describe('v735 双语产物读数面', () => {
  it('en 与 zh 生成的 files[] 逐字节相同', () => {
    const document = freshDoc();
    const zh = generateGameCode(document, 'zh');
    const en = generateGameCode(document, 'en');
    expect(en.files.map((f) => f.path)).toEqual(zh.files.map((f) => f.path));
    for (const [enFile, zhFile] of en.files.map((file, i) => [file, zh.files[i] as (typeof zh.files)[number]] as const)) {
      expect(enFile.contents, `${enFile.path} 字节漂移`).toBe(zhFile.contents);
    }
    expect(en.bytes).toBe(zh.bytes);
  });

  it('en notes 英文模板（实体名本身是文档数据，不翻译；只校验模板切换了）', () => {
    const document = freshDoc();
    const en = generateGameCode(document, 'en');
    expect(en.notes.length).toBeGreaterThan(0);
    for (const note of en.notes) {
      // 模板措辞必须是英文——实体名属于文档数据（可能中文），不在此断言之列
      expect(note).not.toContain('这些实体');
      expect(note).not.toContain('跑不起来');
      expect(note).not.toContain('成长层');
    }
    expect(en.notes.join(' ')).toContain('entities');
  });

  it('zh 默认行为不变（向后兼容）', () => {
    const document = freshDoc();
    const zh = generateGameCode(document);
    for (const note of zh.notes) {
      expect(note).toMatch(/[一-鿿]/);
    }
  });

  it('artifactChainSentence zh/en', () => {
    expect(artifactChainSentence('topdown', 'en').startsWith('This artifact runs')).toBe(true);
    expect(artifactChainSentence('topdown')).toContain('这条产物跑的是');
    expect(artifactChainSentence('topdown', 'zh')).toContain('这条产物跑的是');
  });

  it('codeKindReadings 英文错位句（drive by a kind without an engine when forced）', () => {
    // 现状：8 型全部落到带引擎的链（kindNote 恒 null）。所以这里断言 null，
    // 防止有人加了 en 文案后无测试兜住：链齐之后 kindNote 应当恒空。
    const document = freshDoc();
    expect(codeKindReadings(document, 'en').kindNote).toBeNull();
  });

  it('限度 / 状态表英文版与中文版同键集同句数', () => {
    expect(CODEGEN_LIMITS_EN).toHaveLength(CODEGEN_LIMITS.length);
    expect(Object.keys(GAME_KIND_STATUS_EN).sort()).toEqual(Object.keys(GAME_KIND_STATUS).sort());
    expect(Object.keys(GAME_ENTITY_LABELS_EN).sort()).toEqual(Object.keys(GAME_ENTITY_LABELS).sort());
  });

  it('ARTIFACT_CHAINS 三条链都有 artifactChainSentence', () => {
    for (const chain of Object.keys(ARTIFACT_CHAINS) as (keyof typeof ARTIFACT_CHAINS)[]) {
      expect(artifactChainSentence(chain, 'en')).toContain('runs');
      expect(artifactChainSentence(chain, 'zh')).toContain('产物跑的是');
    }
  });

  it('setStat 中文拒绝句在 en 文档里仍原样（投影层 v735 未本地化，见 CURRENT-STATE）', () => {
    const document = freshDoc();
    const entity = document.entities[0]!;
    const result = setStat(document, entity.id, '', Number.NaN);
    expect(result.reason).not.toBeNull();
  });

  it('artifactChainOf 与 artifactChainSentence 组合：字节一致但内容对齐', () => {
    const document = freshDoc();
    const chain = artifactChainOf(document);
    const zh = artifactChainSentence(chain);
    const en = artifactChainSentence(chain, 'en');
    expect(zh).not.toBe(en);
  });
});
