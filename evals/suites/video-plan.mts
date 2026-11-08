import {
  planStoryboard,
  timelineOf,
  splitShotAt,
  emptyStoryboard,
  missingArrowSource,
  MAX_SHOTS,
} from '../../packages/video-model/src/index.ts';
import { planVideoRender, cardColor } from '../../packages/video-model/src/render.ts';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §40-42 · 视频模型投影自洽——"断句 → 分镜 → 时间线 → 渲染计划"整条确定链。
 *
 * 为什么这条进 eval 而不混进 video-model 的单测：单测断的是**点**
 * （`planStoryboard` 的断句、`timelineOf` 的轨道、`planVideoRender` 的色卡各自对不对），
 * 这条钉的是**面**——几个函数之间的跨函数不变式：
 *   1. 整条链是**确定性**的（同输入两次投影逐字段相同，§16 要能重放）；
 *   2. 时间线 video 轨的片段**首尾相接无洞**，且 camera 轨的 shotId 与 video 轨一致；
 *   3. `playable` / `renderable` 与"有没有帧"**自洽**（没帧就不播，且 blockers 说清为什么）；
 *   4. `splitShotAt` **时长守恒**（前+后==原长），`cardColor` 同 id 同色、异 id 异色。
 * 这种"链级"不变式单测那张网罩不到，而一旦破了，界面会显示一份对不上像素的计划。
 *
 * 纪律与 code-index / model-roundtrip suite 一致：数字打印、结构不变式失败才红；不假造 provider。
 */

/** 深比较：分镜/计划都是纯数据，JSON 序列化足够判定"逐字段相同" */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 把一个分镜的每一镜都挂上假视频帧（只用于本 suite 的 playable 对照，不碰真 provider） */
function withVideoFrames(sb: ReturnType<typeof planStoryboard>) {
  return {
    ...sb,
    shots: sb.shots.map((shot) => ({ ...shot, videoAssetId: `vid-${shot.id}` })),
  };
}

