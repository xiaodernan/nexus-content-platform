import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssetRef } from '@nexus/design-model';
import { buildFfmpegArgs, planVideoRender, type RenderInputFile } from '@nexus/video-model';
import { openAssetForOwner, uploadVideoAsset } from './assets';
import { finishTask, startTask } from './agent-tasks';
import { refusalForRun } from './credit-ledger';
import { loadStoryboard } from './storyboards';

/**
 * §40-42 的最后半截：把分镜**真的渲染出来**，产物走刚接上的视频摄入链落成资产。
 *
 * 这一层不伪造任何东西，它把三件已经真的事情接起来：`planVideoRender`（模型）、
 * `buildFfmpegArgs`（命令）、`uploadVideoAsset`（字节入库）。本机没有视频 provider，
 * 所以像素来自**本地确定性推演**——这件事在响应里带着 `demo: true` 与 `notes` 原样出去，
 * 界面上必须明码标注 DEMO（§159/§160）。
 *
 * 四条顺序纪律，都与 `generateDemoImage` 同口径（两条生成链只有像素来源不同）：
 * - **额度门在 `startTask` 之前**：被拒的请求不落任务行、不占 CPU。放在后面就会留下
 *   一行 running→failed 的假账，或者一次"免费"的渲染。
 * - **参考帧按 id 取字节，走 `openAssetForOwner`**：不接受客户端给的路径。客户端塞路径
 *   等于让渲染器读服务器上任意文件。
 * - **扣点只在成功收尾**：`finishTask(taskId, { ok: true })`，失败与超时都不扣
 *   （用户没拿到东西，扣点等于罚）。
 * - **渲染进程有墙上时钟上限**：这台机器可能正被别的东西占满，ffmpeg 挂住不能把
 *   请求一起挂死。超时就杀进程、落 failed、把原因说清楚。
 */

/** agentKey 带 'video' → `creditKindForAgentKey` 归到 video 桶（一次 5 点） */
export const RENDER_AGENT_KEY = 'video.render';

/** 单次渲染的墙上时钟上限。12 秒 720p30 的样片在本机约 1-2 秒，两分钟是"机器被占满"与"死循环"之间的界 */
export const RENDER_TIMEOUT_MS = 120_000;

/** 默认 ffmpeg 可执行名：PATH 里找不到就明说找不到，不假装渲染过 */
export const DEFAULT_FFMPEG_PATH = 'ffmpeg';

/**
 * 色卡字幕要一个**中文**字体：caption 是中文，而 ffmpeg 的 drawtext 用默认字体画汉字
 * 只会出一排方框。找不到就返回 undefined——调用方把 warnings 显示出来，
 * 不静默丢字幕（与 `buildFfmpegArgs` 的 fontFile 语义同一句话）。
 * 环境变量优先：部署到别的机器上时不改代码就能指过去。
 */
const FONT_CANDIDATES = [
  process.env.NEXUS_RENDER_FONT,
  'C:\\Windows\\Fonts\\msyh.ttc',
  'C:\\Windows\\Fonts\\simhei.ttf',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  '/System/Library/Fonts/PingFang.ttc',
];

export function findRenderFont(): string | undefined {
  for (const candidate of FONT_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return undefined;
}

export type RenderStoryboardOutcome =
  | {
      ok: true;
      asset: AssetRef;
      taskId: string;
      /** 渲染时说到的没做到的事（没有字体→字幕没烧）：调用方必须显示 */
      warnings: string[];
      /** 计划做的每一个解释与限度：界面上原样显示 */
      notes: string[];
      renderMs: number;
    }
  | {
      ok: false;
      code:
        | 'no_storyboard'
        | 'unreadable_storyboard'
        | 'not_renderable'
        | 'reference_unreadable'
        | 'reference_not_visual'
        | 'credits_exhausted'
        | 'storage_exhausted'
        | 'invalid_video'
        | 'ffmpeg_missing'
        | 'ffmpeg_failed'
        | 'render_timeout';
      message: string;
      issues?: string[];
    };

type FfmpegRun =
  | { ok: true }
  | { ok: false; code: 'ffmpeg_missing' | 'ffmpeg_failed' | 'render_timeout'; message: string };

/**
 * 跑一次 ffmpeg。三条退出路径各有各的说法：
 * - 可执行找不到（ENOENT）：本机没装 ffmpeg，不是说"渲染失败"——
 *   "没装"与"渲崩了"要用户做的动作完全不同；
 * - 退出码非 0：带上 stderr 尾巴，ffmpeg 的抱怨是唯一有用的线索；
 * - 超时：杀进程。不杀的后果是请求挂死，而机器慢不该由用户等。
 */
function runFfmpeg(ffmpegPath: string, args: string[], timeoutMs: number): Promise<FfmpegRun> {
  return new Promise((resolve) => {
    let settled = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (error) {
      resolve({ ok: false, code: 'ffmpeg_missing', message: `起不来 ffmpeg（${ffmpegPath}）：${String(error)}` });
      return;
    }
    let stderr = '';
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        ok: false,
        code: 'render_timeout',
        message: `渲染超过 ${timeoutMs} 毫秒被掐断：这台机器的 CPU 可能正被别的东西占着。重试一次，或把分镜剪短再来。`,
      });
    }, timeoutMs);
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: 'ffmpeg_missing',
        message: `找不到 ffmpeg（${ffmpegPath}）：${error.message}。装上 ffmpeg 或设 NEXUS_RENDER_FFMPEG 指过去。`,
      });
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      resolve({ ok: false, code: 'ffmpeg_failed', message: `ffmpeg 退出码 ${code}：${stderr.slice(-600) || '（没有任何输出）'}` });
    });
  });
}

