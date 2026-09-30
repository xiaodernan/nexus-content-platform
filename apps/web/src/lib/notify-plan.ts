import type { Visibility } from '@/server/domain/publish';

/**
 * §164 通知的规则本体：一个事件进来，要么变成一条收件箱计划，要么变成 null。
 *
 * 这一层刻意是纯算术（和 §168 的 visit-meter、§166 的 seo 一样），因为这里装的都是
 * "会不会说谎"的判断：谁该收到、自己对自己要不要出声、有没有地方可跳、
 * 同一件事反复发生时留下几条。规则写在 SQL 里就测不到，写在 route 里就只能起真服务才能测。
 */

export type NotificationKind =
  | 'publish'
  | 'moderation'
  | 'like'
  | 'comment'
  | 'follow'
  | 'remix'
  | 'generation'
  | 'agent'
  | 'approval';

/**
 * 每一类都要在这里登记一次。`Record<NotificationKind, true>` 让"加了一类忘了登记"
 * 在 typecheck 就红（少一个键就是类型错），而不是等到收件箱把它读成 `other` 才发现——
 * 读侧（`server/domain/notifications.ts` 的 `isKind`）从这里派生，两处不再是各写一份名单。
 */
export const NOTIFICATION_KINDS: Record<NotificationKind, true> = {
  publish: true,
  moderation: true,
  like: true,
  comment: true,
  follow: true,
  remix: true,
  generation: true,
  agent: true,
  approval: true,
};

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
  /**
   * 这条通知有多要紧。**只给实时事件用，不进库**（`emit` 写入前会把它摘掉）：
   * 级别是"怎么提示"，不是"发生过什么"，存进表里就成了第二份会漂移的状态。
   * 缺省时按 kind 推（见 `server/domain/notifications.ts` 的 `levelOf`）。
   */
  level?: 'info' | 'success' | 'warning' | 'error';
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
  | { kind: 'follow'; recipientId: string; actorId: string; actorName: string; actorHandle: string | null }
  | {
      /**
       * §164 点名的"Generation complete"。它现在有来源了：一次 AI 请求会在 `agent_tasks`
       * 里落一行，跑完（成功或失败）就是这条事件。`capability` 必须一起给——
       * DEMO Mock 的"完成"和真 provider 的"完成"不是一回事，混在标题里就是骗人（§160）。
       */
      kind: 'generation';
      recipientId: string;
      projectId: string;
      projectName: string;
      taskId: string;
      agentKey: string;
      capability: 'real' | 'demo' | 'unavailable';
      ok: boolean;
      durationMs: number | null;
      detail: string | null;
    }
  | {
      /**
       * §164 点名的 "Agent task complete"。它说的**不是**一次同步请求（那是 `generation`
       * 那一类），而是 §112 那种多步作业（Goal → 子任务 → 依赖 → 验收）有了终态：
       * 计划落库、逐步推进、最后一步也收了尾。
       *
       * `planner` 必须一起给：今天计划由确定性配方生成，不写进标题就会被读成"模型规划出来的"
       * （§160）。这里说的也是 `generation` 那一类**没有**的东西：那次请求的结果在响应里，
       * 这次作业的结果在计划里。
       */
      kind: 'agent';
      recipientId: string;
      projectId: string;
      projectName: string;
      taskId: string;
      planner: 'real' | 'demo' | 'unavailable';
      ok: boolean;
      durationMs: number | null;
      /** 逐步统计：走完了几步、失败几步、因上游失败被跳过几步 */
      steps: { total: number; done: number; failed: number; skipped: number };
      detail: string | null;
    }
  | {
      /**
       * §74 的挂起结果过期作废。它说的**不是**"有人点了放弃"——那是人做的决定，
       * 他自己知道，不需要收件箱来告知；这一类说的是**没人做决定**这件事有了后果：
       * 被服务端扣下的那一版永远不会落地。
       *
       * `ttlMs` 必须一起给：标题里那个"多少小时"就是服务端判定过期用的同一个常量
       * （`APPROVAL_TTL_MS`），在通知里另写一个数就是编（§159）。
       * `approvalCount` 是当时扣下的动作数——说"作废了什么"要落到个数上，
       * 而不是只说"有一件事过去了"。
       */
      kind: 'approval';
      recipientId: string;
      projectId: string;
      projectName: string;
      taskId: string;
      ttlMs: number;
      /** 当时扣下的动作数；账本里那份读不出这个数就是 null，标题里也就不说个数（不编一个 0） */
      approvalCount: number | null;
      detail: string | null;
    };

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

    case 'generation': {
      const seconds = event.durationMs === null ? null : `${Math.round(event.durationMs / 100) / 10} 秒`;
      // 一次任务一个终态：键挂在任务行上，重试是另一行任务，因此是另一条通知
      return {
        ...base,
        actorId: null,
        publicationId: null,
        dedupeKey: `generation:${event.taskId}`,
        title: clip(
          `《${event.projectName}》的一次${CAPABILITY_LABEL[event.capability]}生成${event.ok ? '完成' : '失败'}` +
            (event.ok && seconds ? `（${seconds}）` : ''),
          TITLE_MAX,
        ),
        // 失败时 body 就是那句原因；成功时是补丁数一类的摘要，没有就不编
        body: event.detail ? clip(event.detail, BODY_MAX) : null,
        // 生成结果落在工作区，不指向公开页：那次请求改的是还没发布的东西
        link: studioLink(event.projectId),
      };
    }

    case 'agent': {
      const seconds = event.durationMs === null ? null : `${Math.round(event.durationMs / 100) / 10} 秒`;
      // 步数按真发生过的分档说：全走完说"4/4 步"，没走完就说失败几步、被跳过几步。
      // 不要写成"4 步"糊过去——那是把"计划里有 4 步"当成"做了 4 步"
      const count = event.ok
        ? `${event.steps.done}/${event.steps.total} 步`
        : [
            event.steps.failed ? `${event.steps.failed} 步失败` : null,
            event.steps.skipped ? `${event.steps.skipped} 步被跳过` : null,
          ]
            .filter(Boolean)
            .join('，') || `一共 ${event.steps.total} 步`;
      return {
        ...base,
        actorId: null,
        publicationId: null,
        // 一次作业一个终态：键挂在任务行上，重跑是另一行任务，所以是另一条通知
        dedupeKey: `agent:${event.taskId}`,
        // 多步作业失败要按 error 提示，不能和成功一样是绿的
        level: event.ok ? 'success' : 'error',
        title: clip(
          `《${event.projectName}》的多步 Agent 任务${event.ok ? '完成' : '失败'}` +
            `（${PLANNER_LABEL[event.planner]} · ${count}${event.ok && seconds ? ` · ${seconds}` : ''}）`,
          TITLE_MAX,
        ),
        // 成功时是结论摘要（门禁过没过、有几项待办），失败时就是那句原因
        body: event.detail ? clip(event.detail, BODY_MAX) : null,
        // 结果落在工作区里的 Agent 面板上，不指向公开页
        link: studioLink(event.projectId),
      };
    }
    case 'approval': {
      const heldClause = event.approvalCount === null ? '' : `，扣下 ${event.approvalCount} 处`;
      // 一次挂起只会作废一次：键挂在任务行上，与 generation / agent 那两类共用一行任务但不同键
      return {
        ...base,
        actorId: null,
        publicationId: null,
        dedupeKey: `approval:${event.taskId}`,
        level: 'warning',
        title: clip(
          `《${event.projectName}》的一次待审批结果过期作废（${ttlLabel(event.ttlMs)}未裁决${heldClause}）`,
          TITLE_MAX,
        ),
        // body 就是账本里那句理由的同一份说法（服务端写进 error 的是同一句），没有就不编
        body: event.detail ? clip(event.detail, BODY_MAX) : null,
        // 结果本来要落在工作区，所以指向 Studio 而不是公开页
        link: studioLink(event.projectId),
      };
    }
  }
}

