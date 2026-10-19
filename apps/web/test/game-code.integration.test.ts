import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as generateCode } from '../src/app/api/projects/[projectId]/game/code/route';
import { GET as generateZip } from '../src/app/api/projects/[projectId]/game/code/zip/route';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { gameDraft } from '../src/lib/agent-game-draft';
import { addEntity, ARTIFACT_CHAINS, codeKindReadings, generateGameCode, type GameDocument } from '@nexus/game-model';
import { GameDocumentSchema } from '@nexus/schemas';
import { MAX_CODE_JSON_BYTES, MAX_CODE_ZIP_BYTES } from '../src/server/domain/gameCode';
import { readZip } from '../src/lib/zip-read';
import { saveGame } from '../src/server/domain/games';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, sessions, users } from '../src/server/db/schema';

/**
 * §52 最后一格（Code）的出口 `GET /api/projects/<id>/game/code` 打真库。
 *
 * 这一片要钉的是五件事，每件都是"少一条就会出事"的那种：
 * ① 没有游戏设计时说清"去哪建一份"，而不是回一个空产物让人以为生成成功；
 * ② 产物吃的是库里那份设计（不是请求体贴进来的任意文档）——**写接口与读投影分开**：
 *    这个端点只读、不需要 CSRF， Admission 走会话 cookie 与项目归属；
 * ③ 产物字节数如实报出来，超过上限回 413 而不是塞一份无界 JSON；
 * ④ 别人的项目与"不存在"同一个答案（项目归属判定，404）；
 * ⑤ 库里那份设计标的类型**在产物里有没有对应的引擎**：有（2D 五种、RPG 原型）时不许留一句空警告，
 *    没有（对话两型）时那句话要随响应一起出来，且与 README / index.html 里的是同一个字符串
 *    （界面上那三处不许各写一遍）。§52 第二链落地后，`rpg-prototype` 归入"有引擎"那一边，
 *    见证同时要求 `plan.json` 里的 growth 与 `engine.js` 里那段转写都在——只改文案不改字节也算谎。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string): Record<string, string> {
  jar.clear();
  jar.set(SESSION_COOKIE, token);
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

function call(projectId: string, headers: Record<string, string>): Promise<Response> {
  return generateCode(new Request(`http://localhost:3100/api/projects/${projectId}/game/code`, { headers }), {
    params: Promise.resolve({ projectId }),
  });
}

function callZip(projectId: string, headers: Record<string, string>): Promise<Response> {
  return generateZip(new Request(`http://localhost:3100/api/projects/${projectId}/game/code/zip`, { headers }), {
    params: Promise.resolve({ projectId }),
  });
}

/** §52 那张确定性配方表——与编排里 Game Agent 那一步同一份输入，投影的输入不用另造一份 */
function sampleGame(projectId: string): GameDocument {
  return gameDraft({ goal: '为这一片测试造一份能跑的设计', at: '2026-10-13T00:00:00.000Z', projectId });
}

let owner: string;
let ownerToken: string;
let stranger: string;
let strangerToken: string;

beforeAll(async () => {
  const db = getDb();
  const [me] = await db
    .insert(users)
    .values({ displayName: 'Codegen 房主', email: `codeout+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = me!.id;
  ownerToken = await identityFor(owner);
  const [other] = await db
    .insert(users)
    .values({ displayName: 'Codegen 路人', email: `codeout2+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  stranger = other!.id;
  strangerToken = await identityFor(stranger);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(projects).where(eq(projects.ownerId, stranger));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, stranger));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(owner, { name, kind: 'website' })).id;
}

