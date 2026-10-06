import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS, NOTIFICATION_TERMINAL_STATE, type NotificationKind } from '@/lib/notify-plan';

/**
 * §164 的生产者普查：登记的每一类通知，都必须有一个**真能走到收件箱**的构造点。
 *
 * 为什么要有这一条：`NotificationKind` 是十类，`NOTIFICATION_KINDS` 那张 Record 保证"加一类忘了登记"
 * 会在 typecheck 就红，但它**不保证这一类有人 produce**。今天界面上那句
 * "四类各自的真终态：……"（`app/notifications/page.tsx`）就是手写清单走样的样子——
 * 它只点了 5 组名字，另外 3 类有生产者却没被写上去。手写的名单会漂，所以这里改成从树上现算：
 * 每一类各自的构造点由这一条管，页面怎么写是另一片的事（见任务 #94）。
 *
 * 判据必须带 reach，光看字面会算错：第一版只要求同一个文件里出现 `kind: 'like'`，
 * 于是 `server/domain/social.ts` 也被算成点赞的生产者——那个文件里 `emit` 一次都没出现过，
 * 它写的是互动表本身，不是通知。照着那一版提交，就会得到一张"十类都有生产者"的假名单，
 * 而其中几类其实只是把 `kind` 当别处的字段写。所以这里要求**同一个文件既构造该 kind、又走得到 `emit`**。
 *
 * `emit` 只被 `server/domain/notifications.ts` 导出去规划一次（`planNotification` 的唯一调用方），
 * 这条也顺手钉住：如果出现第二个规划入口，"生产者"这个词就没有确定含义了。
 */

const SRC_DIR = join(import.meta.dirname, '..', 'src');

/** `apps/web/src` 下所有 .ts/.tsx；notify-plan.ts 自己不算生产者（它就是那张登记表） */
function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(full)) continue;
      if (full.endsWith(`notify-plan.ts`)) continue;
      out.push({ path: full.slice(SRC_DIR.length).replaceAll('\\', '/'), text: readFileSync(full, 'utf8') });
    }
  };
  walk(SRC_DIR);
  return out;
}

/** 这个文件既构造 `kind`，又走得到 `emit`（直接调用或从 notifications 域 import） */
function producersFor(files: { path: string; text: string }[], kind: string): string[] {
  return files
    .filter(({ text }) => text.includes(`kind: '${kind}'`))
    .filter(({ text }) => /\bemit\s*\(/.test(text) || /import\s*\{[^}]*\bemit\b[^}]*\}/.test(text))
    .map(({ path }) => path);
}

const KINDS = Object.keys(NOTIFICATION_KINDS) as NotificationKind[];

describe('结构门：§164 每一类通知都要有走得通的生产者', () => {
  it('扫到的源文件不是空集（空集会让下面那条绿成"什么都没找到也算通过"）', () => {
    expect(KINDS.length, 'NOTIFICATION_KINDS 是空的，下面那条在比空集').toBeGreaterThanOrEqual(10);
    expect(sources().length, `${SRC_DIR} 下一个源文件都没读到`).toBeGreaterThanOrEqual(100);
  });

  it('登记的每一类都有至少一个构造点走得到 emit', () => {
    const files = sources();
    const missing: string[] = [];
    const seen: Record<string, string[]> = {};
    for (const kind of KINDS) {
      const hits = producersFor(files, kind);
      seen[kind] = hits;
      if (hits.length === 0) missing.push(kind);
    }
    // 把找到的地方一起报出来：将来某一类红了，要能立刻看出是"没生产者"还是"生产者改了名"
    expect(missing, `这些 kind 没有走得通的生产者（找到的构造点：${JSON.stringify(seen)}）`).toEqual([]);
  });

  it('planNotification 只有一个调用方（"生产者"这个词才有确定含义）', () => {
    const callers = sources()
      .filter(({ text }) => /planNotification\s*\(/.test(text))
      .map(({ path }) => path);
    expect(callers, `planNotification 的调用方应当只有收件箱那一个写入方`).toEqual([
      '/server/domain/notifications.ts',
    ]);
  });

  it('每一类都有一句真终态，而收件箱页那一列是从这张表印出来的（不再是手写名单）', () => {
    const tableKeys = Object.keys(NOTIFICATION_TERMINAL_STATE).sort();
    expect(tableKeys.length, '终态表是空的，下面那条比的就是两个空集').toBeGreaterThanOrEqual(10);
    expect(
      tableKeys,
      '终态表与注册表的键必须一模一样：少一类=页面漏一类，多一类=表里挂着个不存在的类',
    ).toEqual([...KINDS].sort());
    for (const kind of KINDS) {
      expect(
        NOTIFICATION_TERMINAL_STATE[kind].trim().length,
        `${kind} 那一格是空的（有键没话，页面就印一句空话）`,
      ).toBeGreaterThan(10);
    }
    const pageSrc = readFileSync(join(SRC_DIR, 'app', 'notifications', 'page.tsx'), 'utf8');
    // 页面必须现算这张表：类数从注册表来，话从终态表来
    expect(pageSrc).toMatch(/Object\.keys\(NOTIFICATION_KINDS\)/);
    expect(pageSrc).toMatch(/NOTIFICATION_TERMINAL_STATE\s*\[/);
    // 手写清单回来的两种样子：又写了一份 `const NOTIFIED = [...]`，或把类数写成字面量"四类"
    expect(pageSrc, '页面里又出现了一份手写的通知清单').not.toMatch(/const NOTIFIED\b/);
    expect(pageSrc, '页面把类数写成了字面量，下一类加进来它就又是谎').not.toMatch(/四类/);
  });
});
