import type { DesignDocument } from '@nexus/design-model';
import { documentReferencesAsset } from './assets';
import { isUuid } from './ids';
import { getPublication } from './publish';
import { publicationAnalytics, type AnalyticsNumbers } from './analytics';
import { readSnapshot } from './snapshots';
import { getDb } from '../db/client';
import { projects } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * §169 Creator Analytics Agent：回答"为什么我的项目没人看？"。
 *
 * **这是一份规则分析，没有调用任何模型**。它读的全是已经存在的事实（§168 那份数字、
 * 项目行的简介、这一版快照钉住的文档、审核状态），推出的每一条都带着它自己的证据数字。
 * 之所以不叫它 AI：接上 provider 之后可以再把这份事实清单交给模型改写措辞，
 * 但今天这条路上没有任何模型参与，写成"Agent 分析"就是 §159 禁止的那种假 AI。
 *
 * 设计上的三条纪律：
 * 1. **先问"有没有人能被看到"，再问"看到的人为什么走"**。审核没过、或者设成 unlisted 的作品
 *    根本不会出现在发现页与搜索里（§131/§165 的可见性规则），这时候谈标题是误导。
 * 2. **口径写进证据里**：`views` 含作者自己的刷新、`playTimeMs` 为 null 是"没采到"而不是 0、
 *    `selfOnly` 为真时那串数字只证明作者自己打开过。同一份数据能推出相反结论的地方，
 *    就把口径摆出来，让人自己判断。
 * 3. **不建议做不到的事**：能改的只有标题/简介/封面/发布设置与分享动作，
 *    不写"投放广告""买流量"这类平台没有的东西。
 */

export interface CreatorFact {
  projectName: string;
  /** 项目行的当前值；null / 空串 = 作者从没写过简介（访客页那一句是从快照文字拼出来的） */
  description: string | null;
  /** 这一版快照真的画到了图片资产（og:image 的判定口径，见 seo.ts） */
  hasCoverImage: boolean;
  visibility: 'public' | 'unlisted' | 'private';
  /** 审核状态：只有 admin 的人工裁决能写成 approved/clear，见 §131 */
  moderation: string;
  publishedAt: string;
  daysSincePublish: number;
  /**
   * 这一版**是可玩的那一类**（发布那一刻钉住了游戏设计，ADR-0009）。
   *
   * 有它才谈得上"有没有人玩到结局"：不是游戏的那些作品没有通关这回事，
   * 说"没人通关"等于拿一条不存在的尺子量它（§159）。
   */
  hasGame: boolean;
  numbers: AnalyticsNumbers;
}

export interface Finding {
  /** 分类，界面上按它分组：title / description / thumbnail / reach / retention / traffic / settings */
  area: 'title' | 'description' | 'thumbnail' | 'reach' | 'retention' | 'traffic' | 'settings';
  /** 观察到的事实，带数字与口径 */
  evidence: string;
  /** 从这份事实推出的那一句 */
  conclusion: string;
  /** 建议动作：只做平台今天真支持的事 */
  action: string;
}

const DAY_MS = 86_400_000;
/** 搜索结果与 OG 卡片大约在这里截断，超出的部分访客看不到 */
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 200;

function daysSince(iso: string): number {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.floor((Date.now() - at) / DAY_MS));
}

/**
 * 一份事实 → 一串发现。纯函数：所有输入都在 `CreatorFact` 里，不读库也不看时间以外的外部状态
 * （`daysSincePublish` 由调用方算好传进来，测试才能钉住边界）。
 */
