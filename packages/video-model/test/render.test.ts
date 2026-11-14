import { describe, expect, it } from 'vitest';
import {
  planVideoRender,
  RENDER_FPS,
  RENDER_HEIGHT,
  RENDER_WIDTH,
  TRANSITION_MS,
  type Storyboard,
  type StoryboardArrow,
  type StoryboardShot,
} from '../src/index';

/**
 * §40 最后一格的模型半片：时间线 → 渲染计划。
 *
 * 这一层最容易被"看起来对"骗过去的地方有三处，所以钉子都钉在这儿：
 * ① **总时长**：转场若另加时间，trim 一镜就会偷偷改变总长——时间线与画布对不上账；
 * ② **有没有参考帧**：它只决定画面来源，不该改变时长、顺序、推演的存在性以外的任何东西；
 * ③ **色卡不是失败态**：没有参考帧的镜头仍然有一整段画面，只是它长什么样由 shotId 决定，
 *    且必须是确定的（同一份分镜两次投影逐字段相同，§16）。
 */

function shot(over: Partial<StoryboardShot> = {}): StoryboardShot {
  return { id: 'shot-1-abc', prompt: '一只猫跳上窗台', durationMs: 3000, camera: 'medium', transition: 'cut', ...over };
}

function board(shots: StoryboardShot[], source: Storyboard['source'] = { arrow: 'text-to-video', prompt: 'x' }): Storyboard {
  return { id: 'sb-1', title: 't', source, shots, notes: [] };
}

describe('planVideoRender —— 总时长与段落边界', () => {
  it('总时长 = 各镜时长之和，startMs 逐镜累加', () => {
    const plan = planVideoRender(board([shot({ id: 'a', durationMs: 1000 }), shot({ id: 'b', durationMs: 2500 })]));
    expect(plan.totalMs).toBe(3500);
    expect(plan.segments.map((s) => [s.shotId, s.startMs, s.durationMs])).toEqual([
      ['a', 0, 1000],
      ['b', 1000, 2500],
    ]);
  });

  it('转场吃这一镜的尾段，不另加时间：trim 一镜不会偷偷改变总长', () => {
    const shots = [
      shot({ id: 'a', durationMs: 1000, transition: 'fade' }),
      shot({ id: 'b', durationMs: 1000, transition: 'cut' }),
    ];
    const plan = planVideoRender(board(shots));
    expect(plan.totalMs).toBe(2000);
    // 第一镜前面没有转场；第二镜的开头被第一镜的 fade 占掉 400ms
    expect(plan.segments[0]!.transitionInMs).toBe(0);
    expect(plan.segments[1]!.transitionInMs).toBe(TRANSITION_MS.fade);
    expect(TRANSITION_MS.cut).toBe(0);
  });

  it('输出规格是常量，不随分镜变', () => {
    const plan = planVideoRender(board([shot()]));
    expect([plan.width, plan.height, plan.fps]).toEqual([RENDER_WIDTH, RENDER_HEIGHT, RENDER_FPS]);
  });
});

