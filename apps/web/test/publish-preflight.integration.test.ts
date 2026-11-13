import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/creative-model';
import { checkPublishPreflight } from '../src/server/domain/publishPreflight';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import type { AiCapabilities } from '../src/lib/env';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §56 发布预检的集成门（真库、真门禁、真机检）：预检不写库，只读地把
 * slot / 门禁 / 机检 这一条链在同一个函数组合下算一遍。
 */

let ownerId: string;

/** 确定性能力钉住：预检只读，不调真 ai-service——喂一份写定的好处，便于判定不抖 */
const READONLY_CAPS: AiCapabilities = { text: 'demo', image: 'demo', video: 'demo', live: false };
const LIVE_CAPS: AiCapabilities = { text: 'real', image: 'demo', video: 'demo', live: true };

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('测试库不可达');
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Preflight', email: `preflight+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  await db.update(users).set({ plan: 'studio' }).where(eq(users.id, ownerId));
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(ownerId, { name, kind: 'website' })).id;
}

async function addText(projectId: string, text: string): Promise<void> {
  const document = await loadDocument(projectId);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: text, text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(projectId, document!);
}

describe('发布预检 · 真库', () => {
  it('干净项目：预检全绿，且 facts 如实回显各检查都跑过', async () => {
    const projectId = await newProject('preflight-clean');
    const report = await checkPublishPreflight(projectId, 'public', READONLY_CAPS);
    expect(report).not.toBeNull();
    expect(report!.ok).toBe(true);
    expect(report!.blockers).toEqual([]);
    expect(report!.facts.gatePassed).toBe(true);
    expect(report!.facts.slotRefusal).toBeNull();
    expect(['clear', 'review']).toContain(report!.facts.scanDecision);
    expect(report!.facts.aiReadiness.live).toBe(false);
    expect(report!.facts.existingModeration).toBeNull();
    expect(typeof report!.ranAt).toBe('string');
  });

  it('ai-service 就绪是 real：facts.aiReadiness 原样回显 live=true（预检不发明引用）', async () => {
    const projectId = await newProject('preflight-live-caps');
    const report = await checkPublishPreflight(projectId, 'public', LIVE_CAPS);
    expect(report).not.toBeNull();
    expect(report!.facts.aiReadiness).toEqual(LIVE_CAPS);
    expect(report!.facts.aiReadiness.live).toBe(true);
  });

  it('命中 §129 硬红线：ok=false，blockers 点名机检挡下（与真发布一字同源）', async () => {
    const projectId = await newProject('preflight-blocked');
    await addText(projectId, 'child porn content planted for the preflight gate');
    const report = await checkPublishPreflight(projectId, 'public', READONLY_CAPS);
    expect(report).not.toBeNull();
    expect(report!.ok).toBe(false);
    expect(report!.facts.scanDecision).toBe('blocked');
    expect(
      report!.blockers.some((b) => b.includes('机检挡下')),
      `blockers 应点名机检挡下：${report!.blockers.join(' | ')}`,
    ).toBe(true);
  });

  it('切到 private 是收回链接，门禁与机检对该方向不拦 === ok=true', async () => {
    const projectId = await newProject('preflight-private');
    const report = await checkPublishPreflight(projectId, 'private', READONLY_CAPS);
    expect(report).not.toBeNull();
    expect(report!.ok).toBe(true);
    expect(report!.warnings.length).toBeGreaterThan(0);
    expect(report!.warnings[0]).toContain('private');
  });

  it('项目不存在/已删除：预检返回 null（不猜、不 500）', async () => {
    expect(await checkPublishPreflight('00000000-0000-0000-0000-000000000000', 'public')).toBeNull();
  });
});