/**
 * TTL 的人话读法。**卡片上那句与通知标题那句必须出自同一个函数**：
 * 两处各写一遍 `Math.round(ms / 3_600_000)`，改一次常量就会一个说"24 小时"一个说"0 小时"。
 * 小于一小时时往下退一档，而不是四舍五入成"0 小时"——那是一句看着像真话的假话。
 */
export function ttlLabel(ms: number): string {
  const hours = ms / 3_600_000;
  // 不是整小时就留一位小数：把 1.5 小时读成"2 小时"是一句看着像真话的假话
  if (hours >= 1) return `${Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10} 小时`;
  const minutes = ms / 60_000;
  if (minutes >= 1) return `${Math.round(minutes)} 分钟`;
  return `${Math.round(ms / 1000)} 秒`;
}

/** DEMO Mock 的"完成"和真模型的"完成"要能在标题上分开读（§160） */
const CAPABILITY_LABEL: Record<'real' | 'demo' | 'unavailable', string> = {
  real: '模型',
  demo: 'DEMO 模板',
  unavailable: '（provider 不可用的）',
};

/** 计划是谁给的：确定性配方（demo）与模型规划（real）在标题上就得分开读（§160） */
const PLANNER_LABEL: Record<'real' | 'demo' | 'unavailable', string> = {
  real: '模型规划',
  demo: 'DEMO 规划',
  unavailable: '没有规划器',
};

/**
 * §164 原文列的四类里，今天**仍然没有真实来源**的那一类。
 * 列出来是为了让人问得出"为什么收件箱里没有这个"，而不是假装收件箱覆盖四类（§159）。
 * 摘掉一条要有理由，所以两次都记在这儿：
 * - Generation complete 摘于 2026-09-25：`agent_tasks` 有了写入方，一次请求的终态就是它。
 * - Agent task complete 摘于 2026-09-29：`server/agent/runtime.ts` 的编排器真的把 §112 那种
 *   多步作业跑完（计划落库 → 逐步推进 → 收尾），于是这一类第一次有真终态可发。
 */
export const UNBACKED_NOTIFICATIONS = [
  {
    spec: 'Build complete',
    reason: '平台目前没有会完成的构建操作（没有导出 / 打包端点），发这条通知等于凭空造',
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