export function analyzeCreatorFacts(fact: CreatorFact): Finding[] {
  const out: Finding[] = [];
  const n = fact.numbers;
  const days = fact.daysSincePublish;

  // 1. 能不能被看到：这一条排在最前，因为它决定后面几条有没有意义
  if (fact.moderation === 'rejected') {
    out.push({
      area: 'settings',
      evidence: '这一版的审核结论是被驳回。',
      conclusion: '驳回的作品不会出现在全平台搜索的结果里（那条谓词只放非 rejected 的行），"没人看"首先是入口被关掉了。',
      action: '先在通知与项目页里看驳回的原因（红线词 / 资产出处），改完重新发布再谈数据。',
    });
  } else if (fact.moderation !== 'clear' && fact.moderation !== 'approved') {
    // 这一条不能说成"被挡在发现页外"：今天搜索只挡 rejected，pending / review 仍然能被搜到。
    // 编一个不存在的惩罚比不说更糟——只说这一栏确实是"还没落下的人工裁决"。
    out.push({
      area: 'settings',
      evidence: `这一版的审核状态还停在「${fact.moderation}」：机检只升级不认证，人工裁决还没落下。`,
      conclusion: '它没有被驳回（今天的全平台搜索只挡 rejected），所以这一条不是"没人看"的直接原因——但推荐位与人工审核队列会看它。',
      action: '如果通知里有机检给出的原因，先按它改；没有的话把这一栏当背景信息，重点看下面几条。',
    });
  }
  if (fact.visibility !== 'public') {
    out.push({
      area: 'settings',
      evidence: `当前可见性是「${fact.visibility === 'unlisted' ? '仅链接可见' : '不公开'}」，链接以外的人拿不到它。`,
      conclusion: '"没人看"在这个设置下是预期结果，不是作品的问题。',
      action: '要收自然流量就把可见性改成公开（发布前会过 §131 的门），或者把链接主动发到有人的地方。',
    });
  }

  // 2. 数据能不能算证据
  if (n.visitors === 0) {
    out.push({
      area: 'traffic',
      evidence: `发布 ${days} 天，独立访客 0 人（页面打开 ${n.views} 次）。`,
      conclusion: days >= 7 ? '一周以上还是零访客，问题在"没有被看到"，不在"看到的人不留下来"。' : '样本还是空的，现在下结论太早。',
      action: days >= 7 ? '先解决入口：公开可见性、发现页、把链接发到目标人在的地方；标题与封面是这一步的转化率。' : '过几天再看这一栏。',
    });
  } else if (n.selfOnly) {
    out.push({
      area: 'traffic',
      evidence: `独立访客 ${n.visitors} 人，而这 ${n.visitors} 人都是你本人（views ${n.views} 含自己的刷新）。`,
      conclusion: '这串数字只证明"作者自己打开过"，不能当成"有人在看"或"没人看"的证据。',
      action: '换一个不是自己的浏览器/设备打开一次公开链接确认页面正常，然后把链接发给别人。',
    });
  }

  // 3. 留下来的那部分人走到哪了
  if (n.completion) {
    if (n.completion.avgPct < 50) {
      out.push({
        area: 'retention',
        evidence: `${n.completion.over} 位访客报告了浏览进度，平均只看到 ${Math.round(n.completion.avgPct)}% 就停了。`,
        conclusion: '有人打开，但没看完——首屏之后留不住人，而不只是首屏的问题。',
        action: '把最想让人看到的一屏往前挪；检查后面几屏是不是文字堆叠或加载不出来（预览页可以逐屏核对）。',
      });
    }
  } else if (n.visitors > 0) {
    out.push({
      area: 'retention',
      evidence: '一条浏览进度心跳都没收到（不是 0%，是没有采到）。',
      conclusion: '这一栏没法判断访客有没有看完。',
      action: '如果公开页被嵌在别人的 iframe 里、或者访客用不支持可见性上报的环境打开，就不会有心跳——先确认能直接访问公开链接。',
    });
  }
  if (n.playTimeMs === null && n.visitors > 0) {
    out.push({
      area: 'retention',
      evidence: '可见时长没有数据（累计为 null，不拿 views 换算）。',
      conclusion: '不知道访客停了多久。',
      action: '同上：先确认公开页能被正常打开，再来看这一栏。',
    });
  }

  // 4. 来看的人没玩到结局（只有可玩的那一类才有这个说法）
  //    与上一条**不是同一件事**：上一条说的是"滚到了页面的几成"，
  //    这一条说的是"有没有人玩到结局"⇒ 混起来就成了两句话说同一件事。
  //    看过的人只有作者自己时不说这件事（那不是"来的人没走完"，是"还没别人来过"）。
  if (fact.hasGame && !n.selfOnly && n.visitors > 0 && n.completedVisitors === 0) {
    out.push({
      area: 'retention',
      evidence: `${n.visitors} 个访客来过这一版（这一版是可玩的那一类），其中 0 人玩到结局。`,
      conclusion: '来的人没走完这段——这不能直接说"这游戏不好玩"，但"有人看"与"有人玩通"之间的那段空白就在这里。',
      action: '自己先在公开可玩页上走一遍（/n/…/play）：几步之内能不能走到结局？走不通的那一步，就是访客掉下去的地方。',
    });
  }

  // 5. 门面三件：标题 / 简介 / 封面
  const title = fact.projectName.trim();
  if (!title || title === '未命名项目') {
    out.push({
      area: 'title',
      evidence: '项目名还是"未命名项目"。',
      conclusion: '搜索结果、分享卡片与 og:title 上都只有这一句，读者得不到任何信息。',
      action: '改成一句说清"这是什么 / 给谁用"的名字（首页每个项目下的元信息编辑器就能改）。',
    });
  } else if (title.length > TITLE_LIMIT) {
    out.push({
      area: 'title',
      evidence: `项目名 ${title.length} 个字符，超出大约 ${TITLE_LIMIT} 字符的显示宽度。`,
      conclusion: '搜索与分享卡片会把它截断，被截掉的那半句往往正是差别所在。',
      action: '把最关键的词放前面，长度压到 60 字以内。',
    });
  }
  if (!fact.description?.trim()) {
    out.push({
      area: 'description',
      evidence: '作者没有写过简介；访客页的摘要是从这一版快照的文字里拼出来的。',
      conclusion: '拼出来的那句不受控：可能是按钮文案，也可能是一句没有钩子的描述。',
      action: '写一句 200 字以内的简介（说清给谁用、解决什么），摘要与搜索描述都会用它。',
    });
  } else if (fact.description.trim().length > DESCRIPTION_LIMIT) {
    out.push({
      area: 'description',
      evidence: `简介 ${fact.description.trim().length} 个字符，超过 ${DESCRIPTION_LIMIT} 字的部分会被截掉。`,
      conclusion: '搜索引擎与分享卡片只取前面那一截。',
      action: '把重点写进前 200 字。',
    });
  }
  if (!fact.hasCoverImage) {
    out.push({
      area: 'thumbnail',
      evidence: '这一版快照没有画到任何图片资产，公开页不放 og:image。',
      conclusion: '被分享到聊天/社交平台时是一张没有封面的裸卡片，点击率通常吃这一项的亏。',
      action: '给首屏放一张真被画到的图片资产（截图或生成的图都行）；引用不到的图不会当封面。',
    });
  }

  // 6. 有付费用户没转化
  if (n.likes > 0 && n.followers === 0) {
    out.push({
      area: 'traffic',
      evidence: `收到 ${n.likes} 次点赞，但关注这个作者的人数是 0。`,
      conclusion: '有人认可这一件作品，却没有一个人想接着看下去——缺的是"接下来还有什么"。',
      action: '在作品里留一个指向下一篇/下一个作品的入口，或个人主页里把系列排出来。',
    });
  }

  return out;
}

