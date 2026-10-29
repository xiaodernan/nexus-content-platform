import { describe, expect, it } from "vitest";
import {
  addEntity,
  compileGame,
  compileRpg,
  compileStory,
  createGame,
  entitiesOfKind,
  GAME_KIND_STATUS,
  linkEntities,
  playtest,
  PLAYTEST_DEFAULT_SEED,
  PLAYTEST_POLICIES,
  playtestByKind,
  playtestRpg,
  playtestSeedNote,
  playtestStory,
  removeEntity,
  runPolicy,
  setStat,
  updateEntity,
  type GameDocument,
  type GamePlan,
  type StoryPlan,
} from "../src/index";

/**
 * §53 的"自动跑一遍"。这里测的是**报告会不会说谎**，不是模拟器对不对（那在 sim.test.ts）。
 * 一条报告最值得怀疑的地方是"0 种走法通关"被写成"这游戏不可能通关"，
 * 所以每种说法都配一个反方向的用例：能通的时候它不能出现，不能判定的时候它必须出现。
 */

function write(document: GameDocument, id: string, key: string, value: number): GameDocument {
  const result = setStat(document, id, key, value);
  if (result.reason) throw new Error(`前置数值写入失败：${result.reason}`);
  return result.document;
}

function link(document: GameDocument, from: string, to: string, role: string): GameDocument {
  const result = linkEntities(document, from, to, role);
  if (result.reason) throw new Error(`前置引用失败：${result.reason}`);
  return result.document;
}

function plan(input: (doc: GameDocument) => GameDocument): GamePlan {
  return compileGame(input(createGame("试玩报告")));
}

const winnable = (doc: GameDocument): GameDocument => {
  const [player] = entitiesOfKind(doc, "player");
  const [enemy] = entitiesOfKind(doc, "enemy");
  const [item] = entitiesOfKind(doc, "item");
  const [quest] = entitiesOfKind(doc, "quest");
  let next = write(doc, player!.id, "attackPower", 10);
  next = write(next, player!.id, "health", 50);
  next = write(next, enemy!.id, "health", 10);
  next = write(next, enemy!.id, "damage", 1);
  next = write(next, enemy!.id, "speed", 0);
  next = link(next, quest!.id, enemy!.id, "讨伐");
  return link(next, quest!.id, item!.id, "收集");
};

describe('报告的确定性', () => {
  it('同一份设计两次报告逐字段相同；换种子才会换一次抽样', () => {
    const doc = winnable(createGame("确定性"));
    const first = playtest(compileGame(doc));
    const second = playtest(compileGame(doc));
    expect(second).toEqual(first);
    expect(first.runs.map((run) => run.policy)).toEqual(["idle", "beeline", "flee", "wander"]);
    // 反向对照：换种子之后随机游走那条应当走到不同的地方——
    // 如果换不换都一样，说明 rand 根本没参与，"定种子可复现"就是句空话
    const seeded = runPolicy(compileGame(doc), "wander", 20, 11);
    const otherSeed = runPolicy(compileGame(doc), "wander", 20, 23);
    expect([seeded.endX, seeded.endY]).not.toEqual([otherSeed.endX, otherSeed.endY]);
    // 同一个种子两次跑，连终点都逐位相同：可复现不是"大概一样"
    expect(runPolicy(compileGame(doc), "wander", 20, 11)).toEqual(seeded);
  });
});