/** 参考帧的扩展名：字节已经过 sniff，这里只按 mime 给临时文件起名，不参与任何判定 */
function extensionForMime(mime: string): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'video/webm') return '.webm';
  return '.bin';
}

export interface RenderStoryboardInput {
  projectId: string;
  userId: string;
  /** ffmpeg 可执行名或路径。默认 'ffmpeg'（走 PATH）；测试注入一个不存在的名字复现"没装" */
  ffmpegPath?: string;
  /** 中文字体文件路径。不传就自己找；传 null 强制"没有字体"（复现 warnings 那条路） */
  fontFile?: string | null;
  /** 单次渲染的墙上时钟上限，默认 RENDER_TIMEOUT_MS */
  timeoutMs?: number;
}

export async function renderStoryboardDemo(input: RenderStoryboardInput): Promise<RenderStoryboardOutcome> {
  const loaded = await loadStoryboard(input.projectId);
  if (!loaded) {
    return { ok: false, code: 'no_storyboard', message: '这个项目还没有分镜：先写一句话切出分镜，再来渲染' };
  }
  if (!loaded.ok) {
    return { ok: false, code: 'unreadable_storyboard', message: `库里的分镜读不出来：${loaded.reason}` };
  }

  const plan = planVideoRender(loaded.document);
  if (!plan.renderable) {
    return { ok: false, code: 'not_renderable', message: '这份分镜排不出一帧：先切出至少一镜有时长的分镜', issues: plan.notes };
  }

  // 参考帧按 id 取字节，走归属校验——与生成链路同一道门。音频之类别挂：
  // 参考帧只能是画面（图片或视频），音频挂上去 ffmpeg 只会报"没有视频流"，
  // 那句话要到跑起来才说，而这里现在就能说清
  const dir = mkdtempSync(join(tmpdir(), 'nexus-render-'));
  try {
    const files: RenderInputFile[] = [];
    for (const segment of plan.segments) {
      if (segment.source.kind !== 'reference') continue;
      const file = await openAssetForOwner(segment.source.assetId, input.userId);
      if (!file) {
        return {
          ok: false,
          code: 'reference_unreadable',
          message: `第 ${segment.index + 1} 镜的参考帧 ${segment.source.assetId} 读不到，或者不属于你`,
        };
      }
      if (!file.mime.startsWith('image/') && !file.mime.startsWith('video/')) {
        return {
          ok: false,
          code: 'reference_not_visual',
          message: `第 ${segment.index + 1} 镜挂的 ${segment.source.assetId} 是 ${file.mime}：参考帧只能是图片或视频`,
        };
      }
      // 存储驱动可能是 S3，而 ffmpeg 只认本地路径：字节先落临时文件，跑完即焚
      const local = join(dir, `ref-${segment.index}${extensionForMime(file.mime)}`);
      await writeFile(local, Buffer.from(file.bytes));
      files.push({ shotId: segment.shotId, path: local });
    }

    const output = join(dir, 'render.mp4');
    const fontFile = input.fontFile === null ? undefined : input.fontFile ?? findRenderFont();
    const built = buildFfmpegArgs(plan, files, { output, ...(fontFile ? { fontFile } : {}) });

    // 额度门在写任务行之前：被拒的请求一行都不留、一个 CPU 周期都不占
    const refusal = await refusalForRun(input.userId, RENDER_AGENT_KEY);
    if (refusal) return { ok: false, code: 'credits_exhausted', message: refusal };

    const { id: taskId } = await startTask({
      projectId: input.projectId,
      agentKey: RENDER_AGENT_KEY,
      createdById: input.userId,
      capability: 'demo',
      input: {
        storyboardId: loaded.document.id,
        shots: plan.segments.length,
        totalMs: plan.totalMs,
        cardCount: plan.cardCount,
      },
    });
    const startedAt = Date.now();

    const run = await runFfmpeg(input.ffmpegPath ?? DEFAULT_FFMPEG_PATH, built.args, input.timeoutMs ?? RENDER_TIMEOUT_MS);
    if (!run.ok) {
      await finishTask(taskId, { ok: false, error: run.message });
      return { ok: false, code: run.code, message: run.message };
    }

    const bytes = await readFile(output);
    // 与用户上传、与图像生成走同一道摄入门：视频字节也只收本服务渲染链的产物
    const ingested = await uploadVideoAsset(input.projectId, {
      data: bytes,
      filename: `${loaded.document.title || '分镜'}-demo.mp4`,
      createdById: input.userId,
      genMeta: {
        storyboardId: loaded.document.id,
        taskId,
        provider: 'local-ffmpeg',
        demoMode: true,
        renderMs: Date.now() - startedAt,
        warnings: built.warnings,
        notes: plan.notes,
      },
    });
    if (!ingested.ok) {
      await finishTask(taskId, { ok: false, error: ingested.reason });
      return { ok: false, code: ingested.code, message: ingested.reason, issues: ingested.issues };
    }

    // 只有真渲成了才扣点（video 桶一次 5 点）：finishTask 是同步与异步共用的收尾口
    await finishTask(taskId, { ok: true });
    return {
      ok: true,
      asset: ingested.asset,
      taskId,
      warnings: built.warnings,
      notes: plan.notes,
      renderMs: Date.now() - startedAt,
    };
  } finally {
    // 临时目录即焚：参考帧字节与成片都不留在服务器上（库里那一条才是产物）
    rmSync(dir, { recursive: true, force: true });
  }
}