import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/domain/session';
import {
  listMarketplaceItems,
  createMarketplaceItem,
} from '@/server/domain/marketplace';
import { MARKETPLACE_ITEM_TYPES, MARKETPLACE_VISIBILITY } from '@/server/db/schema';
import { scanTextForRedlines } from '@/server/domain/moderation';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, ipWriteGate, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * §127-128 Marketplace 列表与创建。
 *
 * GET：列出公开物品，支持按类型/价格/创作者过滤与搜索。
 * POST：创建新物品（需要登录 + CSRF 门），标题/描述/标签过发布机检同一份红线词表。
 *
 * ## 2026-10-16 横向审计：两个入口的参数与正文此前都是"取到就塞进 SQL"
 *
 * GET 是**公开端点**（没有门）：`?limit=abc` 被 parseInt 成 NaN 后 `.limit(NaN)`、
 * `?minPrice=abc` 成 NaN 后进 `gte()`、`?creatorId=not-a-uuid` 直进 `eq()`——
 * Postgres 报 invalid input / 22P02，任何匿名访客一行查询参数就能把列表打成 500。
 * POST 的正文只校验了 itemType/title 的存在性：`priceCredits: -100` 能建出负价商品
 * （买家白拿、创作者账被 settle 的负分成抽干），UUID 字段与 tags 原样进库时
 * 22P02 / TEXT[] 错误被 catch 成 400，还把 Postgres 的报错原文回给了客户端。
 *
 * 修法与 §123 审计/举报入口同一口径：全部参数与正文过 zod，名单外/非整数/非 UUID
 * 一律 400（`validation_failed`），坏值永远到不了数据库；priceCredits 补上非负与上限。
 * 名字与枚举从 schema 常量派生（`z.enum(MARKETPLACE_ITEM_TYPES)`），不另抄一份名单。
 */

/** GET 列表查询：itemType/visibility 名单来自 schema 常量，数字是非负整数，id 是 UUID */
const ListQuerySchema = z.object({
  itemType: z.enum(MARKETPLACE_ITEM_TYPES).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  creatorId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().nonnegative().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

/**
 * POST 创建正文。`priceCredits` 必须有下限也有上限：
 * 负数价格让 `purchaseMarketplaceItem` 跳过扣点（`pricePaid > 0` 才写流水），
 * 买家白拿商品，而 `settlePurchase` 仍按 `floor(price * 0.7)` 给创作者记一条**负**分成——
 * 一次购买两头都错。上限挡住 int4 溢出（那会把 Postgres 的越界报错回给客户端）。
 */
const CreateItemSchema = z.object({
  itemType: z.enum(MARKETPLACE_ITEM_TYPES),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  previewAssetId: z.string().uuid().optional(),
  sourceProjectId: z.string().uuid().optional(),
  snapshotId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  priceCredits: z.number().int().nonnegative().max(1_000_000).optional(),
  visibility: z.enum(MARKETPLACE_VISIBILITY).optional(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = ListQuerySchema.safeParse({
    itemType: url.searchParams.get('itemType') ?? undefined,
    minPrice: url.searchParams.get('minPrice') ?? undefined,
    maxPrice: url.searchParams.get('maxPrice') ?? undefined,
    creatorId: url.searchParams.get('creatorId') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`));
  }

  const items = await listMarketplaceItems({
    ...parsed.data,
    // limit 的上限照旧在域层截断（100）， zod 只保证它是非负整数：
    // "要 101 条"是合法请求（截断到 100），"要 abc 条"是坏请求（400）
    limit: Math.min(parsed.data.limit ?? 20, 100),
    offset: parsed.data.offset ?? 0,
  });

  return NextResponse.json({ items }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  // §137 的 guest 自动签发：无会话客户端的 user.id 每请求都是新的，按身份限流对它空转
  // （marketplace 那条注释早就点破过"换 cookie 就能无限造行"，但 user.id + IP 双键仍挡不住新身份）。
  // 所以这道按 IP 的闸必须放在 requireUser() 之前——被挡住的请求一个 guest 都不该建。
  const gate = ipWriteGate('marketplace/create', req, 20, 3600000);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '上架太频繁了，稍后再试', retryAfterMs: gate.retryAfterMs });

  const user = await requireUser();
  // 限流：创建是任何登录身份（含 guest）都能走的公开写入口。guest 会话每次未知 token
  // 都会新建一个 guest 用户，不限流就等于"换 cookie 就能无限造行"——物品行 + 用户行
  // 一起涨。与 follow（30/分）/ 举报（10/小时）/ 草稿接受（20/10 分）同一口径。
  // 额度用 `user.id` + IP 双键：同一身份多个出口共享一份，同一出口多个身份各自计数。
  const rl = getRateLimiter().hit(rateKey('marketplace/create', clientIp(req), user.id), 20, 10 * 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '上架太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
  }
  // 坏 JSON 也走 400：此前 `await req.json()` 在 try 之外，非 JSON 正文直接把请求带崩成 500
  const body = await req.json().catch(() => null);
  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }

  // 内容安全：标题、描述、标签过发布机检同一份红线词表
  const textsToCheck = [parsed.data.title, parsed.data.description ?? '', ...(parsed.data.tags ?? [])].join(' ');

  if (textsToCheck.trim()) {
    const redlines = scanTextForRedlines(textsToCheck);
    if (redlines.length > 0) {
      return NextResponse.json({ error: 'Content contains prohibited terms', redlines }, { status: 400 });
    }
  }

  try {
    const item = await createMarketplaceItem({
      creatorId: user.id,
      ...parsed.data,
      priceCredits: parsed.data.priceCredits ?? 0,
      visibility: parsed.data.visibility ?? 'private',
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    // 到这里只剩域层的业务错误（素材/项目/快照不存在、非项目所有者）——那些消息本身是安全的；
    // 22P02 / CHECK / int4 越界那一类数据库内部报错已在 zod 那关被挡掉，不再原样回给客户端
    return NextResponse.json({ error: error instanceof Error ? error.message : '创建失败' }, { status: 400 });
  }
}