describe('种子是入参，也是报告的一部分', () => {
  /**
   * 这一片把"换种子才是换一次抽样"从限度那句话变成界面上做得到的事：`playtest` / `playtestRpg`
   * 收 seed，而**报告把自己实际用的那个数带回来**。测试因此一律拿 `report.seed` 说话，
   * 不拿传进去的那个数说话——传 NaN 也能问出"到底跑了哪个种子"。
   */
  const doc = () => compileGame(winnable(createGame("种子")));
  const rpgDoc = () => compileRpg(fightDoc("种子 RPG"));

  it('不传种子就是默认那一个，而限度里写的那个数字就是行为用的那个数字', () => {
    const report = playtest(doc());
    expect(report.seed).toBe(PLAYTEST_DEFAULT_SEED);
    expect(playtestRpg(rpgDoc()).seed).toBe(PLAYTEST_DEFAULT_SEED);
    // 非自指的对照：把限度那句话里的数字抠出来，与真的跑出来的种子比。
    // 谁把文案改回硬编码 7 而把默认值挪走，这一条就红——文案与行为各说一套正是这份报告最怕的谎。
    const limitLine = report.limits[1] ?? '';
    const printed = Number(/默认 (\d+)）/.exec(limitLine)?.[1]);
    expect(printed, `限度第二句里没抠出数字：${limitLine}`).toBe(report.seed);
  });

  it('换种子只换掉随机游走那一条：三条脚本走法逐字段不动', () => {
    const seven = playtest(doc(), PLAYTEST_POLICIES, 7);
    const eleven = playtest(doc(), PLAYTEST_POLICIES, 11);
    expect(eleven.seed).toBe(11);
    // 站着不动 / 直冲 / 一直躲：这三种走法一个随机数都不取，所以换种子必须一条字节都不差
    for (const policy of ["idle", "beeline", "flee"] as const) {
      expect(
        eleven.runs.find((run) => run.policy === policy),
        `${policy} 这条走法不该跟着种子变`,
      ).toEqual(seven.runs.find((run) => run.policy === policy));
    }
    // 反向对照：随机游走那条确实换了地方——不然上面三条的相同什么都没证明
    const wanderSeven = seven.runs.find((run) => run.policy === "wander")!;
    const wanderEleven = eleven.runs.find((run) => run.policy === "wander")!;
    expect([wanderEleven.endX, wanderEleven.endY]).not.toEqual([wanderSeven.endX, wanderSeven.endY]);
    // RPG 走同一扇门：种子进得去，成长读数也照样只由那一条走法变
    const rpgSeven = playtestRpg(rpgDoc(), PLAYTEST_POLICIES, 7);
    const rpgEleven = playtestRpg(rpgDoc(), PLAYTEST_POLICIES, 11);
    expect(rpgEleven.seed).toBe(11);
    expect(rpgEleven.runs.filter((run) => run.policy !== "wander")).toEqual(
      rpgSeven.runs.filter((run) => run.policy !== "wander"),
    );
    expect(
      [rpgEleven.runs.find((run) => run.policy === "wander")!.endX,
       rpgEleven.runs.find((run) => run.policy === "wander")!.endY],
    ).not.toEqual([
      rpgSeven.runs.find((run) => run.policy === "wander")!.endX,
      rpgSeven.runs.find((run) => run.policy === "wander")!.endY,
    ]);
  });

  it('非有限值落回默认种子，而报告说的是真的跑了哪个', () => {
    const report = playtest(doc(), PLAYTEST_POLICIES, Number.NaN);
    // 说的是"实际用的"，不是"传进来的"：输入框清空拿到 NaN，界面上不能显示一个没跑过的种子
    expect(report.seed).toBe(PLAYTEST_DEFAULT_SEED);
    expect(report).toEqual(playtest(doc()));
    expect(playtest(doc(), PLAYTEST_POLICIES, Number.POSITIVE_INFINITY).seed).toBe(PLAYTEST_DEFAULT_SEED);
    // 取整而不是四舍五入：12.7 用的是 12 那条抽样，与 13 是两份不同的抽样
    expect(playtest(doc(), PLAYTEST_POLICIES, 12.7).seed).toBe(12);
    expect(playtest(doc(), PLAYTEST_POLICIES, 12.7)).toEqual(playtest(doc(), PLAYTEST_POLICIES, 12));
    // 反向对照：0 是一个**真种子**，不是"没填"的暗号。界面上清空输入框要送 NaN 而不是 0，
    // 因为把 0 当成回落值就会让"清空"悄悄换成另一份抽样
    expect(playtest(doc(), PLAYTEST_POLICIES, 0).seed).toBe(0);
    expect(playtest(doc(), PLAYTEST_POLICIES, 0)).not.toEqual(playtest(doc()));
  });

  it('面板那句种子说明分得开"默认"与"换了抽样"，两句不会互相冒充', () => {
    const defaults = playtestSeedNote(PLAYTEST_DEFAULT_SEED);
    const other = playtestSeedNote(11);
    expect(defaults).toContain(`种子 ${PLAYTEST_DEFAULT_SEED}`);
    expect(defaults).toContain("就是默认那一个");
    expect(other).toContain("种子 11");
    expect(other).toContain(`不是默认的 ${PLAYTEST_DEFAULT_SEED}`);
    expect(other).toContain("换一次抽样");
    // 反向对照：默认那句不许自称"换了抽样"，非默认那句不许自称"就是默认"
    expect(defaults).not.toContain("换一次抽样");
    expect(other).not.toContain("就是默认那一个");
  });
});

