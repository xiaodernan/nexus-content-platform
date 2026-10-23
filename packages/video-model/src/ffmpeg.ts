/**
 * §40 最后一格的后半片：把渲染计划翻成**真的能跑的 ffmpeg 命令行**。
 *
 * 为什么单独一层：计划（`render.ts`）答"这一镜演什么"，这一层答"怎么让 ffmpeg 演出来"。
 * 分开是因为两者的错误代价完全不同——计划错了，片子内容就错了；命令错了，片子根本出不来。
 * 而命令这一层的坑（filtergraph 转义、帧数对齐、xfade 的 offset 语义）值得单独被测试钉住。
 *
 * 三条不变量：
 * 1. **成片时长 = 计划的总时长**。转场吃的是上一镜的尾段，所以上一镜要多渲
 *    `transitionInMs` 毫秒来喂这次叠化；少给这几帧，`xfade` 会把片尾啃掉一口。
 * 2. **纯函数**：同一份计划 + 同一份输入，两次给出的 argv 逐项相同。
 * 3. **不说谎**：计划里有字幕但没有字体文件时，不静默丢字幕——进 `warnings`，
 *    调用方必须把它显示出来（§159）。
 */

import type { VideoRenderPlan } from './render';

/** 一个镜头的参考帧在磁盘上的位置。按 shotId 对应，不是按下标——顺序由计划定 */
export interface RenderInputFile {
  shotId: string;
  path: string;
}

export interface FfmpegPlan {
  /** 可直接 spawn 的参数数组（不含可执行文件名） */
  args: string[];
  /** 计划里说了但没做到的事：调用方必须显示，不许静默 */
  warnings: string[];
}

/** 毫秒 → 帧数。四舍五入到整数帧：30fps 下 1 毫秒不是一帧 */
export function framesFor(durationMs: number, fps: number): number {
  return Math.max(1, Math.round((durationMs * fps) / 1000));
}

/** 秒，保留三位小数：命令行里写 0.4 而不是 0.40000000000000002 */
function seconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/**
 * 帧数 → 秒。**不要再过一遍 `seconds()`**：它收毫秒，而这里拿到的是帧。
 * 第一版就是在这里把 30 帧写成 0.001 秒，zoompan 于是每 33 毫秒就被输入掐一次，
 * 推演停在原处——测试钉的就是这一格。
 */
function durationSeconds(frames: number, fps: number): string {
  return (frames / fps).toFixed(3);
}

/**
 * filtergraph 转义。`:` `,` `;` `[` `]` `'` `\` `%` 在滤镜链里都是结构字符，
 * 不转义要么解析失败，要么被悄悄吃掉一段字幕。
 */
function escapeFilterText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

/**
 * 推演表达式。`on` 是输出帧序号（0 起），所以 t = on/(N-1)；
 * N = 1 时整条表达式退化成常量——除零会得到 NaN，而那会被 ffmpeg 当成 0，
 * 一镜的长度就悄悄变了。
 */
function motionExpr(from: number, to: number, frames: number): string {
  if (frames <= 1) return from.toFixed(6);
  return `${from.toFixed(6)}+(${(to - from).toFixed(6)})*on/${frames - 1}`;
}

/** 缩放 + 平移 → zoompan。裁剪宽度 = iw/zoom，所以横移的上界正好落在右边缘 */
function zoompanFilter(segment: VideoRenderPlan['segments'][number], frames: number, width: number, height: number, fps: number): string {
  const m = segment.motion!;
  const z = motionExpr(m.fromScale, m.toScale, frames);
  const px = motionExpr(m.fromX, m.toX, frames);
  const py = motionExpr(m.fromY, m.toY, frames);
  return (
    `zoompan=z='${z}':` +
    `x='(iw-iw/zoom)*(${px})':y='(ih-ih/zoom)*(${py})':` +
    `d=${frames}:s=${width}x${height}:fps=${fps},format=yuv420p,setsar=1`
  );
}

/**
 * 计划 → ffmpeg argv。
 *
 * 输入按 shotId 对应；计划说这一镜有参考帧却找不到文件时直接抛错——
 * 静默换成色卡会让"我以为推的是我的图"变成假话。
 */
