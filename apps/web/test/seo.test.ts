import { describe, expect, it } from 'vitest';
import { createDocument, createNode, findPage, type AssetRef, type DesignDocument } from '@nexus/design-model';
import type { PublishedPage } from '../src/server/domain/publish';
import { buildPublishedSeo, jsonLdScript } from '../src/server/domain/seo';

/**
 * §166 SEO 的规则表。这一层不碰数据库也不碰 `next/headers`：
 * 输入是一份已解析的发布记录 + 一个 origin，输出是纯数据，所以"哪种可见性允许被收录"
 * 这种红线能在单测里钉死，而不是只能在浏览器里看一眼 head。
 */

const ORIGIN = 'https://nexus.example';
const COVER_ID = 'as_cover1';
const UNPAINTED_ID = 'as_unpaint';

interface Options {
  visibility?: 'public' | 'unlisted';
  description?: string | null;
  projectName?: string;
  ownerHandle?: string | null;
  /** 往活动页塞一张真的画到的图片 */
  paintedCover?: boolean;
  /** manifest 里有一张图但没画到任何节点 */
  unpaintedOnly?: boolean;
  emptyPage?: boolean;
}

function fixture(over: Options = {}): PublishedPage {
  const document = createDocument(over.projectName ?? '深夜便利店', 'website') as DesignDocument;
  const page = findPage(document, document.activePageId) ?? document.pages[0]!;
  const root = page.nodes[page.rootId]!;

  if (!over.emptyPage) {
    for (const text of ['城市最晚熄灯的角落', '24 小时亮着一盏暖黄的光']) {
      const node = createNode({ type: 'text', name: text, text, parentId: root.id });
      page.nodes[node.id] = node;
      root.children.push(node.id);
    }
  }
  const asset = (id: string, kind: AssetRef['kind']): AssetRef => ({
    id,
    name: `${id}.png`,
    kind,
    storageKey: `projects/x/${id}`,
    mimeType: 'image/png',
    width: 1200,
    height: 630,
    createdAt: '2026-09-01T00:00:00.000Z',
  });
  document.assets = [asset(UNPAINTED_ID, 'image')];
  if (over.paintedCover) {
    document.assets = [asset(COVER_ID, 'image'), ...document.assets];
    const cover = createNode({ type: 'image', name: 'Cover', parentId: root.id });
    cover.style.fills = [{ kind: 'image', assetId: COVER_ID }];
    page.nodes[cover.id] = cover;
    root.children.push(cover.id);
  }
  if (over.unpaintedOnly) document.assets = [asset(UNPAINTED_ID, 'image')];

  if (over.emptyPage) document.pages = [];

  return {
    publication: {
      id: 'pub_1',
      projectId: 'prj_1',
      path: '/n/handle1/deep-night-store',
      visibility: over.visibility ?? 'public',
      version: 3,
      moderation: 'pending',
      snapshotId: 'snp_1',
      hasGame: false,
      views: 12,
      publishedAt: '2026-09-20T02:03:04.000Z',
    },
    document,
    ownerName: '阿岚',
    ownerHandle: over.ownerHandle === undefined ? 'handle1' : over.ownerHandle,
    projectName: over.projectName ?? '深夜便利店',
    description: over.description === undefined ? '一间便利店的视觉散文' : over.description,
    gameDocument: null,
  };
}

const robotsIndex = (metadata: ReturnType<typeof buildPublishedSeo>['metadata']) =>
  (metadata.robots as { index?: boolean } | undefined)?.index;

/** openGraph.images 在 Next 的类型里允许"单个对象或数组"，我们只发数组，取值时收一下 */
const ogImages = (metadata: ReturnType<typeof buildPublishedSeo>['metadata']) =>
  Array.isArray(metadata.openGraph?.images)
    ? (metadata.openGraph?.images as { url: string; width?: number; height?: number }[])
    : undefined;