describe('能不能通这一格', () => {
  it('有可判定条件且数值合理时，至少一种走法能通关', () => {
    const report = playtest(plan(winnable));
    expect(report.winnableBy).toBeGreaterThan(0);
    expect(report.findings.join(" ")).toContain("种走法里有");
    expect(report.findings.join(" ")).not.toContain("0 种通关");
  });

  it('任务没连上可判定的对象时，说的是"条件判不出来"而不是"这版太难"', () => {
    const report = playtest(plan((doc) => doc)); // 模板任务一条引用都没有
    expect(report.winnableBy).toBe(0);
    expect(report.findings.join(" ")).toContain("不是难度问题");
    expect(report.findings.join(" ")).not.toContain("不等于没人能通");
  });

  it('几种走法都通不了时，报告要留有余地（不等于不可能通关）', () => {
    const report = playtest(
      plan((doc) => {
        const [player] = entitiesOfKind(doc, "player");
        const [enemy] = entitiesOfKind(doc, "enemy");
        const [quest] = entitiesOfKind(doc, "quest");
        let next = write(doc, player!.id, "attackPower", 1);
        next = write(next, player!.id, "health", 1);
        next = write(next, enemy!.id, "health", 999);
        next = write(next, enemy!.id, "damage", 9);
        next = write(next, enemy!.id, "detectionRange", 900);
        return link(next, quest!.id, enemy!.id, "讨伐");
      }),
    );
    expect(report.winnableBy).toBe(0);
    expect(report.findings.join(" ")).toContain("不等于没人能通");
    expect(report.diedFrom).toBeGreaterThan(0);
  });
});

describe('报告点得出的具体毛病', () => {
  it('玩家没有伤害来源时，直说"打倒"类条件满足不了', () => {
    const report = playtest(
      plan((doc) => {
        const [enemy] = entitiesOfKind(doc, "enemy");
        const [quest] = entitiesOfKind(doc, "quest");
        let next = write(doc, enemy!.id, "health", 20);
        next = write(next, enemy!.id, "speed", 0);
        return link(next, quest!.id, enemy!.id, "讨伐");
      }),
    );
    expect(report.findings.join(" ")).toContain("没有伤害来源");
  });

  it('站着不动也会死时，说的是"察觉半径或伤害太高"', () => {
    const report = playtest(
      plan((doc) => {
        const [player] = entitiesOfKind(doc, "player");
        const [enemy] = entitiesOfKind(doc, "enemy");
        let next = write(doc, player!.id, "health", 2);
        next = write(next, player!.id, "attackPower", 10);
        next = write(next, enemy!.id, "damage", 5);
        return write(next, enemy!.id, "detectionRange", 800);
      }),
    );
    const idle = report.runs.find((run) => run.policy === "idle")!;
    expect(idle.status).toBe("lost");
    expect(report.findings.join(" ")).toContain("站着不动就会死");
  });

  it('谁也奈何不了谁时只记"跑到时间上限"，不写成失败', () => {
    const report = playtest(
      plan((doc) => {
        const [player] = entitiesOfKind(doc, "player");
        const [enemy] = entitiesOfKind(doc, "enemy");
        let next = write(doc, player!.id, "health", 999);
        next = write(next, enemy!.id, "damage", 0);
        next = write(next, enemy!.id, "speed", 0);
        next = write(next, enemy!.id, "detectionRange", 900);
        // 任务引用的是一条对话：判不出完成条件，所以永远不会"通关"
        const dialogue = entitiesOfKind(next, "dialogue")[0]!;
        const quest = entitiesOfKind(next, "quest")[0]!;
        return link(next, quest.id, dialogue.id, "听完");
      }),
    );
    const idle = report.runs.find((run) => run.policy === "idle")!;
    expect(idle.status).toBe("playing");
    expect(idle.timedOut).toBe(true);
    expect(idle.outcome).toBe(null);
    expect(report.winnableBy).toBe(0);
  });

  it('跑不起来的设计（没有玩家）在报告第一行就说清，而不是给出四个空结果', () => {
    const report = playtest(
      plan((doc) => updateEntity(doc, entitiesOfKind(doc, "player")[0]!.id, { kind: "npc" })),
    );
    expect(report.findings[0]).toContain("跑不起来");
    expect(report.runs.every((run) => run.status === "lost")).toBe(true);
  });

  it('跑不起来而一条原因都没留下：那句要说"原因未列出"，不许留个冒号就完事', () => {
    // `playtest.ts:185` 的 `|| "原因未列出"` 在正常投影里走不到：`playable: Boolean(player)`
    // 与"没有玩家实体"那条 blocker 是同一个函数里前后 6 行写的（play.ts:327 / :433），同真同假。
    // 可达的那条路是**库内直接调用**：`playtest` 收的是一份计划，一份被改过的计划
    // （blockers 被清空）就是这个形状 ⇒ 只能反事实地喂，同第十七片那两支守卫的规矩。
    const noPlayer = plan((doc) => updateEntity(doc, entitiesOfKind(doc, "player")[0]!.id, { kind: "npc" }));
    const bare: GamePlan = { ...noPlayer, blockers: [] };
    expect(playtest(bare).findings[0]).toBe('这份设计跑不起来：原因未列出');
    // 正向对照：同一份计划把原因填回去，说的就是原因本身，不许换成那句兜底
    const spoken = playtest(noPlayer).findings[0];
    expect(spoken).toContain("没有玩家实体");
    expect(spoken).not.toContain("原因未列出");
  });
});