describe('§52 Code 出口：把库里那份设计投影成拿得走的产物', () => {
  it('没有游戏设计 → 404，并且说清去哪建一份（不是回一个空产物）', async () => {
    const projectId = await newProject('还没有游戏');
    const res = await call(projectId, asUser(ownerToken));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('game_missing');
    expect(body.message).toContain('创建游戏骨架');
  });

  it('写进库的那份设计 → 产物与它逐字节对应：文件数、plan 里的实体、字节数都对上', async () => {
    const projectId = await newProject('有游戏');
    await saveGame(projectId, owner, sampleGame(projectId));

    const res = await call(projectId, asUser(ownerToken));
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const parsed = JSON.parse(text) as {
      ok: boolean;
      files: { path: string; contents: string; mime: string; origin: unknown }[];
      notes: string[];
      bytes: number;
      limits: string[];
      kindPipeline: string | null;
      artifactChain: string;
      kindNote: string | null;
    };
    expect(parsed.ok).toBe(true);
    // HTML 入口与 plan.json 都在：少一件就不是"拿得走的产物"
    const paths = parsed.files.map((f) => f.path);
    expect(paths).toContain('index.html');
    expect(paths).toContain('plan.json');
    expect(paths.some((p) => p.endsWith('.js')), '引擎 JS 不在产物里').toBe(true);
    // 产物吃的是库里那份：plan 的名字就是设计文档的名字，实体一个不多一个不少
    const plan = JSON.parse(parsed.files.find((f) => f.path === 'plan.json')!.contents) as {
      name: string;
      player: unknown;
      enemies: unknown[];
      items: unknown[];
      npcs: unknown[];
      quests: unknown[];
      playable: boolean;
    };
    const design = sampleGame(projectId);
    expect(plan.name).toBe(design.name);
    // 每个类别的个数与设计里的实体按 kind 数出来的相等（`compileGame` 按 kind 归类，
    // trigger 之类的类别不进 actor 列表——投影的归类口径要与设计数出来的对得上）
    const countOf = (kind: string): number => design.entities.filter((entity) => entity.kind === kind).length;
    expect(plan.player ? 1 : 0).toBe(countOf('player'));
    expect(plan.enemies.length).toBe(countOf('enemy'));
    expect(plan.items.length).toBe(countOf('item'));
    expect(plan.npcs.length).toBe(countOf('npc'));
    expect(plan.quests.length).toBe(countOf('quest'));
    expect(plan.playable, '这份设计应当能开跑').toBe(true);
    // 字节数是产物自己的数，不少于文件内容之和（上限保护，别让响应无界）
    const summed = parsed.files.reduce((total, f) => total + f.contents.length, 0);
    expect(parsed.bytes).toBeGreaterThan(0);
    expect(parsed.bytes).toBeGreaterThanOrEqual(summed);
    // §69：每个文件都标 origin，靠路径猜归属的那份索引迟早说谎
    expect(parsed.files.every((f) => f.origin !== undefined && f.origin !== null)).toBe(true);
    // 限度随产物一起念出来（转写、不执行、CSP）
    expect(parsed.limits.length).toBeGreaterThan(0);
    expect(parsed.limits.join('')).toContain('connect-src');

    /**
     * 这份底稿标的是 `rpg-prototype`（`gameDraft` 的配方就是这一型），而 §52 第二链之后
     * 产物**真的带了那条引擎**：`artifactChain` 是 rpg、`kindNote` 是 null、plan.json 里多出 growth。
     * 这一条钉的是"补齐之后不许还留着一句错位话"，也不许只在响应里改一句文案——
     * 数据（growth）与代码（NexusRpg 那段转写）都得真的在包里，界面上那句才是有对应用语境的。
     */
    const reading = codeKindReadings(design);
    expect(reading.kindPipeline, '这一型在平台上读的是成长那条链').toBe('rpg');
    expect(parsed.kindPipeline).toBe(reading.kindPipeline);
    expect(parsed.artifactChain).toBe(reading.artifactChain);
    expect(parsed.kindNote, '链对上了还说话就是谎').toBeNull();
    expect(parsed.kindNote).toBe(reading.kindNote);
    const growth = (plan as { growth?: { xpBase: number; enemyXp: unknown[] } }).growth;
    expect(growth, '产物里没有成长层那份数：下载的这份跑不出等级与经验').toBeTruthy();
    expect(growth!.enemyXp.length).toBe(plan.enemies.length);
    const engine = parsed.files.find((f) => f.path === 'engine.js')!.contents;
    expect(engine, 'engine.js 少了那段转写，growth 那份数就没有读它的代码').toContain('NexusRpg');
    expect(parsed.files.find((f) => f.path === 'README.txt')!.contents).toContain(ARTIFACT_CHAINS.rpg.dataNote);
  });

  it('没接进产物的那一型（对话）：错位那句话随响应一起出来，三处同一句', async () => {
    const projectId = await newProject('有游戏-对话');
    const story: GameDocument = { ...sampleGame(projectId), kind: 'visual-novel' };
    await saveGame(projectId, owner, story);

    const res = await call(projectId, asUser(ownerToken));
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const parsed = JSON.parse(text) as {
      files: { path: string; contents: string }[];
      kindPipeline: string | null;
      artifactChain: string;
      kindNote: string | null;
    };
    const reading = codeKindReadings(story);
    expect(parsed.kindPipeline).toBe(reading.kindPipeline);
    // 链没落上的类型落回 topdown 那份投影，而这件事由 kindNote 说出，不由界面猜
    expect(parsed.artifactChain).toBe('topdown');
    expect(parsed.kindNote, '这一型在产物里没有引擎，必须说出来').toBe(reading.kindNote);
    for (const path of ['README.txt', 'index.html']) {
      const body = parsed.files.find((f) => f.path === path)!.contents;
      expect(body, `${path} 里没有那句错位说明`).toContain(parsed.kindNote!);
    }
    // 那句"画布读的就是这一份"讲的是平台界面，对这一型不成立，不许留在 README 里
    expect(parsed.files.find((f) => f.path === 'README.txt')!.contents).not.toContain(ARTIFACT_CHAINS.topdown.dataNote);
  });

  it('这一型读的就是产物那条链：响应里不许留一句空的警告', async () => {
    const projectId = await newProject('有游戏-2d');
    const flat: GameDocument = { ...sampleGame(projectId), kind: '2d' };
    await saveGame(projectId, owner, flat);

    const res = await call(projectId, asUser(ownerToken));
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const parsed = JSON.parse(text) as {
      files: { path: string; contents: string }[];
      kindPipeline: string | null;
      artifactChain: string;
      kindNote: string | null;
    };
    expect(parsed.kindPipeline).toBe('topdown');
    expect(parsed.artifactChain).toBe('topdown');
    expect(parsed.kindNote).toBeNull();
    // 没有警告不等于没有话可说：README 回到那句真话，页面里也不许有一个空的下架位
    const readme = parsed.files.find((f) => f.path === 'README.txt')!.contents;
    expect(readme).toContain(ARTIFACT_CHAINS.topdown.dataNote);
    expect(parsed.files.find((f) => f.path === 'index.html')!.contents).not.toContain('kind-note');
    expect(parsed.files.find((f) => f.path === 'engine.js')!.contents).not.toContain('NexusRpg');
    // 反向对照一：同一份文档只改 `kind` 那一格换成 rpg，警告仍不该有，但引擎该多一段
    const asRpg = generateGameCode({ ...flat, kind: 'rpg-prototype' });
    expect(asRpg.kindNote).toBeNull();
    expect(asRpg.files.find((f) => f.path === 'engine.js')!.contents).toContain('NexusRpg');
    // 反向对照二：换成对话那一型（产物里没它的引擎），警告就该出现——证明上面那句 null 不是恒为 null
    const shifted = codeKindReadings({ ...flat, kind: 'visual-novel' });
    expect(shifted.kindNote).not.toBeNull();
  });

  it('别人的项目 → 404（与"不存在"同一个答案）——项目里必须真的有游戏，否则 404 来自"没有设计"而不是归属', async () => {
    const mine = await newProject('边界归属');
    // 先让这份项目**有**游戏设计：否则"没有设计"那条 404 会替归属挡枪，这条就测不到想测的东西
    await saveGame(mine, owner, sampleGame(mine));
    const res = await call(mine, asUser(strangerToken));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error, '归属不对时不能拿"没有设计"当挡箭牌').not.toBe('game_missing');
  });
});

