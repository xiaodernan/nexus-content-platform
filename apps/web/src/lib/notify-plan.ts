import type { Visibility } from '@/server/domain/publish';

/**
 * §164 通知的规则本体：一个事件进来，要么变成一条收件箱计划，要么变成 null。
 *
 * 这一层刻意是纯算术（和 §168 的 visit-meter、§166 的 seo 一样），因为这里装的都是
 * "会不会说谎"的判断：谁该收到、自己对自己要不要出声、有没有地方可跳、
 * 同一件事反复发生时留下几条。规则写在 SQL 里就测不到，写在 route 里就只能起真服务才能测。
 */

export type NotificationKind = 'publish' | 'moderation' | 'like' | 'comment' | 'follow' | 'remix';

export interface NotificationPlan {
  userId: string;
  actorId: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  projectId: string | null;
  publicationId: string | null;
  dedupeKey: string;
}

export type NotifyEvent =
  | {
      kind: 'publish';
      recipientId: string;
      projectId: string;
      projectName: string;
      publicationId: string;
      path: string;
      version: number;
      visibility: Visibility;
    }
  | {
      kind: 'moderation';
      recipientId: string;
      adminId: string;
      projectId: string;
      projectName: string;
      publicationId: string | null;
      caseId: string;
      version: number;
      resolution: 'approved' | 'rejected';
      note: string | null;
    }
  | {
      kind: 'like';
      recipientId: string;
      actorId: string;
      actorName: string;
      projectId: string;
      publicationId: string;
      path: string;
      projectName: string;
    }
  | {
      kind: 'comment';
      recipientId: string;
      actorId: string;
      actorName: string;
      projectId: string;
      publicationId: string;
      path: string;
      projectName: string;
      commentId: string;
      text: string;
    }
  | {
      kind: 'remix';
      recipientId: string;
      actorId: string;
      actorName: string;
      projectId: string;
      publicationId: string;
      path: string;
      projectName: string;
      forkedProjectId: string;
    }
  | { kind: 'follow'; recipientId: string; actorId: string; actorName: string; actorHandle: string | null };

/** 项目名与对方显示名都是用户输入，进标题前要有个上限 */
export const TITLE_MAX = 140;
/** 评论摘录：收件箱是"回去看一眼"的入口，不是把整段搬运一份 */
export const BODY_MAX = 200;