it('报告自带限度说明，界面不用另外解释', () => {
  const report = playtest(plan(winnable));
  expect(report.limits.join(" ")).toContain("不是穷举");
  expect(report.limits.join(" ")).toContain("定种子");
  expect(report.limits.join(" ")).toContain("不写成失败");
});

/** RPG 底稿：怪站着挨打（damage/speed 都是 0，走法差异只在谁去打），讨伐任务判得出条件 */
function fightDoc(name: string): GameDocument {
  const doc = createGame(name);
  const [player] = entitiesOfKind(doc, "player");
  const [enemy] = entitiesOfKind(doc, "enemy");
  const [quest] = entitiesOfKind(doc, "quest");
  let next = write(doc, player!.id, "attackPower", 10);
  next = write(next, player!.id, "health", 50);
  next = write(next, enemy!.id, "health", 10);
  next = write(next, enemy!.id, "damage", 0);
  next = write(next, enemy!.id, "speed", 0);
  return link(next, quest!.id, enemy!.id, "讨伐");
}

describe('RPG 管线的报告（成长语义参与判定）', () => {
  it('等级门没开时：底层 playtest 会宣布通关，playtestRpg 把它扣住——两份报告的分歧就是诚实的地方', () => {
    const doc = fightDoc("等级门");
    const [quest] = entitiesOfKind(doc, "quest");
    const rpg = compileRpg(write(doc, quest!.id, "requiredLevel", 99));
    const baseReport = playtest(rpg.base);
    const rpgReport = playtestRpg(rpg);
    // 底层不管门：打倒敌人就宣布赢——这份话在 RPG 页面上说出来就是谎（它没到 99 级）
    expect(baseReport.winnableBy).toBeGreaterThan(0);
    // RPG 管线把没到级的完成扣住 → 没有任何走法赢 → 全部跑到时间上限
    expect(rpgReport.winnableBy).toBe(0);
    expect(rpgReport.runs.every((run) => run.timedOut)).toBe(true);
    expect(rpgReport.findings.join(" ")).toContain("一次都没过门");
    expect(rpgReport.runs.every((run) => run.gatedPassed.length === 0)).toBe(true);
    expect(rpgReport.maxLevel).toBeGreaterThanOrEqual(1);
  });

  it('门开得了时：过了门的任务进 gatedPassed，"没过门"与"投影兜底"两条 finding 都不出现', () => {
    const doc = fightDoc("门开");
    const [quest] = entitiesOfKind(doc, "quest");
    const [enemy] = entitiesOfKind(doc, "enemy");
    let next = write(doc, quest!.id, "requiredLevel", 2);
    next = write(next, enemy!.id, "xpReward", 100);
    const report = playtestRpg(compileRpg(next));
    const beeline = report.runs.find((run) => run.policy === "beeline")!;
    expect(beeline.level).toBeGreaterThanOrEqual(2);
    expect(beeline.gatedPassed.length).toBeGreaterThan(0);
    expect(report.findings.join(" ")).not.toContain("一次都没过门");
    expect(report.findings.join(" ")).not.toContain("投影兜底");
  });

  it('敌人没写 xpReward：报告点名经验用了投影兜底；写了就没有这条', () => {
    const withoutXp = playtestRpg(compileRpg(fightDoc("兜底")));
    expect(withoutXp.findings.join(" ")).toContain("投影兜底");

    const doc = fightDoc("有数");
    const [enemy] = entitiesOfKind(doc, "enemy");
    const withXp = playtestRpg(compileRpg(write(doc, enemy!.id, "xpReward", 5)));
    expect(withXp.findings.join(" ")).not.toContain("投影兜底");
  });

  it('报告确定、限度齐：两次逐字段相同，限度里说得出 rpgStep 与投影曲线，基础三条还在', () => {
    const rpg = compileRpg(fightDoc("确定"));
    const first = playtestRpg(rpg);
    expect(playtestRpg(rpg)).toEqual(first);
    expect(first.runs.map((run) => run.policy)).toEqual(["idle", "beeline", "flee", "wander"]);
    expect(first.limits.join(" ")).toContain("rpgStep");
    expect(first.limits.join(" ")).toContain("投影常量");
    expect(first.limits.join(" ")).toContain("不是穷举");
  });
});