describe('planVideoRender —— 画面来源：参考帧与色卡', () => {
  it('有参考帧就推演它，机位决定怎么动', () => {
    const plan = planVideoRender(board([shot({ referenceAssetId: 'asset-1', camera: 'tracking' })]));
    const segment = plan.segments[0]!;
    expect(segment.source).toEqual({ kind: 'reference', assetId: 'asset-1', from: 'shot' });
    expect(segment.motion).toBeDefined();
    // 跟移只摇不缩放：两端的缩放必须相等，否则它就是在推拉了
    expect(segment.motion!.fromScale).toBe(segment.motion!.toScale);
    expect(segment.motion!.toX).toBeGreaterThan(segment.motion!.fromX);
    expect(plan.cardCount).toBe(0);
  });

  it('没有参考帧用色卡，且不给它一套假运动', () => {
    const plan = planVideoRender(board([shot()]));
    const segment = plan.segments[0]!;
    expect(segment.source.kind).toBe('card');
    expect(segment.motion).toBeUndefined();
    expect(plan.cardCount).toBe(1);
    expect(plan.notes.join('')).toContain('色卡');
  });

  it('色卡颜色由 shotId 决定：同一镜永远同一个颜色，不同镜不同颜色', () => {
    const one = planVideoRender(board([shot({ id: 'shot-1-abc' })]));
    const again = planVideoRender(board([shot({ id: 'shot-1-abc' })]));
    const other = planVideoRender(board([shot({ id: 'shot-2-zzz' })]));
    expect((one.segments[0]!.source as { color: string }).color).toBe(
      (again.segments[0]!.source as { color: string }).color,
    );
    expect((one.segments[0]!.source as { color: string }).color).not.toBe(
      (other.segments[0]!.source as { color: string }).color,
    );
  });

  it('caption 截到 24 字：色卡上要放得下一行字', () => {
    const long = '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十';
    const plan = planVideoRender(board([shot({ prompt: long })]));
    const source = plan.segments[0]!.source as { caption: string };
    expect(source.caption).toHaveLength(24);
  });

  it('机位映射：detail 推得最狠，wide 只是缓推，aerial 只纵摇', () => {
    const zoom = (camera: StoryboardShot['camera']): number =>
      planVideoRender(board([shot({ camera, referenceAssetId: 'a' })])).segments[0]!.motion!.toScale;
    expect(zoom('detail')).toBeGreaterThan(zoom('wide'));
    expect(zoom('close')).toBeGreaterThan(zoom('medium'));
    const aerial = planVideoRender(board([shot({ camera: 'aerial', referenceAssetId: 'a' })])).segments[0]!.motion!;
    expect(aerial.fromScale).toBe(aerial.toScale);
    expect(aerial.toY).toBeGreaterThan(aerial.fromY);
    expect(aerial.toX).toBe(aerial.fromX);
  });
});

