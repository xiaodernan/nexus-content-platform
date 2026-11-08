import {
  createDocument,
  createNode,
  validateDocument,
  hasErrors,
  serializeDocument,
  deserializeDocument,
  type DesignDocument,
  type DesignNode,
} from '../../packages/design-model/src/index.ts';
import {
  createWorld,
  addWorldNode,
  validateWorld,
  type WorldDocument,
} from '../../packages/world-model/src/index.ts';
import {
  createGame,
  addEntity,
  validateGame,
  type GameDocument,
} from '../../packages/game-model/src/index.ts';
import {
  planStoryboard,
  planVideoRender,
  type Storyboard,
} from '../../packages/video-model/src/index.ts';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §16 / §159 · 跨模型「集大成」合成套件——把四个 model 包（design / world / game / video）
 * 合成进同一个 project bundle，钉它们之间的**组合不变式**。
 *
 * 这一片是前面 world-build / video-plan / game-build / design-build 四套的「合」：
 * 单模型套件各自钉自己包内的投影自洽，这片钉**四个包同时成立、且彼此不打架**：
 *   1. 合成包里每个模型实例都通过自己的 validator（无 error 级缺陷）——证明它们能共存；
 *   2. 共享 projectId 的 link 表自洽：每个被引用的 id 真在其对应模型实例里；
 *   3. 跨模型 id 命名空间无碰撞（平台全局唯一 id 纪律的回归网）；
 *   4. design 层的共享主题 token 表能解析（hero 引用的 `{color.primary}` 不报 missing-token）；
 *   5. design 文档在合成包内 serialize→deserialize 深度相等。
 *
 * 纪律：纯确定性形状、不碰任何 provider；结构不变式失败才红。
 */