/**
 * §52 最后一格的**下载出口**（`GET /api/projects/<id>/game/code/zip`）。
 *
 * 与 JSON 出口同一个闸口（`projectGameCode`），所以这一片要钉的核心是：
 * - 同一个闸口带来的三件事完全一样：404 的两条、500 那一条，**包括顺序**（归属判在设计之前）；
 * - 两个出口里的 `plan.json` 逐字节相同——这是"一份真值、两个投影"的意思（zip 是 store 不压缩，
 *   所以那份 JSON 是明文躺在包里，能直接比）。
 */
describe('§52 Code 下载出口：zip 与 JSON 共用同一道闸口', () => {
  it('zip 头是 PK、content-type 与回执都对，包里那份 plan.json 与 JSON 出口逐字节相同', async () => {
    const projectId = await newProject('zip 与 json 同一份');
    await saveGame(projectId, owner, sampleGame(projectId));

    const jsonBody = JSON.parse(await (await call(projectId, asUser(ownerToken))).text()) as {
      files: { path: string; contents: string }[];
    };
    const planJson = jsonBody.files.find((file) => file.path === 'plan.json')!;

    const res = await callZip(projectId, asUser(ownerToken));
    // 报文只能读一次：`expect(res.status, await res.text())` 会吃掉 body，下面 arrayBuffer 就用不了
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    const zip = Buffer.from(await res.arrayBuffer());
    // 回执与 content-length 同源：客户端要解包才知道有几个文件，"打包成功"不该等到那时才敢说
    expect(res.headers.get('content-length')).toBe(String(zip.byteLength));
    // zip 魔数 + store 不压缩：路径与内容都是明文，所以能逐字节比
    expect(zip.subarray(0, 2).toString('latin1')).toBe('PK');
    const raw = zip.toString('latin1');
    expect(raw).toContain('plan.json');
    expect(planJson.contents.length, 'plan.json 太大就不是 store 明文这一条的前提了').toBeLessThan(60_000);
    // 逐字节比：plan.json 里有中文，latin1 解出来的串和 JS 字符串不是一个记号系统
    const zipBytes = Buffer.from(zip);
    const planJsonBytes = Buffer.from(planJson.contents, 'utf8');
    expect(zipBytes.includes(planJsonBytes), '两个出口里的 plan.json 必须逐字节相同').toBe(true);
    // 回执要能原样解回来（中文设计名在头里是 \uXXXX 转义，JSON 解回来还得是那个名字）
    const receipt = JSON.parse(res.headers.get('x-nexus-code-receipt') ?? '{}') as {
      files: number;
      zipBytes: number;
      documentName: string;
    };
    expect(receipt.files).toBe(jsonBody.files.length);
    expect(receipt.zipBytes).toBe(zip.byteLength);
    expect(receipt.documentName, `name mismatch: got "${receipt.documentName}" want "${sampleGame(projectId).name}"`).toBe(
      encodeURIComponent(sampleGame(projectId).name),
    );
    // 文件名走 RFC 5987：中文设计名不该把头变成一个谜
    const disposition = res.headers.get('content-disposition') ?? '';
    expect(disposition).toContain('filename*=UTF-8');
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1] ?? '')).toContain('.zip');
  });

  it('同一个闸口：没有设计 → 404 game_missing（zip 出口与 JSON 出口同一个答案）', async () => {
    const projectId = await newProject('zip 没有设计');
    const res = await callZip(projectId, asUser(ownerToken));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('game_missing');
  });

  it('同一个闸口：别人的项目 → 404 not_found，且**不是** game_missing（顺序不能漂移）', async () => {
    const mine = await newProject('zip 归属');
    await saveGame(mine, owner, sampleGame(mine));
    const res = await callZip(mine, asUser(strangerToken));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  // 这一条才是**顺序**的观察点：项目里没有游戏设计时，归属错了也不能说成"没有设计"。
  // 上面那条测不出来这个区别——那个项目里有设计，两种顺序都回 not_found；这条项目里**没有**设计，
  // 于是"先判设计"会把 game_missing 漏给不该知道它存在的人。
  it('同一个闸口：别人的项目且也没有设计 → 仍是 not_found，不许退化成 game_missing', async () => {
    const theirs = await newProject('zip 归属且没有设计');
    const jsonRes = await call(theirs, asUser(strangerToken));
    expect(jsonRes.status).toBe(404);
    expect((await jsonRes.json()).error).toBe('not_found');
    const zipRes = await callZip(theirs, asUser(strangerToken));
    expect(zipRes.status).toBe(404);
    expect((await zipRes.json()).error).toBe('not_found');
  });
});