describe('planVideoRender —— 箭头进像素（M5 第三十八片）', () => {
  it('image-to-video 的那张整片参考图补进自己没挂图的镜头，并说清画面从哪来', () => {
    const plan = planVideoRender(
      board(
        [shot({ id: 'a' }), shot({ id: 'b' })],
        { arrow: 'image-to-video', prompt: 'x', referenceAssetId: 'whole-1' },
      ),
    );
    expect(plan.segments.map((s) => s.source)).toEqual([
      { kind: 'reference', assetId: 'whole-1', from: 'source' },
      { kind: 'reference', assetId: 'whole-1', from: 'source' },
    ]);
    expect(plan.cardCount).toBe(0);
    expect(plan.sourceReferenceCount).toBe(2);
    expect(plan.notes.join('')).toContain('2/2 镜自己没挂参考帧');
    expect(plan.notes.join('')).not.toContain('色卡');
    // 整片那张图也是画面，所以它照样有机位推演——否则两镜就是两张静止色卡换了个来源
    expect(plan.segments[0]!.motion).toBeDefined();
  });

  it('每一镜自己的参考帧优先：更具体的那个决定赢', () => {
    const plan = planVideoRender(
      board(
        [shot({ id: 'a', referenceAssetId: 'own-a' }), shot({ id: 'b' })],
        { arrow: 'image-to-video', prompt: 'x', referenceAssetId: 'whole-1' },
      ),
    );
    expect(plan.segments[0]!.source).toEqual({ kind: 'reference', assetId: 'own-a', from: 'shot' });
    expect(plan.segments[1]!.source).toEqual({ kind: 'reference', assetId: 'whole-1', from: 'source' });
    expect(plan.sourceReferenceCount).toBe(1);
  });

  it('全片都自己挂了图时说明整片那张没进画面，而不是不提它', () => {
    const plan = planVideoRender(
      board(
        [shot({ id: 'a', referenceAssetId: 'own-a' }), shot({ id: 'b', referenceAssetId: 'own-b' })],
        { arrow: 'image-to-video', prompt: 'x', referenceAssetId: 'whole-1' },
      ),
    );
    expect(plan.sourceReferenceCount).toBe(0);
    expect(plan.cardCount).toBe(0);
    expect(plan.notes.join('')).toContain('那张整片参考图这次没有进画面');
  });

  it('整片那张只属于 image-to-video：别的箭头就算带了图也不进像素', () => {
    const otherArrows: StoryboardArrow[] = ['text-to-video', 'storyboard-to-video', 'character-to-scene'];
    for (const arrow of otherArrows) {
      const plan = planVideoRender(board([shot({ id: 'a' })], { arrow, prompt: 'x', referenceAssetId: 'whole-1' }));
      expect(plan.segments[0]!.source.kind, `${arrow} 不该用整片那张图`).toBe('card');
      expect(plan.sourceReferenceCount).toBe(0);
      expect(plan.cardCount).toBe(1);
      expect(plan.notes.join('')).not.toContain('整片参考图');
      expect(plan.notes.join(''), `${arrow} 该说出残留的参考图`).toContain('这条箭头不读它');
    }
  });

  it('image-to-video 但那张图是空的（旧行/未挑图）：退回色卡，不报天错', () => {
    const plan = planVideoRender(board([shot({ id: 'a' })], { arrow: 'image-to-video', prompt: 'x' }));
    expect(plan.segments[0]!.source.kind).toBe('card');
    expect(plan.sourceReferenceCount).toBe(0);
    expect(plan.cardCount).toBe(1);
  });

  it('箭头不认但留着的人/图也会被说出来——静默丢弃是上一片指出的静默格子', () => {
    const plan = planVideoRender(
      board([shot({ id: 'a' })], { arrow: 'text-to-video', prompt: 'x', characterId: 'c-1', referenceAssetId: 'whole-1' }),
    );
    const notes = plan.notes.join('');
    expect(notes).toContain('这条箭头不读它');
    // 两个残留分开数：图一句、角色一句，不是一句笼统的"有残留"
    expect(notes).toContain('referenceAssetId');
    expect(notes).toContain('characterId');
  });

  it('character-to-scene 渲成色卡时把限度说出来；每镜都挂了图就不虚构这个缺口', () => {
    const withCards = planVideoRender(
      board([shot({ id: 'a' }), shot({ id: 'b', referenceAssetId: 'own-b' })], {
        arrow: 'character-to-scene',
        prompt: 'x',
        characterId: 'c-1',
      }),
    );
    expect(withCards.notes.join('')).toContain('character-to-scene 这条箭头今天还不进像素');
    expect(withCards.sourceReferenceCount).toBe(0);

    const allReferenced = planVideoRender(
      board([shot({ id: 'a', referenceAssetId: 'own-a' })], { arrow: 'character-to-scene', prompt: 'x', characterId: 'c-1' }),
    );
    expect(allReferenced.notes.join('')).not.toContain('还不进像素');
  });

  it('色卡与整片参考图是两个数：合成一个就分不清"全片同一张图"与"多数是色卡"', () => {
    const plan = planVideoRender(
      board(
        [shot({ id: 'a' }), shot({ id: 'b' }), shot({ id: 'c', referenceAssetId: 'own-c' })],
        { arrow: 'text-to-video', prompt: 'x' },
      ),
    );
    expect([plan.cardCount, plan.sourceReferenceCount]).toEqual([2, 0]);
  });
});

describe('planVideoRender —— 确定性与 DEMO 标识', () => {
  it('同一份分镜两次投影逐字段相同（§16 要能重放）', () => {
    const shots = [
      shot({ id: 'a', durationMs: 1200, transition: 'dissolve', referenceAssetId: 'r1' }),
      shot({ id: 'b', durationMs: 800, camera: 'close' }),
    ];
    expect(JSON.stringify(planVideoRender(board(shots)))).toBe(JSON.stringify(planVideoRender(board(shots))));
  });

  it('计划自带 DEMO 标识：像素来自本地推演，不是 provider 生成', () => {
    const plan = planVideoRender(board([shot({ referenceAssetId: 'r' })]));
    expect(plan.demo).toBe(true);
    expect(plan.notes.join('')).toContain('DEMO');
    expect(plan.notes.join('')).toContain('不是 AI 生成');
  });

  it('空分镜：renderable=false，并且说清为什么', () => {
    const plan = planVideoRender(board([]));
    expect(plan.renderable).toBe(false);
    expect(plan.segments).toEqual([]);
    expect(plan.totalMs).toBe(0);
    expect(plan.notes.join('')).toContain('还没有镜头');
  });

  it('每一镜时长都是 0 时同样不可渲染：0 毫秒不等于"一帧"', () => {
    const plan = planVideoRender(board([shot({ durationMs: 0 }), shot({ id: 'b', durationMs: 0 })]));
    expect(plan.totalMs).toBe(0);
    expect(plan.renderable).toBe(false);
  });
});