/** 只有对话的文档：模板那 11 个空实体会让名字混进断言 */
function emptyStory(name: string): GameDocument {
  let doc = createGame(name);
  for (const entity of [...doc.entities]) {
    doc = removeEntity(doc, entity.id);
  }
  return doc;
}

function talk(doc: GameDocument, name: string, notes = ""): { document: GameDocument; id: string } {
  const next = addEntity(doc, { kind: "dialogue", name, notes });
  const created = entitiesOfKind(next, "dialogue").find((entity) => entity.name === name)!;
  return { document: next, id: created.id };
}

describe('按类型派试玩（§52/§53 那条链上"只跑 RPG 管线"那一处的补上）', () => {
  /**
   * 判据是**读数来自哪条管线**：topdown 那条跑 `sim.step`，RPG 那条跑 `rpgStep`。
   * 同一份字节换一条管线，跑出来的每一条走法就多出 RPG 才有的那几格（等级 / 经验 / 等级门）
   * ——这既是"两条管线不是同一条"的证据，也是"读数不是自证自成"的对照。
   */
  const flat = createGame('分派用的那份');

  it('一份 2D 稿：读数就是 topdown 那条管线的读数（不是拿 RPG 的判据去试）', () => {
    const result = playtestByKind(flat);
    expect(result.kind).toBe('2d');
    expect(result.pipeline).toBe('topdown');
    expect(result.engine).toBe('sim.step');
    // 按 pipeline 收窄（三份报告形状不同）
    if (result.pipeline !== 'topdown') throw new Error(`这一型派错了管线：${result.pipeline}`);
    // 逐项与直接调 `playtest(compileGame(...))` 相等：这一格不许自己另算一套
    const direct = playtest(compileGame(flat));
    expect(result.report.winnableBy).toBe(direct.winnableBy);
    expect(result.report.diedFrom).toBe(direct.diedFrom);
    expect(result.report.seed).toBe(direct.seed);
    expect(result.report.findings).toEqual(direct.findings);
    expect(result.report.limits).toEqual(direct.limits);
    expect(result.report.runs.map((run) => run.status)).toEqual(direct.runs.map((run) => run.status));
    // 顶级那几格只有 RPG 才有：这一型没有等级这件事，塞一个 0 会被读成"最高 0 级"（§159）
    expect('maxLevel' in result).toBe(false);
  });

  it('同一份字节标成 RPG：读数就换成 RPG 那条管线的（正反两向对照）', () => {
    const rpg = { ...flat, kind: 'rpg-prototype' } as GameDocument;
    const result = playtestByKind(rpg);
    expect(result.kind).toBe('rpg-prototype');
    expect(result.pipeline).toBe('rpg');
    expect(result.engine).toBe('sim.step+rpg.step');
    // 按 pipeline 收窄（"最高等级"那一格只有 RPG 那个成员有）
    if (result.pipeline !== 'rpg') throw new Error(`这一型派错了管线：${result.pipeline}`);
    const direct = playtestRpg(compileRpg(rpg));
    expect(result.report.winnableBy).toBe(direct.winnableBy);
    expect(result.report.diedFrom).toBe(direct.diedFrom);
    expect(result.maxLevel).toBe(direct.maxLevel);
    // 反向对照：RPG 的每一条走法都带等级/经验/等级门，topdown 的不带 ⇒ 两条管线不是同一条
    expect('level' in result.report.runs[0]!).toBe(true);
    const topdown = playtestByKind(flat);
    if (topdown.pipeline !== 'topdown') throw new Error(`这一型派错了管线：${topdown.pipeline}`);
    expect('level' in topdown.report.runs[0]!).toBe(false);
  });

  it('对话那两种：走对话那条管线（可达几段 / 能停下几处），不是"几种走法通关"', () => {
    // 一份只有两段对话的设计：开场 → 推门（第二段没有出边 ⇒ 它是能停下的地方）
    let doc = createGame('一段对话');
    for (const entity of [...doc.entities]) doc = removeEntity(doc, entity.id);
    doc = addEntity(doc, { kind: 'dialogue', name: '开场', notes: '你站在门口。' });
    doc = addEntity(doc, { kind: 'dialogue', name: '推门', notes: '门开了。' });
    const from = entitiesOfKind(doc, 'dialogue').find((e) => e.name === '开场')!;
    const to = entitiesOfKind(doc, 'dialogue').find((e) => e.name === '推门')!;
    const linked = linkEntities(doc, from.id, to.id, '推门进去');
    if (linked.reason) throw new Error(`前置引用失败：${linked.reason}`);
    doc = linked.document;

    for (const kind of ['interactive-story', 'visual-novel'] as const) {
      const result = playtestByKind({ ...doc, kind } as GameDocument);
      expect(result.kind).toBe(kind);
      expect(result.pipeline).toBe('story');
      expect(result.engine).toBe('story.refs');
      if (result.pipeline !== 'story') throw new Error(`这一型派错了管线：${result.pipeline}`);
      // 对话那一份的报告**形状与别的型不同**：没有走法，只有可达数
      expect('runs' in result.report).toBe(false);
      expect(result.report.total).toBe(2);
      expect(result.report.reachable).toBe(2);
      expect(result.report.reachableEndings).toBe(1);
      expect(result.report.reachableEmptyText).toBe(0);
    }
  });

  it('表里那一型一旦没接管线：试玩直接拒绝，理由由那张表供给，不许交一份空报告', () => {
    // `playtest-by-kind.ts:93` 那句 throw 从没执行过——`GAME_KIND_STATUS` 今天八型全接上了管线，
    // 正常输入走不到它。这一格只能**反事实地喂**（与 codegen 那条披露用例同一个手法）：
    // 临时把 visual-novel 的管线改成 null，让"这一型没接"这件事真的成立一次。
    // 它钉的是将来：加一型而忘了接试玩时，这里要说"没接"，而不是给作者一份跑得完的空报告。
    const original = GAME_KIND_STATUS['visual-novel'];
    try {
      GAME_KIND_STATUS['visual-novel'] = { ...original, pipeline: null, note: '表里临时那句：这一型今天没有可跑的引擎。' };
      const doc = { ...flat, kind: 'visual-novel' } as GameDocument;
      expect(() => playtestByKind(doc)).toThrow(/今天还没有接上管线/);
      // 那句话的内容来自表，不是抄死的文案：改表里那句，拒绝里跟着换
      expect(() => playtestByKind(doc)).toThrow('表里临时那句：这一型今天没有可跑的引擎。');
      // 正向对照（表还被改着的同一次运行里）：别的型照旧派得出管线，红的不是"整个分派都崩了"
      expect(playtestByKind(flat).pipeline).toBe('topdown');
    } finally {
      GAME_KIND_STATUS['visual-novel'] = original;
    }
    // 表恢复后同一份输入照旧走对话那条管线——这条也顺带证明 try 里改的确实只是那一行
    const restored = playtestByKind({ ...flat, kind: 'visual-novel' } as GameDocument);
    expect(restored.pipeline).toBe('story');
    expect(GAME_KIND_STATUS['visual-novel']).toBe(original);
  });
});

