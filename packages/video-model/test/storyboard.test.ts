import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHOT_MS,
  MAX_SHOTS,
  emptyStoryboard,
  planStoryboard,
  timelineOf,
  type StoryboardShot,
} from '../src/index';

/**
 * §40-42 模型包的门禁：这里钉的都是**会说谎的那几处**。
 *
 * 一个分镜包最容易骗人的方式有三种：① 把"本地确定性断句"说成 AI 分镜；
 * ② 时间线画得满满当当，却没有一帧视频（点了播放什么也没有）；
 * ③ 空轨不出现，于是界面上"没有音频"与"渲染失败"长得一模一样。
 * 每条用例盯住其中一种，并且都配了"如果实现偷懒会怎样"的反面断言。
 */

const SENTENCE = '夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳，它跑起来了';

function cameras(shots: StoryboardShot[]): string[] {
  return shots.map((s) => s.camera);
}

describe('§40 planStoryboard：分镜是投影，不是编出来的', () => {
  it('同一句话两次切分逐字段相同（纯函数：无随机、无时钟）', () => {
    const a = planStoryboard(SENTENCE);
    const b = planStoryboard(SENTENCE);
    expect(b).toEqual(a);
    expect(a.shots).toHaveLength(4);
  });

  it('镜头数 = 断句数，不凑数：一句短话就一镜，并且说明为什么只有一镜', () => {
    const one = planStoryboard('一个人走进雨里');
    expect(one.shots).toHaveLength(1);
    expect(one.shots[0]?.prompt).toBe('一个人走进雨里');
    expect(one.notes.join('\n'), '只有一镜却没说原因，界面上看着像切分失败').toContain('没有可断的标点');

    const many = planStoryboard('一，二，三，四，五');
    expect(many.shots).toHaveLength(5);
  });

  it('空输入不编镜头：0 镜 + 一句原因（而不是"生成了一张空分镜"）', () => {
    const sb = planStoryboard('   。  ， ');
    expect(sb.shots).toEqual([]);
    expect(sb.notes.join('\n')).toContain('没有输入句子');
    // 与 emptyStoryboard 同一个形状：新建时与切完是空的，界面上不该分两种写法
    expect(Object.keys(sb).sort()).toEqual(Object.keys(emptyStoryboard()).sort());
  });

  it('机位规则写在 notes 里，也确实按规则给：首镜宽景、尾镜特写、运动句给跟移', () => {
    const sb = planStoryboard(SENTENCE);
    expect(sb.shots[0]?.camera).toBe('wide');
    expect(sb.shots[3]?.camera).toBe('tracking');
    // 「猫跳上缆绳」含运动词（跳），所以它也走跟移——规则要按实现说，不按写用例的人的想象说
    expect(cameras(sb.shots)).toEqual(['wide', 'medium', 'tracking', 'tracking']);
    expect(sb.notes.join('\n')).toContain('首镜宽景');
    // 单镜不配"首=宽、尾=特写"两个身份：给中景，规则说明里不能自相矛盾
    expect(planStoryboard('只有一个人').shots[0]?.camera).toBe('medium');
  });

  it('含运动词的句子时长给足，其余按默认值（规则要能从 notes 里读出来）', () => {
    const sb = planStoryboard('它跑起来了，然后停下');
    expect(sb.shots[0]?.durationMs).toBe(Math.round(DEFAULT_SHOT_MS * 1.5));
    expect(sb.shots[1]?.durationMs).toBe(DEFAULT_SHOT_MS);
    expect(sb.notes.join('\n')).toContain(`${Math.round(DEFAULT_SHOT_MS * 1.5)} 毫秒`);
  });

  it(`超过 ${MAX_SHOTS} 段时并镜不丢内容：每一段都还在某一句里`, () => {
    const clauses = Array.from({ length: MAX_SHOTS + 5 }, (_, i) => `第${i + 1}个动作`);
    const sb = planStoryboard(clauses.join('，'));
    expect(sb.shots).toHaveLength(MAX_SHOTS);
    const merged = sb.shots.map((s) => s.prompt).join('，');
    for (const clause of clauses) {
      expect(merged, `断句超限后丢了「${clause}」——并镜不能把内容吃掉`).toContain(clause);
    }
    const note = sb.notes.find((n) => n.includes('并成一句'));
    expect(note, '并了镜却没在 notes 里说').toBeTruthy();
    // notes 里报的段数必须是真的：写错一个数字，界面上就是一句假话
    expect(note).toContain(`${clauses.length - (MAX_SHOTS - 1)}`);
  });

  it('id 稳定且唯一：重排、复制都不会让两镜共用一个标识', () => {
    const sb = planStoryboard(SENTENCE);
    const ids = sb.shots.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 同一句话的同一位置 → 同一个 id（时间线、参考帧都按 id 指回来）
    expect(planStoryboard(SENTENCE).shots.map((s) => s.id)).toEqual(ids);
  });

  it('来源记进 source：四条箭头（text/image/storyboard/character）不能混成一句"自动生成的"', () => {
    const sb = planStoryboard('角色在雪地里回头', {
      arrow: 'character-to-scene',
      characterId: 'c-1',
      referenceAssetId: 'a-9',
    });
    expect(sb.source).toEqual({ arrow: 'character-to-scene', prompt: '角色在雪地里回头', characterId: 'c-1', referenceAssetId: 'a-9' });
    for (const shot of sb.shots) {
      expect(shot.characterId).toBe('c-1');
      expect(shot.referenceAssetId).toBe('a-9');
    }
  });

  it('诚实标签：这一版分镜来自本地断句，不是模型给的镜头语言', () => {
    expect(planStoryboard(SENTENCE).notes.join('\n')).toContain('不是模型给的镜头语言');
  });
});