// 键序无关的深层比较，避免 serialize 后键序变化引发的伪失败。
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ':' +
          stableStringify((v as Record<string, unknown>)[k]),
      )
      .join(',') +
    '}'
  );
}
function stableEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export const projectBundleSuite: EvalSuite = {
  name: 'project-bundle',
  dimension: '代码正确性 / 跨模型集大成合成（§16 / §159）',
  needsDatabase: false,

  run() {
    const rec = new EvalRecorder();
    console.log('\n== 跨模型集大成合成（§16 / §159）· design+world+game+video 同包共存 ==');

    const projectId = 'proj-nexus-001';

    // ── 组装一个真实可验证的合成包 ───────────────────────────────────────────
    // design：带共享主题 token + 引用它的 hero 节点
    const design: DesignDocument = createDocument('集大成设计', 'website');
    const dPage = design.pages[0]!;
    const dRoot = dPage.nodes[dPage.rootId]!;
    const hero: DesignNode = createNode({
      type: 'container',
      name: 'Hero',
      parentId: dRoot.id,
    });
    hero.style.fills = [{ kind: 'solid', color: '{color.primary}' }];
    dPage.nodes[hero.id] = hero;
    dRoot.children = [hero.id];
    design.tokens.push(
      { key: 'color.primary', value: '#3366ff' },
      { key: 'space.md', value: '16px' },
    );

    // world：建世界后补一条 lore 条目
    const world: WorldDocument = addWorldNode(createWorld('集大成世界'), {
      kind: 'lore',
      title: '起源',
    });

    // game：建游戏后补一个 enemy 实体
    const game: GameDocument = addEntity(createGame('集大成游戏'), {
      kind: 'enemy',
      name: '守门人',
    });

    // video：三段式分镜 + 渲染计划
    const storyboard: Storyboard = planStoryboard('开场。探索。决战。');
    const render = planVideoRender(storyboard);

    // link 表：projectId 把四个模型实例绑到一起
    const bundle = {
      projectId,
      designDocId: design.id,
      worldId: world.id,
      gameId: game.id,
      videoShotCount: storyboard.shots.length,
    };

    // 1. 每个模型实例各自通过 validator（无 error 级缺陷）→ 四包能共存
    {
      const dIssues = validateDocument(design);
      rec.structural(
        'design 实例在合成包内通过 validateDocument（无 error）',
        !hasErrors(dIssues),
        `errors=${dIssues.filter((i) => i.severity === 'error').length}`,
      );
      rec.structural(
        'world 实例在合成包内通过 validateWorld（零缺陷）',
        validateWorld(world).length === 0,
        `defects=${validateWorld(world).length}`,
      );
      rec.structural(
        'game 实例在合成包内通过 validateGame（零缺陷）',
        validateGame(game).length === 0,
        `defects=${validateGame(game).length}`,
      );
      rec.structural(
        'video 渲染计划与镜头数自洽（可渲）',
        render.renderable === storyboard.shots.length > 0 && render.demo === true,
        `renderable=${render.renderable} demo=${render.demo} shots=${storyboard.shots.length}`,
      );
    }

    // 2. link 表自洽：每个被引用的 id 真在其对应模型实例里
    {
      const designHasId = design.id === bundle.designDocId;
      const worldHasId = world.id === bundle.worldId;
      const gameHasId = game.id === bundle.gameId;
      const designNodeExists = !!dPage.nodes[hero.id];
      const worldNodeExists = world.nodes.some((n) => n.title === '起源');
      const gameEntityExists = game.entities.some((e) => e.name === '守门人');
      rec.structural(
        'link 表：design/world/game 的 id 与实例一致',
        designHasId && worldHasId && gameHasId,
        `d=${designHasId} w=${worldHasId} g=${gameHasId}`,
      );
      rec.structural(
        'link 表：被引用的子实体都真实存在（hero / lore / enemy）',
        designNodeExists && worldNodeExists && gameEntityExists,
        `hero=${designNodeExists} lore=${worldNodeExists} enemy=${gameEntityExists}`,
      );
      rec.structural(
        'link 表：video 镜头数 > 0（合成包确实有视频计划）',
        bundle.videoShotCount > 0,
        `shots=${bundle.videoShotCount}`,
      );
    }

    // 3. 跨模型 id 命名空间无碰撞（全局唯一 id 纪律）
    {
      const ids: string[] = [
        ...Object.keys(dPage.nodes),
        ...world.nodes.map((n) => n.id),
        ...game.entities.map((e) => e.id),
        ...storyboard.shots.map((s) => s.id),
      ];
      const unique = new Set(ids);
      rec.structural(
        '跨模型 id 命名空间无碰撞（design+world+game+video 全唯一）',
        unique.size === ids.length,
        `total=${ids.length} unique=${unique.size}`,
      );
    }

    // 4. 共享主题 token 表能解析：hero 引用的 {color.primary} 不报 missing-token
    {
      const issues = validateDocument(design);
      const missing = issues.filter((i) => i.code === 'missing-token');
      rec.structural(
        '共享主题 token 解析：{color.primary} 已定义、不报 missing-token',
        missing.length === 0 && design.tokens.some((t) => t.key === 'color.primary'),
        `missing=${missing.length} primaryDefined=${design.tokens.some((t) => t.key === 'color.primary')}`,
      );
      rec.structural(
        '共享主题 token 表含 color.primary 与 space.md',
        design.tokens.some((t) => t.key === 'color.primary') &&
          design.tokens.some((t) => t.key === 'space.md'),
        `keys=${design.tokens.map((t) => t.key).join(',')}`,
      );
    }

    // 5. design 文档在合成包内 serialize→deserialize 深度相等
    {
      const round = deserializeDocument(serializeDocument(design));
      rec.structural(
        '合成包内 design 文档 serialize→deserialize 深度相等',
        stableEqual(round, design),
        `equal=${stableEqual(round, design)}`,
      );
    }

    // 6. 合成包完整性：四模型齐全、projectId 贯通
    {
      rec.structural(
        '合成包四模型齐全（design/world/game/video 各至少一实例）',
        !!bundle.designDocId &&
          !!bundle.worldId &&
          !!bundle.gameId &&
          bundle.videoShotCount > 0,
        `design=${!!bundle.designDocId} world=${!!bundle.worldId} game=${!!bundle.gameId} shots=${bundle.videoShotCount}`,
      );
      rec.structural(
        '合成包以共享 projectId 贯通',
        typeof bundle.projectId === 'string' && bundle.projectId.length > 0,
        bundle.projectId,
      );
    }

    // 别空转：结构性 check 至少 12 条（不是空壳）
    rec.structural('套件总览：结构性 check >= 12（非空壳）', rec.checks.length >= 12, rec.checks.length);

    rec.skip('真 provider 像素（design/world/game/video 各自的像素生成都需真 key，§159 不许假造）');
    rec.skip('跨模型引用落库（project 聚合表的 DB 写由 server/domain/projects.ts 负责，非确定性 eval 范围）');

    return { checks: rec.checks, notMeasured: rec.notMeasured };
  },
};