describe('公开页的 SEO 投影（§166）', () => {
  it('public 允许收录，unlisted 一律 noindex', () => {
    expect(robotsIndex(buildPublishedSeo(fixture(), ORIGIN).metadata)).toBe(true);
    expect(robotsIndex(buildPublishedSeo(fixture({ visibility: 'unlisted' }), ORIGIN).metadata)).toBe(false);
  });

  it('canonical / og:url / og:image 只在拿得出绝对地址时才写，不编 localhost', () => {
    const withOrigin = buildPublishedSeo(fixture({ paintedCover: true }), ORIGIN);
    expect(withOrigin.metadata.alternates?.canonical).toBe(`${ORIGIN}/n/handle1/deep-night-store`);
    expect(withOrigin.metadata.openGraph?.url).toBe(`${ORIGIN}/n/handle1/deep-night-store`);
    expect(ogImages(withOrigin.metadata)?.[0]).toMatchObject({
      // 与公共图片路由同一个地址（§57）：这条 URL 爬虫点开必须拿得到字节
      url: `${ORIGIN}/api/public/handle1/assets/${COVER_ID}`,
      width: 1200,
      height: 630,
    });

    const withoutOrigin = buildPublishedSeo(fixture({ paintedCover: true }), null);
    expect(withoutOrigin.metadata.alternates?.canonical).toBeUndefined();
    expect(withoutOrigin.metadata.openGraph?.url).toBeUndefined();
    expect(withoutOrigin.metadata.openGraph?.images).toBeUndefined();
    expect(withoutOrigin.omitted.join('')).toContain('没有可用的对外 origin');
    // 相对地址一律不出现：宁缺毋滥，坏 URL 会被索引成死链
    expect(JSON.stringify(withoutOrigin.metadata)).not.toContain('/api/public/');
  });

  it('封面只认"这一版真的画到的位图"：manifest 里躺着没画的不算，SVG 也不算', () => {
    const painted = buildPublishedSeo(fixture({ paintedCover: true }), ORIGIN);
    expect(ogImages(painted.metadata)?.[0]?.url).toContain(COVER_ID);

    const manifestOnly = buildPublishedSeo(fixture({ unpaintedOnly: true }), ORIGIN);
    expect(manifestOnly.metadata.openGraph?.images).toBeUndefined();
    expect(manifestOnly.omitted.join('')).toContain('不放占位图');

    // 画到的是 svg：抓取端普遍取不到，不冒充封面
    const svgOnly = fixture({ paintedCover: true });
    svgOnly.document.assets = [{ ...svgOnly.document.assets[0]!, kind: 'svg' }];
    expect(buildPublishedSeo(svgOnly, ORIGIN).metadata.openGraph?.images).toBeUndefined();
  });

  it('作者没有 handle 时不产出公共图片地址（那条路由按 handle 认人）', () => {
    const seo = buildPublishedSeo(fixture({ paintedCover: true, ownerHandle: null }), ORIGIN);
    expect(seo.metadata.openGraph?.images).toBeUndefined();
    expect(seo.omitted.join('')).toContain('没有 handle');
  });

  it('描述三级来源：作者写的 → 这一版自己的文字 → 陈述事实的兜底句', () => {
    expect(buildPublishedSeo(fixture(), ORIGIN).metadata.description).toBe('一间便利店的视觉散文');

    const derived = buildPublishedSeo(fixture({ description: null }), ORIGIN).metadata.description ?? '';
    // 从模型的文字里取，而不是编一句营销话术（§16）
    expect(derived).toContain('城市最晚熄灯的角落');
    expect(derived).toContain('24 小时亮着一盏暖黄的光');

    const fallback = buildPublishedSeo(fixture({ description: null, emptyPage: true }), ORIGIN).metadata.description ?? '';
    expect(fallback).toContain('第 3 版公开快照');
  });

  it('摘要按字号挑句子：按钮文案不进来，标题排在页脚品牌之前', () => {
    const found = fixture({ description: null });
    const page = findPage(found.document, found.document.activePageId)!;
    const root = page.nodes[page.rootId]!;
    // 起手模板自带一批带字号的文字；这条要测的是排序规则，先把页面清成白板
    root.children = [];
    page.nodes = { [root.id]: root };
    const sized: [string, number][] = [
      ['NEXUS STUDIO 出品', 11],
      ['深夜的便利店与一盏灯', 64],
      ['现在就开始你的设计之旅', 14],
      ['开始设计吧', 100],
    ];
    for (const [text, size] of sized) {
      const node = createNode({ type: 'text', name: text, text, parentId: root.id });
      // 只关心字号排序，其余字段给一套合法默认值即可
      node.typography = {
        fontFamily: 'sans',
        fontSize: size,
        fontWeight: 400,
        lineHeight: 'auto',
        letterSpacing: 0,
        align: 'left',
        verticalAlign: 'top',
      };
      page.nodes[node.id] = node;
      root.children.push(node.id);
    }
    const description = buildPublishedSeo(found, ORIGIN).metadata.description ?? '';
    // 字大的先来，不管它在页面里排第几；整页文档顺序是 brand → cta → headline
    expect(description).toBe('深夜的便利店与一盏灯 现在就开始你的设计之旅 NEXUS STUDIO 出品');
    // 字号最大也不行：五个字的按钮文案不算"这一页在讲什么"
    expect(description).not.toContain('开始设计吧');
  });

  it('JSON-LD 只写我们真有的字段，发布时间就是这一版的发布时刻', () => {
    const data = JSON.parse(buildPublishedSeo(fixture({ paintedCover: true }), ORIGIN).jsonLd) as Record<string, unknown>;
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: '深夜便利店',
      url: `${ORIGIN}/n/handle1/deep-night-store`,
      datePublished: '2026-09-20T02:03:04.000Z',
      author: { '@type': 'Person', name: '阿岚', url: `${ORIGIN}/u/handle1` },
      publisher: { '@type': 'Organization', name: 'NEXUS' },
    });
    // 没有跑过的评分、没有编出来的标签词，也没有"约多少字"这类估数
    expect(Object.keys(data).some((key) => /aggregateRating|keywords|wordCount/i.test(key))).toBe(false);
  });

  it('项目名里写 </script> 闭不掉脚本块，转义后还能原样读回来', () => {
    const evil = '</script><img src=x onerror=alert(1)>';
    const seo = buildPublishedSeo(fixture({ projectName: evil, description: evil }), ORIGIN);
    expect(seo.jsonLd).not.toContain('</script');
    // 整个脚本块里没有裸尖括号：`<` `>` 只以 \u003c / \u003e 的形式出现
    expect(seo.jsonLd).not.toMatch(/[<>]/);
    expect(seo.jsonLd).toContain('\\u003c');
    const data = JSON.parse(seo.jsonLd) as { name: string; description: string };
    // 转义是无损的：抓取端解析回来的还是作者写的那个名字
    expect(data.name).toBe(evil);
    expect(data.description).toBe(evil);
  });

  it('clean() 压掉控制字符并截断，head 里不会出现换行拼出来的假标签', () => {
    const messy = fixture({ projectName: '标题\n<img>', description: '一段\n\t描述' });
    const metadata = buildPublishedSeo(messy, ORIGIN).metadata;
    expect(metadata.title).toBe('标题 <img> · 阿岚');
    expect(metadata.description).toBe('一段 描述');
    const long = buildPublishedSeo(fixture({ description: '很'.repeat(400) }), ORIGIN).metadata.description ?? '';
    expect([...long].length).toBeLessThanOrEqual(200);
    expect(long.endsWith('…')).toBe(true);
  });

  it('jsonLdScript 连 U+2028 也转义（它在 JSON 里是普通字符，在脚本块里却是行终止符）', () => {
    const text = `a${String.fromCharCode(0x2028)}b`;
    const out = jsonLdScript({ text });
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect((JSON.parse(out) as { text: string }).text).toBe(text);
  });
});