describe('§41 timelineOf：时间线是投影，没有帧就不说能播', () => {
  it('偏移连续、总长 = 各镜之和（任何一处算错，界面上的刻度就会说谎）', () => {
    const sb = planStoryboard(SENTENCE);
    const tl = timelineOf(sb);
    const video = tl.tracks.find((t) => t.kind === 'video');
    expect(video?.clips).toHaveLength(4);
    expect(video?.clips[0]).toMatchObject({ startMs: 0, endMs: DEFAULT_SHOT_MS, durationMs: DEFAULT_SHOT_MS });
    let cursor = 0;
    for (const clip of video?.clips ?? []) {
      expect(clip.startMs).toBe(cursor);
      expect(clip.endMs).toBe(cursor + clip.durationMs);
      cursor = clip.endMs;
    }
    expect(tl.totalMs).toBe(sb.shots.reduce((sum, s) => sum + s.durationMs, 0));
  });

  it('camera 轨与镜头一一对应；transition 轨只收非硬切的那些', () => {
    const sb = planStoryboard(SENTENCE);
    const tl = timelineOf(sb);
    const camera = tl.tracks.find((t) => t.kind === 'camera');
    expect(camera?.clips.map((c) => c.camera)).toEqual(cameras(sb.shots));
    const transition = tl.tracks.find((t) => t.kind === 'transition');
    // 首镜是 fade，其余 cut：所以转场轨只有一格，而不是"每镜一格"的假满
    expect(transition?.clips.map((c) => c.label)).toEqual(['fade']);
  });

  it('没有视频帧时不可播，且理由带计数；补上帧之后就变可播', () => {
    const sb = planStoryboard(SENTENCE);
    const tl = timelineOf(sb);
    expect(tl.playable).toBe(false);
    expect(tl.blockers.join('\n')).toContain(`有 4/4 镜还没有视频帧`);
    expect(tl.notes.join('\n')).toContain('缺的是帧，不是布局');

    const withFrames: typeof sb = {
      ...sb,
      shots: sb.shots.map((s, i) => ({ ...s, videoAssetId: `v-${i}` })),
    };
    const tl2 = timelineOf(withFrames);
    expect(tl2.playable).toBe(true);
    expect(tl2.blockers).toEqual([]);
  });

  it('空轨必须存在并说明为什么是空的（缺这一句，"没有音频"与"渲染失败"在界面上就分不开）', () => {
    const tl = timelineOf(planStoryboard(SENTENCE));
    for (const kind of ['audio', 'subtitles', 'effects'] as const) {
      const track = tl.tracks.find((t) => t.kind === kind);
      expect(track, `§41 点名的 ${kind} 轨整个不见了`).toBeTruthy();
      expect(track?.clips).toEqual([]);
      expect(track?.emptyReason, `${kind} 轨空着却没说原因`).toBeTruthy();
    }
  });

  it('0 镜的分镜也给一条时间线：总长 0、不可播、原因说得出', () => {
    const tl = timelineOf(emptyStoryboard());
    expect(tl.totalMs).toBe(0);
    expect(tl.playable).toBe(false);
    expect(tl.blockers.join(' ')).toContain('还没有镜头');
  });
});
