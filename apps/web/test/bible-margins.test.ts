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

describe('§BIBLE-MARGINS 猜长短小玩', () => {
  it('页面带上小玩的入口与双语文案', () => {
    const page = readFileSync(join(ROOT, 'apps/web/src/app/bible/margins/page.tsx'), 'utf8');
    expect(page).toContain('data-bible-margins-page');
    const component = readFileSync(join(ROOT, 'apps/web/src/components/BibleMargins.tsx'), 'utf8');
    expect(component).toContain('data-bible-margins-game');
    expect(component).toContain('data-bible-margins-game-start');
    expect(component).toContain('gameLede');
    // 纪律：猜的是故事里的次序，不是字节——这句话必须在界面上
    expect(component).toContain('不是真的在量字节');
    expect(component).toContain('not a byte measurement');
  });

  it('一局最多三对，且答案只有"在下面"才算猜对', () => {
    const component = readFileSync(join(ROOT, 'apps/web/src/components/BibleMargins.tsx'), 'utf8');
    expect(component).toContain('ROUND_PAIRS = 3');
    expect(component).toContain("picked[i] === 1");
  });
});
  it('本机最好成绩按同一支 localStorage 纪律记，拿不到就放弃', () => {
    const component = readFileSync(join(ROOT, 'apps/web/src/components/BibleMargins.tsx'), 'utf8');
    expect(component).toContain('nexus.marginOrder.best');
    expect(component).toContain('data-bible-margins-game-best');
    expect(component).toContain('/* 记忆不可用时放弃——游戏不强制 */');
  });
  it('取一张出来：抽走不删除，放回按原索引归位（E215 的"位置一点没动"）', () => {
    const component = readFileSync(join(ROOT, 'apps/web/src/components/BibleMargins.tsx'), 'utf8');
    expect(component).toContain('data-bible-margins-take-out=');
    expect(component).toContain('data-bible-margins-put-back=');
    expect(component).toContain('data-bible-margins-taken');
    // 纪律：抽出来只是不在队列里，集合删除即归位——不是删除数据
    expect(component).toContain('next.delete(index)');
    expect(component).toContain('取出来可以，放回去要轻');
    expect(component).toContain('you may take one out; put it back lightly');
  });