/** 换行与连续空白压成一个空格：标题是单行文本，摘录不能把版式带进收件箱 */
export function clip(input: string, max: number): string {
  const text = input.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  // 留一个字符给省略号，截断后的总长仍然不超过 max
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** 别人对我造成的动作：这类要挡掉"自己给自己发通知" */
function community(event: NotifyEvent): event is Extract<NotifyEvent, { actorId: string }> {
  return event.kind === 'like' || event.kind === 'comment' || event.kind === 'remix' || event.kind === 'follow';
}

/** 作者自己的工作区地址：公开页可能已经下架，Studio 这一头始终是他能看到的地方 */
const studioLink = (projectId: string): string => `/studio/${projectId}`;

/**
 * 只有 public 与 unlisted 有能打开的公开地址：findPublicPath 挡掉 private，
 * 所以切成私有的那一次如果还挂一个 `/n/...` 链接，点下去就是 404。
 */
function publicLink(visibility: Visibility, path: string, projectId: string): string {
  return visibility === 'private' ? studioLink(projectId) : path;
}

export function planNotification(event: NotifyEvent): NotificationPlan | null {
  if (community(event) && event.actorId === event.recipientId) return null;

  const base = {
    userId: event.recipientId,
    kind: event.kind,
    projectId: 'projectId' in event ? event.projectId : null,
  };

  switch (event.kind) {
    case 'publish':
      return {
        ...base,
        actorId: null,
        publicationId: event.publicationId,
        // 版本号在键里：一条 path 一行、换版本不新增，所以同一份作品的两次发布是两件事
        dedupeKey: `publish:${event.publicationId}:${event.version}`,
        title: clip(
          event.visibility === 'public'
            ? `《${event.projectName}》已发布为公开页（第 ${event.version} 版）`
            : event.visibility === 'unlisted'
              ? `《${event.projectName}》已发布为仅链接（第 ${event.version} 版）`
              : `《${event.projectName}》已切为私有，公开链接不再可访问（第 ${event.version} 版）`,
          TITLE_MAX,
        ),
        body: null,
        link: publicLink(event.visibility, event.path, event.projectId),
      };

    case 'moderation':
      return {
        ...base,
        actorId: event.adminId,
        publicationId: event.publicationId,
        // 一个案号只会有一个结论：resolveCase 拒绝二次裁决，这个键因此是防御而不是特性
        dedupeKey: `moderation:${event.caseId}`,
        title: clip(
          event.resolution === 'rejected'
            ? `《${event.projectName}》第 ${event.version} 版经人工审核后已下架`
            : `《${event.projectName}》第 ${event.version} 版人工审核通过`,
          TITLE_MAX,
        ),
        body: event.note ? clip(event.note, BODY_MAX) : null,
        // 审核结论指向作者的编辑区：被拒绝的公开页本来就打不开，指过去等于给 404
        link: studioLink(event.projectId),
      };

    case 'like':
      return {
        ...base,
        actorId: event.actorId,
        publicationId: event.publicationId,
        // 点赞是开关：反复开关只留一条，不然收件箱记录的是别人的手抖
        dedupeKey: `like:${event.projectId}:${event.actorId}`,
        title: clip(`${event.actorName} 点赞了《${event.projectName}》`, TITLE_MAX),
        body: null,
        link: event.path,
      };

    case 'comment':
      return {
        ...base,
        actorId: event.actorId,
        publicationId: event.publicationId,
        // 评论每发一条都是一件新事，所以键挂在评论本身上
        dedupeKey: `comment:${event.commentId}`,
        title: clip(`${event.actorName} 评论了《${event.projectName}》`, TITLE_MAX),
        body: clip(event.text, BODY_MAX),
        link: event.path,
      };

    case 'remix':
      return {
        ...base,
        actorId: event.actorId,
        publicationId: event.publicationId,
        dedupeKey: `remix:${event.forkedProjectId}`,
        title: clip(`${event.actorName} 改编了《${event.projectName}》`, TITLE_MAX),
        body: null,
        link: event.path,
      };

    case 'follow':
      return {
        ...base,
        actorId: event.actorId,
        publicationId: null,
        dedupeKey: `follow:${event.actorId}:${event.recipientId}`,
        title: clip(`${event.actorName} 开始关注你`, TITLE_MAX),
        body: null,
        // 没有 handle 就没有 /u/<handle> 这页，链接宁可不给也不指一张空页
        link: event.actorHandle ? `/u/${event.actorHandle}` : null,
      };
  }
}

/**
 * §164 原文列的四类里，今天**没有真实来源**的那三类。
 * 列出来是为了让人问得出"为什么收件箱里没有生成完成"，而不是假装收件箱覆盖四类（§159）。
 */
export const UNBACKED_NOTIFICATIONS = [
  {
    spec: 'Generation complete',
    reason: 'AI 生成是同一次请求里同步回话的，web 侧没有可以稍后"完成"的作业；接上 §162 的队列消费者之后才有真事件可发',
  },
  {
    spec: 'Build complete',
    reason: '平台目前没有会完成的构建操作（没有导出 / 打包端点），发这条通知等于凭空造',
  },
  {
    spec: 'Agent task complete',
    reason: 'agent_tasks 表有结构但全库没有写入方，没有任何一个任务真的跑完过',
  },
];

/** 读取时判定"这条通知还指得到东西吗"——目标被删或被下架时不悄悄消失，说明原因（§59 同一口径） */
export type TargetState = { ok: true } | { ok: false; why: string };

export interface TargetFacts {
  link: string | null;
  /** 指向公开页的那类才查这一版；判断依据是链接形态而不是 kind——切成私有的发布通知指向编辑区 */
  needsPublication: boolean;
  publicationId: string | null;
  publicationLive: boolean;
  projectId: string | null;
  /** 软删除：行还在但作者已把它扔掉。今天全库没有写这一列的地方，这条谓词是防御性的（同 §166） */
  projectDeleted: boolean;
}

export function targetState(facts: TargetFacts): TargetState {
  if (!facts.link) return { ok: false, why: '没有可跳转的页面' };
  if (facts.projectId && facts.projectDeleted) return { ok: false, why: '项目已经不存在' };
  if (facts.needsPublication && (!facts.publicationId || !facts.publicationLive)) {
    return { ok: false, why: '这一版已经不公开了' };
  }
  return { ok: true };
}
