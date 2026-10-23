import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs, framesFor } from '../src/ffmpeg';
import { planVideoRender, type Storyboard, type StoryboardShot } from '../src/index';

/**
 * 计划 → ffmpeg 命令行。这一层的错不会让片子"内容错"，而是让片子根本出不来，
 * 或者**时长悄悄不对**——所以钉子集中在三件事：帧数、offset、以及不说谎的 warnings。
 */

function shot(over: Partial<StoryboardShot> = {}): StoryboardShot {
  return { id: 'shot-1-abc', prompt: '一只猫跳上窗台', durationMs: 3000, camera: 'medium', transition: 'cut', ...over };
}

function board(shots: StoryboardShot[]): Storyboard {
  return { id: 'sb-1', title: 't', source: { arrow: 'text-to-video', prompt: 'x' }, shots, notes: [] };
}

function filterOf(args: string[]): string {
  const at = args.indexOf('-filter_complex');
  return at < 0 ? '' : args[at + 1]!;
}

/** 输出侧的 -t（夹成片时长那个）。输入侧也有 -t，所以取最后一次出现 */
function outputDuration(args: string[]): string {
  return args[args.lastIndexOf('-t') + 1]!;
}

describe('framesFor —— 毫秒到帧数', () => {
  it('30fps 下 3000 毫秒是 90 帧；非整数毫秒四舍五入而不是截断', () => {
    expect(framesFor(3000, 30)).toBe(90);
    expect(framesFor(1016, 30)).toBe(30); // 30.48 → 30，不是 29
  });

  it('0 毫秒也给一帧：滤镜链里一个零帧输入会让整条图崩掉', () => {
    expect(framesFor(0, 30)).toBe(1);
  });
});

describe('buildFfmpegArgs —— 帧数与输入', () => {
  it('参考镜多渲 transitionInMs 毫秒：这几帧是叠化的燃料，少给就啃掉片尾', () => {
    const plan = planVideoRender(
      board([
        shot({ id: 'a', durationMs: 1000, transition: 'fade', referenceAssetId: 'r0' }),
        shot({ id: 'b', durationMs: 1000, referenceAssetId: 'r1', camera: 'wide' }),
      ]),
    );
    const { args } = buildFfmpegArgs(
      plan,
      [
        { shotId: 'a', path: 'a.png' },
        { shotId: 'b', path: 'b.png' },
      ],
      { output: 'o.mp4' },
    );
    // 第一镜 transitionInMs = 0 → 30 帧；第二镜被上一镜的 fade 占掉 400ms → 42 帧
    const graph = filterOf(args);
    expect(graph).toContain('d=30:');
    expect(graph).toContain('d=42:');
    // 输入侧各自的 -t 也按这个帧数给：zoompan 的 d 只决定产出帧数，
    // 输入不够长时它会重复最后一帧——那样推演就停在原处不动了
    expect(args.join(' ')).toContain('-t 1.000');
    expect(args.join(' ')).toContain('-t 1.400');
  });

  it('色卡镜不需要 -loop 输入：color 源自己就是一路视频', () => {
    const plan = planVideoRender(board([shot({ id: 'a' })]));
    const { args } = buildFfmpegArgs(plan, [], { output: 'o.mp4' });
    expect(args).toContain('-f');
    expect(args).toContain('lavfi');
    expect(args.join(' ')).not.toContain('-loop');
  });

  it('计划说有参考帧但没有给文件：直接抛错，不静默换成色卡', () => {
    const plan = planVideoRender(board([shot({ id: 'a', referenceAssetId: 'r1' })]));
    expect(() => buildFfmpegArgs(plan, [], { output: 'o.mp4' })).toThrow(/没有给它文件/);
  });

  it('排不出一帧的计划直接抛错，不给一条空命令', () => {
    const plan = planVideoRender(board([]));
    expect(() => buildFfmpegArgs(plan, [], { output: 'o.mp4' })).toThrow(/排不出一帧/);
  });
});