describe('对话管线的可达性报告（§53 对着一段对话能确定回答的那部分）', () => {
  it('连不到的段落点名报出；把它连进图里就全部可达（正反两向）', () => {
    let doc = emptyStory("可达");
    const a = talk(doc, "开场", "你来了");
    doc = a.document;
    const b = talk(doc, "分支", "往哪走");
    doc = b.document;
    const c = talk(doc, "孤岛", "没人通向我");
    doc = c.document;
    doc = link(doc, a.id, b.id, "继续");

    const first = playtestStory(compileStory(doc));
    expect(first.startId).toBe(a.id);
    expect(first.reachable).toBe(2);
    expect(first.total).toBe(3);
    expect(first.unreachableNames).toEqual(["孤岛"]);
    expect(first.findings.join(" ")).toContain("播放器永远不会显示");

    // 反向对照：连进去之后就该一条都不剩——只报数不点名的实现两头都能过
    doc = link(doc, b.id, c.id, "再走");
    const second = playtestStory(compileStory(doc));
    expect(second.reachable).toBe(3);
    expect(second.unreachableNames).toEqual([]);
    expect(second.findings.join(" ")).toContain("全部可达");
    // 没有随机成分：同一份计划两次逐字段相同
    expect(playtestStory(compileStory(doc))).toEqual(second);
  });

  it('停点与空正文数出来：没有下一段的是停点；正文空的照实报数，限度讲清算的是连线', () => {
    let doc = emptyStory("停点");
    const a = talk(doc, "开场", "正文");
    doc = a.document;
    const b = talk(doc, "终点", "");
    doc = b.document;
    doc = link(doc, a.id, b.id, "结束");

    const report = playtestStory(compileStory(doc));
    expect(report.reachableEndings).toBe(1);
    expect(report.reachableEmptyText).toBe(1);
    expect(report.findings.join(" ")).toContain("能停下的段落 1 段");
    expect(report.findings.join(" ")).toContain("正文为空");
    expect(report.limits.join(" ")).toContain("连不连得到");
    expect(report.limits.join(" ")).toContain("成环不展开");
    expect(report.limits.join(" ")).toContain("没有随机成分");
  });

  it('成环的图：每段都有下一段就直说，不发明"死循环"这种判词', () => {
    let doc = emptyStory("环");
    const a = talk(doc, "甲", "…");
    doc = a.document;
    const b = talk(doc, "乙", "…");
    doc = b.document;
    doc = link(doc, a.id, b.id, "去乙");
    doc = link(doc, b.id, a.id, "回甲");

    const report = playtestStory(compileStory(doc));
    expect(report.reachable).toBe(2);
    expect(report.reachableEndings).toBe(0);
    expect(report.findings.join(" ")).toContain("每一段都有下一段");
  });

  it('一份对话都没有：跑不起来写在第一行，与其它管线同一句话', () => {
    const report = playtestStory(compileStory(emptyStory("空")));
    expect(report.findings[0]).toContain("跑不起来");
    expect(report.reachable).toBe(0);
  });

  it('对话那份也是：原因被清空就说"原因未列出"，不许留个冒号', () => {
    // 与 topdown 那条同一个臂的另一半（`playtest.ts:359`）：`compileStory` 在没有对话时
    // 是"blockers 推一条 + playable 设 false"一起写的（story.ts:89 / :97），所以正常投影同样走不到。
    const real = compileStory(emptyStory("空"));
    expect(real.blockers.length, "前提：真投影那份是带着原因的").toBeGreaterThan(0);
    const bare: StoryPlan = { ...real, blockers: [] };
    expect(playtestStory(bare).findings[0]).toBe('这份设计跑不起来：原因未列出');
    // 正向对照：同一份计划带着真 blockers，说的是那条原因
    expect(playtestStory(real).findings[0]).not.toContain("原因未列出");
  });

  it('起点那一段已经不在了：可达照实说 0，不崩、也不把每一段算成可达', () => {
    // `playtest.ts:347` 的 `?? []` 防的是"队列里这个 id 在段落表里找不到"。今天入队的只有两类：
    // `plan.startId`（后面那批都被 :348 的 `byId.has` 挡着）——所以可达的路是**改过的计划**：
    // startId 还指着一段已被删掉的对话。这正是"存档里的计划与段落对不上"那个形状。
    let doc = emptyStory("起点没了");
    const a = talk(doc, "开场", "站在这儿");
    doc = a.document;
    const b = talk(doc, "推门", "门开了");
    doc = b.document;
    doc = link(doc, a.id, b.id, "推门进去");
    const storyPlan = compileStory(doc);
    const orphan: StoryPlan = { ...storyPlan, startId: "这段已经被删了" };
    const report = playtestStory(orphan);
    expect(report.reachable, "起点找不到，凭什么还能走到别处").toBe(0);
    expect(report.total).toBe(2);
    expect(report.unreachableNames).toEqual(["开场", "推门"]);
    expect(report.findings.join(" ")).toContain("0/2 段从起点可达");
    // 正向对照：同一份计划把起点换回来，两段就都可达——红的不是"playtestStory 一律报 0"
    expect(playtestStory({ ...orphan, startId: a.id }).reachable).toBe(2);
  });

  it('两条路通向同一段、而它们又互相指着：每段只数一次，环不把自己绕死', () => {
    // `playtest.ts:345` 那句 `continue` 要的是"同一个 id 被排进队两次"。只有**起点同时指着环上的
    // 两段**才会出现：起点→甲、起点→乙、甲↔乙 ⇒ 处理乙时甲还没出队，于是甲被再排一次。
    // 既有那条"环"用例是甲↔乙而起点只指着其中一头，每个 id 只入队一遍，所以没走到这一格。
    let doc = emptyStory("两条路");
    const s = talk(doc, "起点", "…");
    doc = s.document;
    const a = talk(doc, "甲", "…");
    doc = a.document;
    const b = talk(doc, "乙", "…");
    doc = b.document;
    doc = link(doc, s.id, a.id, "去甲");
    doc = link(doc, s.id, b.id, "去乙");
    doc = link(doc, a.id, b.id, "找乙");
    doc = link(doc, b.id, a.id, "找甲");
    const reached = playtestStory(compileStory(doc));
    expect(reached.total).toBe(3);
    expect(reached.reachable, "绕回来那段被数了两次").toBe(3);
    expect(reached.unreachableNames).toEqual([]);
    // 反向对照：同一张图里加一座谁都到不了的孤岛，可达数就少一——
    // 钉住"这个数是沿连线走出来的"，不是把 total 抄了一遍
    const withIsland = talk(doc, "孤岛", "…");
    expect(playtestStory(compileStory(withIsland.document)).reachable).toBe(3);
    expect(playtestStory(compileStory(withIsland.document)).total).toBe(4);
  });

  it('连不到的段落有五个：点名前三个、剩下写成"等 5 段"，数目不许被截断偷走', () => {
    // `playtest.ts:363` 那个 `> 3` 的阈值上一片之前只有一臂走过（≤3 时那句空串）。
    // 截断是披露的一部分：句子里只点三个名字，但"一共几段连不到"必须说出来。
    let doc = emptyStory("五座孤岛");
    const s = talk(doc, "起点", "…");
    doc = s.document;
    for (const name of ["甲", "乙", "丙", "丁", "戊"]) doc = talk(doc, name, "…").document;
    const five = playtestStory(compileStory(doc));
    expect(five.unreachableNames).toEqual(["甲", "乙", "丙", "丁", "戊"]); // 数据里五个都在
    const line = five.findings.find((f) => f.includes("段从起点可达"))!;
    expect(line).toContain("「甲」、「乙」、「丙」");
    expect(line).toContain(" 等 5 段");
    expect(line, "句子里只该点前三个名字").not.toContain("「丁」");
    // 正向对照：三座孤岛时那句不带"等 N 段"——阈值被人挪动（>3 改成 ≥3 之类）就红在这里
    let threeDoc = emptyStory("三座孤岛");
    threeDoc = talk(threeDoc, "起点", "…").document;
    for (const name of ["甲", "乙", "丙"]) threeDoc = talk(threeDoc, name, "…").document;
    const three = playtestStory(compileStory(threeDoc));
    expect(three.findings.join(" ")).not.toContain("等 ");
    expect(three.findings.join(" ")).toContain("「甲」、「乙」、「丙」");
  });

  it('重复的那一段下面还压着没走的：跳过它继续走，而不是整个遍历到此为止', () => {
    // 上一条"两条路"已经把 `:345` 那句 `continue` 走过了，但**走过不等于钉住**：把它改成 `break`
    // 在那张图上读出完全一样的数（栈里只剩那个重复项，两者都正好结束）。要分开它，得让重复项
    // **下面还压着没处理过的段**：起点先排「还在队里」，再排「合流」，最后排「分岔」，而「分岔」又指回
    // 「合流」⇒ 队列变成 [还在队里, 合流₁, 合流₂]，后一个先出队被数过，前一个就是那句 `continue`
    // 的收件人，而「还在队里」还压在它下面等。`break` 会把这段永远漏掉，而覆盖率看不见这个差别。
    function queueShape(name: string, linkStartToPending: boolean): GameDocument {
      let d = emptyStory(name);
      const s = talk(d, "起点", "…");
      d = s.document;
      const p = talk(d, "还在队里", "…");
      d = p.document;
      const c = talk(d, "合流", "…");
      d = c.document;
      const f = talk(d, "分岔", "…");
      d = f.document;
      if (linkStartToPending) d = link(d, s.id, p.id, "先排它");
      d = link(d, s.id, c.id, "再排合流");
      d = link(d, s.id, f.id, "最后排分岔");
      return link(d, f.id, c.id, "也到合流");
    }
    const report = playtestStory(compileStory(queueShape("队底还有一段", true)));
    expect(report.total).toBe(4);
    expect(report.reachable, "重复项下面那段被 break 丢了").toBe(4);
    expect(report.unreachableNames).toEqual([]);
    // 反方向对照：把起点到「还在队里」那条线拆掉，同一个数就必须少一——
    // 钉住"这 4 是沿连线走出来的"，不是"函数把 total 抄了一遍"（那两种写法在这里分不开）
    const noPending = playtestStory(compileStory(queueShape("队底空着", false)));
    expect(noPending.reachable).toBe(3);
    expect(noPending.unreachableNames).toEqual(["还在队里"]);
  });
});
