import { crc32 as zlibCrc32 } from 'node:zlib';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createProject, loadDocument, saveDocument } from '../../apps/web/src/server/domain/projects';
import { buildProjectExport } from '../../apps/web/src/server/domain/export';
import { importProjectZip } from '../../apps/web/src/server/domain/import';
import { readZip, readZipText } from '../../apps/web/src/lib/zip-read';
import { getDb } from '../../apps/web/src/server/db/client';
import { projects, users } from '../../apps/web/src/server/db/schema';
import type { DesignDocument } from '@nexus/design-model';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §144 / ADR-0024 · 导出→导入往返评测——"不被自己仓库锁死"是平台级承诺，这条钉的是它：
 * 真项目 → 真 ZIP → **Node 内置 `zlib.crc32` 独立校验清单**（不复用本仓 lib/zip 的实现，
 * 两个实现互证）→ 真 `importProjectZip` 导回 → 结构不变式对账。
 *
 * 与 `apps/web/test/export.integration.test.ts` 的分工：那边证明**存在性**
 * （导得出、清单格式、.nexus/ 条目），这边量**保真**（逐字节 CRC、import → re-export 计数
 * 逐一对得上）——同一件事的两个侧面，别把这条读成对那条的重复。
 *
 * 需要真库（建一次性的 throwaway 用户 + 项目，finally 里删掉）。跑法：
 *   NEXUS_DATABASE_URL=postgres://nexus:nexus_dev_only@localhost:55100/nexus npm run evals
 * 不设则 `npm run evals` 打印 SKIP 并不影响其余套件的退出码。
 */

interface RoundtripOutcome {
  files: number;
  bytes: number;
  crcVerified: number;
  codeFiles: number;
}

