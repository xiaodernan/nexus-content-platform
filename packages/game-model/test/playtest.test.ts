import { describe, expect, it } from "vitest";
import {
  compileGame,
  createGame,
  entitiesOfKind,
  linkEntities,
  playtest,
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