describe('buildFfmpegArgs —— 转场链', () => {
  it('cut 边界走 concat：硬切不需要两段画面重叠', () => {
    const plan = planVideoRender(
      board([shot({ id: 'a', durationMs: 1000 }), shot({ id: 'b', durationMs: 1000 })]),
    );
    const graph = filterOf(buildFfmpegArgs(plan, [], { output: 'o.mp4' }).args);
    expect(graph).toContain('concat=n=2:v=1:a=0');
    expect(graph).not.toContain('xfade');
  });

  it('非 cut 边界走 xfade，offset = 本镜起点 − 转场时长（正好铺在上一镜尾段上）', () => {
    const plan = planVideoRender(
      board([
        shot({ id: 'a', durationMs: 1000, transition: 'dissolve' }),
        shot({ id: 'b', durationMs: 1000 }),
      ]),
    );
    const graph = filterOf(buildFfmpegArgs(plan, [], { output: 'o.mp4' }).args);
    expect(graph).toContain('xfade=transition=dissolve:duration=0.600:offset=0.400');
    expect(graph).not.toContain('concat');
  });

  it('成片时长夹到计划总时长：滤镜链理论上刚好，再夹一道防某一版 ffmpeg 多吐一帧', () => {
    const plan = planVideoRender(board([shot({ id: 'a', durationMs: 1234 })]));
    const args = buildFfmpegArgs(plan, [], { output: 'o.mp4' }).args;
    expect(args[args.length - 1]).toBe('o.mp4');
    expect(args[args.length - 2]).toBe('1.234');
    expect(args[args.length - 3]).toBe('-t');
    expect(outputDuration(args)).toBe('1.234');
  });

  it('三段各带不同转场：两个边界各自用自己的转场与 offset', () => {
    const plan = planVideoRender(
      board([
        shot({ id: 'a', durationMs: 1000, transition: 'fade' }),
        shot({ id: 'b', durationMs: 1000, transition: 'wipe' }),
        shot({ id: 'c', durationMs: 1000, transition: 'cut' }),
      ]),
    );
    const graph = filterOf(buildFfmpegArgs(plan, [], { output: 'o.mp4' }).args);
    expect(graph).toContain('xfade=transition=fade:duration=0.400:offset=0.600');
    expect(graph).toContain('xfade=transition=wipeleft:duration=0.500:offset=1.500');
  });

  it('最后一镜的 transitionOut 没人接：界面上改了它也不该在滤镜链里留下痕迹', () => {
    const plan = planVideoRender(
      board([
        shot({ id: 'a', durationMs: 1000, transition: 'fade' }),
        shot({ id: 'b', durationMs: 1000, transition: 'dissolve' }),
      ]),
    );
    // 只有 a→b 一个边界，用 a 的 fade；b 自己标的 dissolve 不出现在任何地方
    const graph = filterOf(buildFfmpegArgs(plan, [], { output: 'o.mp4' }).args);
    expect(graph.match(/xfade/g)).toHaveLength(1);
    expect(graph).toContain('xfade=transition=fade');
    expect(plan.notes.join('')).toContain('后面没有镜头');
  });
});

describe('buildFfmpegArgs —— 不说谎', () => {
  it('没有字体文件：色卡字幕没烧进画面，这一点必须进 warnings', () => {
    const plan = planVideoRender(board([shot({ id: 'a', prompt: '一只猫跳上窗台' })]));
    const { args, warnings } = buildFfmpegArgs(plan, [], { output: 'o.mp4' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('一只猫跳上窗台');
    expect(filterOf(args)).not.toContain('drawtext');
  });

  it('有字体文件：字幕烧进去，且 filtergraph 的结构字符被转义', () => {
    const plan = planVideoRender(
      board([shot({ id: 'a', prompt: "他说:'走,快点;』[完]100%\\x" })]),
    );
    const graph = filterOf(buildFfmpegArgs(plan, [], { output: 'o.mp4', fontFile: 'C:\\fonts\\a.ttf' }).args);
    expect(graph).toContain('drawtext=');
    // 结构字符全部转义：否则滤镜链解析就会在这里断
    for (const raw of ['\\:', '\\,', '\\;', '\\[', '\\]', '\\%', "\\'", '\\\\']) {
      expect(graph, raw).toContain(raw);
    }
    expect(graph).toContain('fontfile=');
  });

  it('同一份计划 + 同一份输入，两次 argv 逐项相同', () => {
    const plan = planVideoRender(
      board([
        shot({ id: 'a', durationMs: 1500, transition: 'fade', referenceAssetId: 'r1' }),
        shot({ id: 'b', durationMs: 800, prompt: '第二镜' }),
      ]),
    );
    const files = [{ shotId: 'a', path: 'a.png' }];
    expect(JSON.stringify(buildFfmpegArgs(plan, files, { output: 'o.mp4' }))).toBe(
      JSON.stringify(buildFfmpegArgs(plan, files, { output: 'o.mp4' })),
    );
  });

  it('色卡颜色取自计划里那一个，不在这里重算', () => {
    const plan = planVideoRender(board([shot({ id: 'a' })]));
    // 颜色写在 lavfi 输入那一侧，不在滤镜链里
    const color = plan.segments[0]!.source.kind === 'card' ? plan.segments[0]!.source.color : '';
    expect(buildFfmpegArgs(plan, [], { output: 'o.mp4' }).args.join(' ')).toContain(
      `color=c=${color.replace('#', '0x')}`,
    );
  });
});
