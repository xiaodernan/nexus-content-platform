import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@nexus/schemas';
import { eq } from 'drizzle-orm';
import { planStoryboard } from '@nexus/video-model';
import { renderStoryboardDemo } from '../src/server/domain/storyboard-render';
import { saveStoryboard } from '../src/server/domain/storyboards';
import { createProject } from '../src/server/domain/projects';
import { adjustCredits, readCredits } from '../src/server/domain/credit-ledger';
import { channels, setRealtimeBus, type RealtimeBus } from '../src/server/realtime/bus';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §163：渲染链路是 `build.status` 的第三个生产者（前两个是发布与导出）。
 *
 * 这一份用例挡三种谎：
 * ① "请求一进来就报构建中"——所以额度耗尽与没有分镜那两条路必须**一条事件都没有**：
 *    渲染从未开始，就没有"构建中"可言（#191 的额度门在 startTask 之前，不插刻度）；
 * ② "失败了还报 ok"——ffmpeg 起不来那条路必须是 building → failed，且 failed 的 log 与
 *    返回给调用方的 message **逐字相同**（两处各写一遍就会漂移，发布链路的用例钉的就是这条）；
 * ③ "成功那条路忘了发 ok"——快乐路径整串是 building → ok，且 ok 的 log 说清成片入了资产库。
 *
 * 打真实 Postgres（渲染真的跑），总线换成记账用的假驱动：验的是"该发的时候发了、
 * 不该发的时候一条都没有"，且只认**项目频道**那一路。
 */

interface Captured {
  channel: string;
  event: RealtimeEvent;
}

let captured: Captured[] = [];
const bus: RealtimeBus = {
  publish: (channel, event) => captured.push({ channel, event }),
  subscribe: () => () => undefined,
  closeChannel: () => undefined,
  subscriberCount: () => 0,
  stats: () => ({ driver: 'in-process', instance: 'test-double', subscriberCount: 0, wireReady: null, wireErrorCount: null }),
};

let ownerId: string;

beforeEach(() => {
  captured = [];
  setRealtimeBus(bus);
});

beforeAll(async () => {
  const db = getDb();
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Render Build Status', email: `render-build+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
});

afterAll(async () => {
  setRealtimeBus(undefined);
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(ownerId, { name, kind: 'website' })).id;
}

async function saveBoard(projectId: string): Promise<void> {
  const board = planStoryboard('夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳', { title: '构建状态的分镜' });
  const saved = await saveStoryboard(projectId, ownerId, { document: board });
  if (!saved.ok) throw new Error(saved.reason);
}

/** 项目频道上的 build.status 整串（顺序与条数一起钉） */
function buildTrace(projectId: string): string[] {
  return captured
    .filter((item) => item.channel === channels.project(projectId) && item.event.type === 'build.status')
    .map((item) => (item.event as Extract<RealtimeEvent, { type: 'build.status' }>).status);
}

/** 免费档每月只发 5 点 video，开跑前兜到 10（与另两份渲染用例同一手法） */
async function ensureVideoCredits(): Promise<void> {
  const balance = (await readCredits(ownerId)).balances.video;
  if (balance < 10) {
    await adjustCredits({ userId: ownerId, kind: 'video', delta: 10 - balance, reason: '用例：补足渲染链路需要的额度' });
  }
}

describe('renderStoryboardDemo 的 build.status 事件串（§163）', () => {
  it('快乐路径：building → ok，ok 的 log 说清成片入了资产库，且不发 preview.status', async () => {
    const projectId = await newProject('Render Build Happy');
    await saveBoard(projectId);
    await ensureVideoCredits();

    const result = await renderStoryboardDemo({ projectId, userId: ownerId });
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (!result.ok) return;

    expect(buildTrace(projectId)).toEqual(['building', 'ok']);
    const okEvent = captured.find(
      (item) => item.channel === channels.project(projectId) && item.event.type === 'build.status' && item.event.status === 'ok',
    );
    expect((okEvent!.event as Extract<RealtimeEvent, { type: 'build.status' }>).log).toContain('成片已入资产库');
    // 渲染不是发布：项目频道上不该出现 preview.status
    expect(captured.some((item) => item.event.type === 'preview.status')).toBe(false);
  });

  it('ffmpeg 起不来：building → failed，且 failed 的 log 与返回的 message 逐字相同', async () => {
    const projectId = await newProject('Render Build No Ffmpeg');
    await saveBoard(projectId);
    await ensureVideoCredits();

    const result = await renderStoryboardDemo({ projectId, userId: ownerId, ffmpegPath: 'nexus-no-such-ffmpeg' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ffmpeg_missing');

    expect(buildTrace(projectId)).toEqual(['building', 'failed']);
    const failedEvent = captured.find(
      (item) => item.channel === channels.project(projectId) && item.event.type === 'build.status' && item.event.status === 'failed',
    );
    expect((failedEvent!.event as Extract<RealtimeEvent, { type: 'build.status' }>).log).toBe(result.message);
  });

  it('额度耗尽：一条 build.status 都没有——渲染从未开始，就没有"构建中"可言', async () => {
    const projectId = await newProject('Render Build No Credits');
    await saveBoard(projectId);
    const balance = (await readCredits(ownerId)).balances.video;
    // 库里 credit_ledger_delta_nonzero 挡着 delta=0：本来就是 0 就没什么可扣的
    if (balance > 0) {
      await adjustCredits({ userId: ownerId, kind: 'video', delta: -balance, reason: '用例：把 video 桶扣到 0' });
    }
    expect((await readCredits(ownerId)).balances.video).toBe(0);

    const result = await renderStoryboardDemo({ projectId, userId: ownerId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('credits_exhausted');
    expect(buildTrace(projectId)).toEqual([]);

    // 还回去：后面的用例还要渲染
    await adjustCredits({ userId: ownerId, kind: 'video', delta: 10, reason: '用例：结束后还回额度' });
  });

  it('没有分镜：同样零事件，读取不顺手建档也不顺手发刻度', async () => {
    const projectId = await newProject('Render Build No Board');
    const result = await renderStoryboardDemo({ projectId, userId: ownerId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('no_storyboard');
    expect(buildTrace(projectId)).toEqual([]);
  });
});
