import { describe, expect, it } from "vitest";
import {
  addEntity,
  compileGame,
  compileRpg,
  compileStory,
  createGame,
  entitiesOfKind,
  linkEntities,
  playtest,
  playtestRpg,
  playtestStory,
  removeEntity,
  runPolicy,
  setStat,
  updateEntity,
  type GameDocument,
  type GamePlan,
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
});