/** 稳定 JSON（递归键排序）——结构相同且 key order 无关的深度相等性比较（JSONB 比较对象而非字节） */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export const exportRoundtripSuite: EvalSuite = {
  name: 'export-roundtrip',
  dimension: '代码正确性 / 导出保真（§144 · ADR-0024）',
  needsDatabase: true,

  async run() {
    const rec = new EvalRecorder();
    console.log('\n== 导出↔导入往返（§144）· 真库 + 真 ZIP + node zlib 交叉 CRC ==');

    const db = getDb();
    await db.execute(rawSql`select 1 as ok`);

    const [user] = await db
      .insert(users)
      .values({ displayName: 'Eval Export', email: `eval-export+${Date.now().toString(36)}@nexus.test` })
      .returning({ id: users.id });
    if (!user) throw new Error('建不了一次性评测用户');

    const projectIds: string[] = [];
    try {
      // ---------------------------------------------------- 三个载体（同一构建、同名）
      const cases: Array<{ label: string; mutate?: (document: DesignDocument) => void }> = [
        { label: '纯 starter' },
        {
          label: 'tablet 档 mode=none marker（§14 / ADR-0091）',
          mutate(doc) {
            const hero = Object.values(doc.pages[0]!.nodes).find((n) => n.name === 'Hero');
            if (!hero) throw new Error('起手页里没有 Hero');
            hero.responsive = [{ breakpoint: 'tablet', patch: { layout: { mode: 'none' } } }];
          },
        },
      ];

      const outcomes: RoundtripOutcome[] = [];
      for (const cell of cases) {
        const doc = await createProject(user.id, { name: `eval-export ${cell.label}`, kind: 'website' });
        projectIds.push(doc.id);
        const loaded = await loadDocument(doc.id);
        if (!loaded) throw new Error('新建项目读不回来');
        if (cell.mutate) cell.mutate(loaded);
        await saveDocument(doc.id, loaded);
        const exported = await buildProjectExport(doc.id, user.id, ['design', 'code']);
        if (!exported) { rec.check(`格「${cell.label}」· 导出非空`, false, 'buildProjectExport 返回空'); continue; }

        const zip = readZip(exported.bytes).filter((e) => !e.directory);
        const byPath = new Map(zip.map((e) => [e.path, e]));
        const manifestText = readZipText(zip, '.nexus/manifest.json');
        if (!manifestText) {
          rec.check(`格「${cell.label}」· 清单存在`, false, '缺 .nexus/manifest.json');
          continue;
        }
        const manifest = JSON.parse(manifestText) as {
          formatVersion: number;
          project: { name: string };
          parts: string[];
          entries: Array<{ path: string; bytes: number; crc32: string }>;
        };

        rec.structural(`格「${cell.label}」· formatVersion == 4`, manifest.formatVersion === 4, manifest.formatVersion);
        rec.structural(
          `格「${cell.label}」· 清单里每个条目都在 ZIP 里`,
          manifest.entries.length > 0 && manifest.entries.every((entry) => byPath.has(entry.path)),
          `${manifest.entries.length} 个条目`,
        );

        // 独立交叉校验：Node 内置 zlib.crc32 重算每个条目，不相信本仓 CRC 实现
        let crcVerified = 0;
        let crcMismatches = 0;
        for (const entry of manifest.entries) {
          const file = byPath.get(entry.path);
          if (!file) continue;
          const recomputed = zlibCrc32(file.contents).toString(16).toUpperCase().padStart(8, '0');
          if (recomputed === entry.crc32 && file.contents.length === entry.bytes) {
            crcVerified += 1;
          } else {
            crcMismatches += 1;
            console.log(`    CRC/bytes 不匹配 ${entry.path}: manifest=${entry.crc32}/${entry.bytes} actual=${recomputed}/${file.contents.length}`);
          }
        }
        rec.structural(`格「${cell.label}」· 清单 CRC 全对（node zlib 交叉）`, crcMismatches === 0, `${crcVerified}/${manifest.entries.length}`);

        // -------------------------------------------------- 导回来，再对一遍结构
        const imported = await importProjectZip(user.id, exported.bytes);
        if (!imported.ok) {
          rec.check(`格「${cell.label}」· 导回成功`, false, `${imported.reason} / ${(imported.issues ?? []).join('；')}`);
          continue;
        }
        projectIds.push(imported.projectId);
        rec.check(`格「${cell.label}」· 导回成功且 counts.design == 1`, imported.counts.design === 1, JSON.stringify(imported.counts));

        const back = await loadDocument(imported.projectId);
        if (!back) { rec.check(`格「${cell.label}」· 导回的文档读回来了`, false, 'loadDocument 空'); continue; }

        rec.structural(
          `格「${cell.label}」· 页数对账`,
          back.pages.length === loaded.pages.length,
          `${back.pages.length} vs ${loaded.pages.length}`,
        );
        const typeCount = (d: typeof loaded) => {
          const counts = new Map<string, number>();
          for (const page of d.pages) for (const node of Object.values(page.nodes)) counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
          return [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
        };
        rec.check('格' + `「${cell.label}」· 节点类型多重集对账`, JSON.stringify(typeCount(back)) === JSON.stringify(typeCount(loaded)), 'multiset of node.type');
        rec.structural(
          `格「${cell.label}」· token 数对账`,
          back.tokens.length === loaded.tokens.length,
          `${back.tokens.length} vs ${loaded.tokens.length}`,
        );

        if (cell.mutate) {
          const heroBack = Object.values(back.pages[0]!.nodes).find((n) => n.name === 'Hero');
          rec.check(
            `格「${cell.label}」· responsive 规则随 ZIP 走回`,
            stableJson(heroBack?.responsive) === stableJson([{ breakpoint: 'tablet', patch: { layout: { mode: 'none' } } }]),
            JSON.stringify(heroBack?.responsive),
          );
        }

        // -------------------------------------------------- 再导一次，计数必须一致
        const reexported = await buildProjectExport(imported.projectId, user.id, ['design', 'code']);
        if (!reexported) { rec.check(`格「${cell.label}」· 二次导出非空`, false, ''); continue; }
        rec.structural(
          `格「${cell.label}」· 二次导出 code 文件数 == 第一次`,
          reexported.counts.code === exported.counts.code,
          `${reexported.counts.code} vs ${exported.counts.code}`,
        );

        outcomes.push({ files: zip.length, bytes: exported.bytes.length, crcVerified, codeFiles: exported.counts.code });
      }

      console.log('\n  载体 | 文件 | 字节 | CRC 交叉校验 | code 文件数');
      for (const o of outcomes) console.log(`  - | ${o.files} | ${o.bytes} | ${o.crcVerified} | ${o.codeFiles}`);

      rec.skip('逐字节复现（README 带生成时间，刻意不——见 apps/web/test/export.integration.test.ts 同口径）');
      rec.skip('413 那一格（要一份真 >128MB 的包，本机内存不够，docs/EVALUATION.md 记着）');
      rec.skip('video / image 半边的往返（需要 provider key 产物；这里只打代码+设计文档）');
      rec.skip('真 provider 下补丁的往返（deterministic DEMO provider 读数见 scripts/eval-baseline.mts）');

      return { checks: rec.checks, notMeasured: rec.notMeasured };
    } finally {
      await db.delete(projects).where(inArray(projects.id, projectIds.length ? projectIds : ['none']));
      await db.delete(users).where(eq(users.id, user.id));
    }
  },
};