export const videoPlanSuite: EvalSuite = {
  name: 'video-plan',
  dimension: '代码正确性 / 视频模型投影自洽（§40-42）',
  needsDatabase: false,

  run() {
    const rec = new EvalRecorder();
    console.log('\n== 视频模型投影自洽（§40-42）· 断句→分镜→时间线→渲染计划 整链确定性 ==');

    // 1. 分镜确定性：同 prompt 两次投影逐字段相同（§16 要能重放）
    {
      const a = planStoryboard('他跑了。她走了，我追。风很大。');
      const b = planStoryboard('他跑了。她走了，我追。风很大。');
      rec.structural('分镜确定性：同 prompt 两次 planStoryboard 逐字段相同', deepEqual(a, b), deepEqual(a, b) ? 'equal' : 'DIFFERS');
    }

    // 2. 断句即镜头数（不凑数）：3 个中文子句 → 恰好 3 镜
    {
      const sb = planStoryboard('他跑了。她走了，我追。');
      const clauseCount = '他跑了。她走了，我追。'.split(/[。！？；，、\n\r,.!?;]+/).map((s) => s.trim()).filter(Boolean).length;
      rec.structural('断句即镜头数：3 子句→3 镜（不凑数）', sb.shots.length === clauseCount, `${sb.shots.length}/${clauseCount}`);
    }

    // 3. 单句 prompt 只有一镜
    {
      const sb = planStoryboard('一个人在漆黑的房间里醒来');
      rec.structural('单句 prompt → 恰好 1 镜', sb.shots.length === 1, sb.shots.length);
    }

    // 4. MAX_SHOTS 封顶：超额段落合并进末镜且 note 说明
    {
      const longPrompt = Array.from({ length: 16 }, (_, i) => `第${i + 1}段`).join('。');
      const sb = planStoryboard(longPrompt);
      const mergedNote = sb.notes.some((n) => n.includes('并成一句'));
      rec.structural(`MAX_SHOTS 封顶：超额→恰好 ${MAX_SHOTS} 镜`, sb.shots.length === MAX_SHOTS, sb.shots.length);
      rec.structural('MAX_SHOTS 超额：note 说明末镜合并', mergedNote, mergedNote ? 'noted' : 'NO NOTE');
    }

    // 5. 空句/纯标点不造镜（明说"空的"而不是"生成失败"）
    {
      const sb = planStoryboard('   ！！！  ');
      const emptyNote = sb.notes.some((n) => n.includes('没有输入句子'));
      rec.structural('空句不造镜：shots 为空', sb.shots.length === 0, sb.shots.length);
      rec.structural('空句：note 说明为什么是空的', emptyNote, emptyNote ? 'noted' : 'NO NOTE');
    }

    // 6. 箭头出处门禁：同一张规则，界面禁用与服务端拒收读的是同一句
    {
      const imgMissing = missingArrowSource({ arrow: 'image-to-video' });
      const charMissing = missingArrowSource({ arrow: 'character-to-scene' });
      const textOk = missingArrowSource({ arrow: 'text-to-video' });
      const sbOk = missingArrowSource({ arrow: 'storyboard-to-video' });
      rec.structural('箭头门禁：image-to-video 缺参考图必报缺', imgMissing.length > 0, imgMissing.length);
      rec.structural('箭头门禁：character-to-scene 缺角色必报缺', charMissing.length > 0, charMissing.length);
      rec.structural('箭头门禁：text-to-video 不需出处（不报缺）', textOk.length === 0, textOk.length);
      rec.structural('箭头门禁：storyboard-to-video 不需出处（不报缺）', sbOk.length === 0, sbOk.length);
    }

    // 7. 时间线投影连续无洞 + camera 轨与 video 轨 shotId 一致
    {
      const sb = planStoryboard('他跑了。她走了，我追。风很大。');
      const tl = timelineOf(sb);
      const video = tl.tracks.find((t) => t.kind === 'video')!;
      const camera = tl.tracks.find((t) => t.kind === 'camera')!;
      const contiguous = video.clips.every((c, i) => i === 0 ? c.startMs === 0 : c.startMs === video.clips[i - 1]!.endMs);
      const endsAtTotal = video.clips.length === 0 || video.clips[video.clips.length - 1]!.endMs === tl.totalMs;
      const cameraMirrors = JSON.stringify(camera.clips.map((c) => c.shotId)) === JSON.stringify(video.clips.map((c) => c.shotId));
      rec.structural('时间线 video 轨首尾相接无洞', contiguous, contiguous ? 'contiguous' : 'GAP/overlap');
      rec.structural('时间线 video 轨末段结束 == totalMs', endsAtTotal, `${tl.totalMs}`);
      rec.structural('时间线 camera 轨 shotId 与 video 轨一致', cameraMirrors, cameraMirrors ? 'mirrored' : 'MISMATCH');
    }

    // 8. playable 一致性：没帧不可播且 blockers 说清；有帧可播且 blockers 空
    {
      const sb = planStoryboard('他跑了。她走了。');
      const noFrames = timelineOf(sb);
      const withFrames = timelineOf(withVideoFrames(sb));
      rec.structural('playable 一致性：无帧→不可播且 blockers 非空', !noFrames.playable && noFrames.blockers.length > 0, `playable=${noFrames.playable} blockers=${noFrames.blockers.length}`);
      rec.structural('playable 一致性：有帧→可播且 blockers 空', withFrames.playable && withFrames.blockers.length === 0, `playable=${withFrames.playable} blockers=${withFrames.blockers.length}`);
    }

    // 9. splitShotAt 时长守恒：前+后==原长，前半保留 id，后半换新 id
    {
      const shot = planStoryboard('他跑了。她走了。').shots[0]!;
      const out = splitShotAt(shot, 1500, 'shot-second');
      const conserved = out.ok && out.headMs + out.tail.durationMs === shot.durationMs;
      const tailNewId = out.ok && out.tail.id === 'shot-second' && out.tail.id !== shot.id;
      rec.structural('splitShotAt 时长守恒：head+tail==原长', !!conserved, conserved ? `${out.headMs}+${out.ok ? out.tail.durationMs : 0}=${shot.durationMs}` : 'no');
      rec.structural('splitShotAt 后半换新 id（不覆盖原镜）', !!tailNewId, tailNewId ? 'new-id' : 'no');
      rec.structural('splitShotAt 拒绝非法切点（tail<最小步长）', splitShotAt(shot, 10, 'x').ok === false, 'rejected');
    }

    // 10. 渲染计划确定性 + demo 恒真 + renderable 与镜头数自洽
    {
      const sb = planStoryboard('他跑了。她走了，我追。风很大。');
      const p1 = planVideoRender(sb);
      const p2 = planVideoRender(sb);
      const deterministic = deepEqual(p1, p2);
      const renderableOk = p1.renderable === (sb.shots.length > 0);
      rec.structural('渲染计划确定性：同分镜两次 planVideoRender 逐字段相同', deterministic, deterministic ? 'equal' : 'DIFFERS');
      rec.structural('渲染计划 demo 恒为 true（DEMO 像素，不冒充 provider）', p1.demo === true, String(p1.demo));
      rec.structural('renderable 与镜头数自洽', renderableOk, `${p1.renderable}/${sb.shots.length}`);
    }

    // 11. 渲染计划色卡 / 整片来源自洽
    {
      const noRef = planStoryboard('他跑了。她走了。我追。');
      const pNoRef = planVideoRender(noRef);
      // 整片图补位路径：arrow 带整片参考图，但各镜**没有**自己的参考帧——
      // 这一格必须靠 storyboard.source.referenceAssetId 顶上去（planStoryboard 给每镜都挂同
      // 一张图时，整片图反而是"被每镜自己的决定覆盖"的那条，测的是没覆盖的那条）。
      const imgRef = {
        ...planStoryboard('他跑了。她走了。', { arrow: 'image-to-video', referenceAssetId: 'asset-whole' }),
      };
      const wholePieceSb = {
        ...imgRef,
        shots: imgRef.shots.map((shot) => {
          const { referenceAssetId: _drop, ...rest } = shot;
          return rest;
        }),
      };
      const pImgRef = planVideoRender(wholePieceSb);
      rec.structural('无参考帧：全部用色卡占位（cardCount==镜数）', pNoRef.cardCount === noRef.shots.length, `${pNoRef.cardCount}/${noRef.shots.length}`);
      rec.structural('image-to-video 整片图补位：sourceReferenceCount==镜数', pImgRef.sourceReferenceCount === wholePieceSb.shots.length, `${pImgRef.sourceReferenceCount}/${wholePieceSb.shots.length}`);
    }

    // 12. cardColor 确定性：同 id 同色、异 id 异色
    {
      // 同一函数、同一参数、两次独立调用——no-self-compare 不认 string compare 作直接比较，故拆两次赋值
      const first = cardColor('shot-1-x');
      const second = cardColor('shot-1-x');
      const same = first === second;
      const diff = cardColor('shot-1-x') !== cardColor('shot-2-y');
      const hex = /^#[0-9a-f]{6}$/.test(cardColor('shot-1-x'));
      rec.structural('cardColor 确定性：同 id 同色', same, same ? 'stable' : 'UNSTABLE');
      rec.structural('cardColor 区分度：异 id 异色', diff, diff ? 'distinct' : 'COLLIDE');
      rec.structural('cardColor 输出合法 #rrggbb', hex, cardColor('shot-1-x'));
    }

    // 13. 空分镜不被当成"生成失败"
    {
      const sb = emptyStoryboard();
      const tl = timelineOf(sb);
      const rp = planVideoRender(sb);
      rec.structural('空分镜→时间线空且 blockers 说明', tl.blockers.length > 0 && tl.tracks.find((t) => t.kind === 'video')!.clips.length === 0, `blockers=${tl.blockers.length}`);
      rec.structural('空分镜→渲染计划不可渲（renderable=false）', rp.renderable === false, String(rp.renderable));
    }

    // 别空转：这套结构性 check 至少 10 条（不是空壳）
    rec.structural('套件总览：结构性 check >= 10（非空壳）', rec.checks.length >= 10, rec.checks.length);

    rec.skip('ffmpeg 真渲染命令行（要二进制 ffmpeg，且属 codegen 层而非投影层）');
    rec.skip('真 provider 像素（§79 generateVideo/imageToVideo 要真 key，§159 不许假造）');
    rec.skip('character-to-scene 角色肖像进像素（模型不查库、拿不到肖像，限度已在 note 里说明）');

    return { checks: rec.checks, notMeasured: rec.notMeasured };
  },
};