export function buildFfmpegArgs(
  plan: VideoRenderPlan,
  files: readonly RenderInputFile[],
  options: { output: string; fontFile?: string },
): FfmpegPlan {
  if (!plan.renderable) {
    throw new Error(`这份渲染计划排不出一帧（totalMs=${plan.totalMs}）：先切出分镜再渲染`);
  }
  const warnings: string[] = [];
  const byShot = new Map(files.map((f) => [f.shotId, f.path]));

  const args: string[] = [];
  const filters: string[] = [];

  plan.segments.forEach((segment, index) => {
    const label = `v${index}`;
    if (segment.source.kind === 'reference') {
      const path = byShot.get(segment.shotId);
      if (!path) {
        throw new Error(`第 ${index + 1} 镜（${segment.shotId}）计划推演参考帧 ${segment.source.assetId}，但没有给它文件`);
      }
      // 多渲 transitionInMs 毫秒：转场叠在上一镜尾段与本镜开头，这几帧是叠化的燃料
      const frames = framesFor(segment.durationMs + segment.transitionInMs, plan.fps);
      args.push('-loop', '1', '-t', durationSeconds(frames, plan.fps), '-i', path);
      filters.push(`[${index}:v]${zoompanFilter(segment, frames, plan.width, plan.height, plan.fps)}[${label}]`);
      return;
    }

    // 色卡：color 源直接给足帧数，不需要 zoompan——它没有可推的画面
    const frames = framesFor(segment.durationMs + segment.transitionInMs, plan.fps);
    args.push(
      '-f',
      'lavfi',
      '-i',
      // 颜色用计划里那一个，不在这里重算：重算一次就多一份会漂移的真值
      `color=c=${segment.source.color.replace('#', '0x')}:s=${plan.width}x${plan.height}:r=${plan.fps}:d=${durationSeconds(frames, plan.fps)}`,
    );
    let chain = 'format=yuv420p,setsar=1';
    if (options.fontFile) {
      chain += `,drawtext=fontfile='${escapeFilterText(options.fontFile)}'` +
        `:text='${escapeFilterText(segment.source.caption)}'` +
        ':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2';
    } else {
      warnings.push(`第 ${index + 1} 镜是色卡，但没有提供字体文件：字幕「${segment.source.caption}」没有烧进画面。`);
    }
    filters.push(`[${index}:v]${chain}[${label}]`);
  });

  // 叠化链。cut 的边界走 concat（不需要两段重叠），其余走 xfade
  let current = 'v0';
  for (let i = 1; i < plan.segments.length; i += 1) {
    const boundary = plan.segments[i - 1]!;
    const target = i === plan.segments.length - 1 ? 'vout' : `x${i}`;
    if (boundary.transitionOut === 'cut') {
      filters.push(`[${current}][v${i}]concat=n=2:v=1:a=0[${target}]`);
    } else {
      const durationMs = segmentTransitionMs(plan, i);
      // offset = 本镜时间线起点 − 转场时长 = 上一镜的结尾。叠化正好铺在上一镜尾段上
      const offset = (plan.segments[i]!.startMs - durationMs) / 1000;
      filters.push(
        `[${current}][v${i}]xfade=transition=${xfadeName(boundary.transitionOut)}:duration=${seconds(durationMs)}:offset=${offset.toFixed(3)}[${target}]`,
      );
    }
    current = target;
  }

  args.push('-filter_complex', filters.join(';'));
  args.push('-map', `[${current}]`);
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(plan.fps));
  // 成片长度必须等于计划的总时长：滤镜链理论上刚好，这里再夹一道，
  // 免得某一版 ffmpeg 多吐一帧就让 UI 上的总时长与成片对不上
  args.push('-t', seconds(plan.totalMs));
  args.push(options.output);
  return { args, warnings };
}

/** 边界的转场毫秒数：由上一镜的 transitionOut 决定（cut = 0，不走 xfade） */
function segmentTransitionMs(plan: VideoRenderPlan, index: number): number {
  return plan.segments[index]!.transitionInMs;
}

function xfadeName(transition: VideoRenderPlan['segments'][number]['transitionOut']): string {
  if (transition === 'fade') return 'fade';
  if (transition === 'dissolve') return 'dissolve';
  return 'wipeleft';
}