/**
 * 两道字节上限的**可达性**（头注释里第 ③ 件）。
 *
 * 为什么这一片值得慢这十几秒：`413` 那两条是这一格里唯一"平时看不见"的分支——
 * 一份正常设计永远撞不到它，于是它很容易退化成一句装饰（写了上限、没人证明它能被超过）。
 * 这三条把它钉成事实：
 * ① 1MB 与 4MB **是两个不同的数**：一份中等大的设计在 JSON 那一路被拒、在 zip 那一路拿得到包；
 *    要是两处共用一个上限，这一条就红——那也正是"下载那一档存在的意义"被抹掉的时刻。
 * ② 4MB 也撞得开，用的是 schema 允许的最大一份设计（`packages/schemas` 的 entities 上限）。
 *    上限如果大到合法范围内永远撞不开，这一条会红在前提那句上，而不是悄悄绿着。
 * ③ 拒的时候**不把产物一起吐回来**：413 的意义就是"这一次不发这份字节"，
 *    一份带着 `files` 的 413 等于把上限保护自己拆了。
 *
 * 每实体在产物里约 980 字节（`scripts/game-code-parity.mts` 与本地探针量的），
 * 所以下面按"档"挑实体数，而**不写死字节数**——真正的字节判断来自响应里报的那个数字。
 */
const ENTITY_CEILING = 5000;

/** 从真草稿往上铺量到 count 个实体：起点用 §52 那份配方表，不另造一个"差不多"的文档 */
function paddedGame(projectId: string, count: number): GameDocument {
  let doc = sampleGame(projectId);
  for (let i = doc.entities.length; i < count; i += 1) {
    doc = addEntity(doc, { kind: i % 3 === 0 ? 'item' : 'enemy', name: `铺量 ${i}` });
  }
  return doc;
}

