import type { Metadata } from 'next';
import type { DesignDocument } from '@nexus/design-model';
import { absoluteUrl } from '@/lib/origin';
import { publicAssetUrl } from '@/studio/assets';
import { documentReferencesAsset } from './assets';
import type { PublishedPage } from './publish';

/**
 * §166 SEO：公开作品的 head 标签与 JSON-LD。
 *
 * 这个模块**不做数据库读取**，也不碰 `next/headers`：输入是已经解析好的发布记录
 * （`resolvePublishedPath` 的产物）+ 一个 origin，输出是纯数据。
 * 于是这些规则能直接打单测——"哪种可见性该被爬虫看到"是产品红线，
 * 不该只能在浏览器里看一眼 head 才确认。
 *
 * 三条塑造写法的判断：
 * - **unlisted 不进索引**：它的语义是"只认精确链接"，被搜索引擎收录等于换一种方式公开。
 *   private 与被人工驳回的在这一步之前就已经 404（`resolvePublishedPath`），轮不到标签。
 * - **绝对 URL 只能来自 origin**（见 `lib/origin.ts`）。origin 拿不到时**整条省略**，
 *   不写 `http://localhost:3100/...` 冒充线上地址，也不写一个假的 `og:image` 占位图（§159）。
 * - **og:image 只认这一版快照真的画到的图片资产**：判定复用 `documentReferencesAsset`，
 *   与公共图片路由 `/api/public/<handle>/assets/<id>` 同一个口径。
 *   用两个不同谓词，迟早产出一张爬虫取到 404 的封面图。
 */

export const SITE_NAME = 'NEXUS';

/** head 里出现的用户输入：压掉控制字符与换行，长度截一下（og 字段各家抓取端也会截） */
function clean(value: string, max = 300): string {
  const flat = value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * 塞进 `<script type="application/ld+json">` 的字符串。
 * `dangerouslySetInnerHTML` 不做任何转义，而项目名是用户输入——
 * 一个叫 `</script><script>alert(1)</script>` 的作品就能在公开页里注入脚本，
 * 所以 `<` `>` `&` 与 U+2028/29 一律转成 JSON 转义序列（语义不变，脚本块提前闭合不再可能）。
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(
    /[<>&\p{Line_Separator}\p{Paragraph_Separator}]/gu,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/**
 * 没有项目描述时，从这一版快照自己的文字里取一句。
 * §16 模型是唯一真值：页面上写着什么，摘要就是什么——不另编一句营销话术，
 * 也不留空（留空等于把 `og:description` 交给抓取端自己瞎猜）。
 *
 * 两条从真实渲染结果里捞出来的规则：
 * - 短于 6 个字符的丢掉：那些是按钮和导航标签（"开始设计""查看文档"），不是这一页在讲什么；
 * - 字号大的排前面：标题与正文先进摘要，页脚品牌名（字号最小）留在最后。
 *   字号是 token 引用时读不出数（按 0 处理），排序退回文档顺序。
 */
function textSummary(document: DesignDocument, budget = 180): string {
  const candidates: { text: string; size: number }[] = [];
  for (const page of document.pages) {
    for (const node of Object.values(page.nodes)) {
      const text = typeof node.text === 'string' ? node.text.trim() : '';
      if (text.length < 6) continue;
      const size = node.typography?.fontSize;
      candidates.push({ text, size: typeof size === 'number' ? size : 0 });
    }
  }
  // Array#sort 稳定：字号相同的节点保持它们在页面里的先后
  candidates.sort((a, b) => b.size - a.size);
  const parts: string[] = [];
  let used = 0;
  for (const item of candidates) {
    parts.push(item.text);
    used += item.text.length;
    if (used >= budget) break;
  }
  return parts.join(' ');
}

/** 这一版快照里可当封面的图片：manifest 里是 image、而且真的被某个页面画到 */
function coverAsset(found: PublishedPage) {
  return (
    found.document.assets.find(
      (asset) => asset.kind === 'image' && documentReferencesAsset(found.document, asset.id),
    ) ?? null
  );
}

export interface PublishedSeo {
  metadata: Metadata;
  /** 已转义的 JSON-LD 正文，页面直接塞进 <script type="application/ld+json"> */
  jsonLd: string;
  /** 省略了哪些绝对 URL 标签，以及为什么——页脚之外没人看得见的东西要能说清 */
  omitted: string[];
}

/**
 * @param origin 对外绝对地址的来源；null 表示这一次渲染给不出可信 origin
 */
export function buildPublishedSeo(found: PublishedPage, origin: string | null): PublishedSeo {
  const omitted: string[] = [];
  const url = origin ? `${origin}${found.publication.path}` : null;
  if (!url) omitted.push('canonical / og:url / og:image：没有可用的对外 origin，绝对地址整条省略');

  const name = clean(found.projectName, 120) || '未命名作品';
  // 顺序：作者写过的描述 → 这一版自己的文字 → 一句只陈述事实的兜底。
  // 中间那层不是凑数：作者没写简介时（首页那条简介编辑器之外没人写过这列，历史项目多半是空的），
  // 没有它就会退化成第三层的模板句，等于把摘要机会白白丢掉。
  // 第一层和 projectName 一样读的是项目行的当前值：简介是项目的元信息，不是某一版快照的内容。
  const description =
    clean(found.description ?? '', 200) ||
    clean(textSummary(found.document), 200) ||
    clean(`${ownerLine(found)} 在 NEXUS 上发布的《${name}》第 ${found.publication.version} 版公开快照。`, 200);

  const cover = url ? coverAsset(found) : null;
  if (url && !cover) omitted.push('og:image：这一版快照没有画到任何图片资产，不放占位图');
  // 公共图片路由按 handle 认人（§57），没有 handle 就没有能被爬虫取到的地址
  const imageUrl =
    cover && origin && found.ownerHandle
      ? absoluteUrl(origin, publicAssetUrl(found.ownerHandle, cover.id))
      : null;
  if (cover && !imageUrl) omitted.push('og:image：作者没有 handle，公共图片地址不成立');

  const images =
    cover && imageUrl
      ? [{ url: imageUrl, width: cover.width, height: cover.height, alt: clean(cover.name, 120) }]
      : undefined;

  const metadata: Metadata = {
    title: `${name} · ${ownerLine(found)}`,
    description,
    // unlisted = 只认精确链接，不该被收录；public 才允许索引
    robots: found.publication.visibility === 'public' ? { index: true, follow: true } : { index: false, follow: true },
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      type: 'website',
      ...(url ? { url } : {}),
      siteName: SITE_NAME,
      title: name,
      description,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: name,
      description,
      ...(images ? { images } : {}),
    },
  };

  const authorUrl = found.ownerHandle ? absoluteUrl(origin, `/u/${encodeURIComponent(found.ownerHandle)}`) : null;

  const jsonLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name,
    description,
    ...(url ? { url } : {}),
    author: {
      '@type': 'Person',
      name: clean(found.ownerName, 120),
      ...(authorUrl ? { url: authorUrl } : {}),
    },
    ...(origin
      ? { publisher: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl(origin, '/') } }
      : {}),
    // 发布时刻就是这一版对外的定稿时间（§56 快照钉版），不是项目的创建时间
    datePublished: new Date(found.publication.publishedAt).toISOString(),
    ...(images?.[0] ? { image: images[0].url } : {}),
  });

  return { metadata, jsonLd, omitted };
}

function ownerLine(found: PublishedPage): string {
  return clean(found.ownerName, 80) || '一位作者';
}