/**
 * 读库装配一份事实。归属不通过就返回 null（与"这个项目没有发布过"同一个答案，
 * 不区分别人的项目与不存在的项目，免得拿它探谁有什么）。
 */
export async function buildCreatorFact(projectId: string, ownerId: string): Promise<CreatorFact | null> {
  if (!isUuid(projectId)) return null;
  const db = getDb();
  const [row] = await db
    .select({ name: projects.name, description: projects.description, ownerId: projects.ownerId, deletedAt: projects.deletedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row || row.ownerId !== ownerId || row.deletedAt) return null;
  const publication = await getPublication(projectId);
  if (!publication) return null;
  const analytics = await publicationAnalytics(ownerId, publication.id);
  if (!analytics) return null;

  let hasCoverImage = false;
  if (publication.snapshotId) {
    const snap = await readSnapshot(projectId, publication.snapshotId);
    const document: DesignDocument | undefined = snap?.document;
    hasCoverImage = Boolean(
      document?.assets.find((asset) => asset.kind === 'image' && documentReferencesAsset(document!, asset.id)),
    );
  }

  return {
    projectName: row.name,
    description: row.description ?? null,
    hasCoverImage,
    visibility: publication.visibility,
    moderation: publication.moderation,
    publishedAt: publication.publishedAt,
    daysSincePublish: daysSince(publication.publishedAt),
    hasGame: publication.hasGame,
    numbers: analytics.analytics,
  };
}