describe('§52 Code 的字节上限：1MB 与 4MB 是两档，而且都撞得开', () => {
  let midProject: string;
  let midDoc: GameDocument;
  let bigProject: string;
  let bigDoc: GameDocument;

  beforeAll(async () => {
    // 中等那一份：要落在"JSON 装不下、zip 还装得下"那一档里，中间那条前提会验它
    midProject = await newProject('大到 JSON 装不下');
    midDoc = paddedGame(midProject, 1500);
    expect((await saveGame(midProject, owner, midDoc)).ok, 'fixture 自己得先合法').toBe(true);
    // 最大那一份：schema 允许的上限，用来撞 4MB 那一档
    bigProject = await newProject('大到 zip 也装不下');
    bigDoc = paddedGame(bigProject, ENTITY_CEILING);
    expect((await saveGame(bigProject, owner, bigDoc)).ok, 'fixture 自己得先合法').toBe(true);
  }, 120_000);

  it('前提：中等那份正好落在两档之间，最大那份是 schema 允许的上限（再多一个实体就不合法）', () => {
    const mid = generateGameCode(midDoc);
    expect(mid.bytes, `中等 fixture 没落在两档之间（${mid.bytes} 字节）：这一条要按 ${MAX_CODE_JSON_BYTES}/${MAX_CODE_ZIP_BYTES} 重挑实体数`).toBeGreaterThan(
      MAX_CODE_JSON_BYTES,
    );
    expect(mid.bytes, '中等 fixture 已经大到 zip 那一档也拒：那"两个出口两个数"这件事就没被量过').toBeLessThan(MAX_CODE_ZIP_BYTES);
    expect(GameDocumentSchema.safeParse(bigDoc).success, '最大那份 fixture 不合法，下面那条 413 测的就不是"合法范围内的最大一份"').toBe(true);
    expect(
      GameDocumentSchema.safeParse({ ...bigDoc, entities: [...bigDoc.entities, bigDoc.entities[0]!] }).success,
      `schema 的实体上限不在 ${ENTITY_CEILING} 这一档了：上限改了，这一片的 fixture 要跟着改`,
    ).toBe(false);
  });

  it('JSON 出口拒、zip 出口放行：同一份设计，两个出口的答复不一样，而且各自报出自己的数字', async () => {
    const res = await call(midProject, asUser(ownerToken));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('code_too_large');
    // 拒绝里的数字与它自己判的那一条同源（不是手抄一个字节数）
    expect(body.bytes, '拒的那条得把自己量到的字节数念出来').toBe(generateGameCode(midDoc).bytes);
    expect(body.limit).toBe(MAX_CODE_JSON_BYTES);
    expect(body.files, '413 不能顺手把整份产物也塞回响应里').toBeUndefined();
    // 这一句指向下载那一档，而那一档确实更大——上面那条前提已经量过它够得着
    expect(body.message).toContain('打包');
    expect(body.message).toContain(String(MAX_CODE_ZIP_BYTES));

    const zipRes = await callZip(midProject, asUser(ownerToken));
    const zip = Buffer.from(await zipRes.arrayBuffer());
    expect(zipRes.status, zip.subarray(0, 200).toString()).toBe(200);
    expect(zipRes.headers.get('content-type')).toBe('application/zip');
    // JSON 那一路拒了 1.5MB，这一路要**原样**给出这 1.5MB：头里的长度与体同源
    expect(Number(zipRes.headers.get('content-length'))).toBe(zip.byteLength);
    const entries = readZip(new Uint8Array(zip));
    expect(entries.map((entry) => entry.path).sort()).toEqual(
      generateGameCode(midDoc).files.map((file) => file.path).sort(),
    );
  }, 120_000);

  it('zip 那一档也撞得开：用合法范围内的最大一份设计，拒答里给的是"拆小"而不是"换个出口"', async () => {
    const res = await callZip(bigProject, asUser(ownerToken));
    expect(res.status).toBe(413);
    // 拒答必须是 JSON，不能是一份只写了半个头的 zip
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.error).toBe('code_too_large');
    expect(body.bytes).toBeGreaterThan(MAX_CODE_ZIP_BYTES);
    expect(body.limit).toBe(MAX_CODE_ZIP_BYTES);
    expect(body.files, '413 不能顺手把整份产物也塞回响应里').toBeUndefined();
    // 下载这一路已经是最后一档了：它不能再把用户指向"另一个更大的出口"
    expect(body.message).toContain('拆');
    expect(body.message).not.toContain('打包');
  }, 120_000);
});
