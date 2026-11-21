import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BIBLE_MARGINS } from '@/world-bible/margins.generated';

/**
 * §BIBLE-MARGINS · 页边批注模块契约（2026-11-22 新模块）
 *
 * 判据只有三条，都是这个模块唯一承诺的事：
 *  1. 页边逐字来自正典文件（生成器读的就是它，比对字节）；
 *  2. 中英成对、数量一致；
 *  3. 每条都指向一个**真实存在**的回响网页 slug（ECHO_WEB_SLUGS 同源，不指向 404）。
 */
const ROOT = process.cwd();

describe('§BIBLE-MARGINS 页边批注', () => {
  it('每一条页边都能在正典文件里逐字找到', () => {
    for (const row of BIBLE_MARGINS) {
      const zhFile = join(ROOT, 'docs/world-bible/echoes', `${row.echo}.md`);
      const enFile = join(ROOT, 'docs/world-bible/echoes', `${row.echo}.en.md`);
      expect(readFileSync(zhFile, 'utf8')).toContain(`> 页边：${row.zh}`);
      expect(readFileSync(enFile, 'utf8')).toContain(`> Margin: ${row.en}`);
    }
  });

  it('中英成对，且 slug 指向真实登记的回响', () => {
    const snapshot = readFileSync(join(ROOT, 'scripts/gen-bible-snapshot.mts'), 'utf8');
    for (const row of BIBLE_MARGINS) {
      expect(row.zh.length).toBeGreaterThan(0);
      expect(row.en.length).toBeGreaterThan(0);
      const slug = row.slug.replace('/bible/', '');
      expect(snapshot).toContain(`'${slug}'`);
    }
  });

  it('生成文件里的每一行都逐字来自这份数据（没有手改过的痕迹）', () => {
    const generated = readFileSync(
      join(ROOT, 'apps/web/src/world-bible/margins.generated.ts'),
      'utf8',
    );
    // 生成器写出的就是这份数据（缩进与键序一致）；有人手改过就对不上。
    expect(generated).toContain(JSON.stringify(BIBLE_MARGINS, null, 2));
  });
});
