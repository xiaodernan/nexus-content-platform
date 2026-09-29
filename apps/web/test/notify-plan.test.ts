import { describe, expect, it } from 'vitest';
import {
  BODY_MAX,
  TITLE_MAX,
  UNBACKED_NOTIFICATIONS,
  clip,
  planNotification,
  targetState,
  type NotifyEvent,
} from '../src/lib/notify-plan';

/**
 * §164 通知的规则表：谁该收到、说什么、指到哪儿、反复发生留几条。
 * 这四类判断全是"会不会说谎"的判断，所以放在纯函数里逐条钉住，
 * 而不是等起了服务、连上库才发现自己给自己发了三条通知。
 */

type Like = Extract<NotifyEvent, { kind: 'like' }>;
type Publish = Extract<NotifyEvent, { kind: 'publish' }>;

const like = (over: Partial<Like> = {}): NotifyEvent => ({
  kind: 'like',
  recipientId: 'owner-1',
  actorId: 'visitor-1',
  actorName: '阿光',
  projectId: 'proj-1',
  publicationId: 'pub-1',
  path: '/n/owner/thing',
  projectName: '小站',
  ...over,
});

const publish = (over: Partial<Publish> = {}): NotifyEvent => ({
  kind: 'publish',
  recipientId: 'owner-1',
  projectId: 'proj-1',
  projectName: '小站',
  publicationId: 'pub-1',
  path: '/n/owner/thing',
  version: 3,
  visibility: 'public',
  ...over,
});

describe('谁会收到（自我抑制）', () => {
  it('自己对自己做的四个社区动作都不产生通知', () => {
    const self = { recipientId: 'u-1', actorId: 'u-1' };
    expect(planNotification(like(self))).toBeNull();
    expect(
      planNotification({
        kind: 'comment',
        ...self,
        actorName: '我',
        projectId: 'p',
        publicationId: 'q',
        path: '/n/a/b',
        projectName: 'x',
        commentId: 'c-1',
        text: '不错',
      }),
    ).toBeNull();
    expect(
      planNotification({
        kind: 'remix',
        ...self,
        actorName: '我',
        projectId: 'p',
        publicationId: 'q',
        path: '/n/a/b',
        projectName: 'x',
        forkedProjectId: 'f-1',
      }),
    ).toBeNull();
    expect(planNotification({ kind: 'follow', ...self, actorName: '我', actorHandle: 'me' })).toBeNull();
  });

  it('同一种事件只是换了收件人就必须出声（否则上一条是因为规则挡的还是没建起来，分不开）', () => {
    expect(planNotification(like({ recipientId: 'owner-2' }))?.title).toContain('点赞了');
  });

  it('发布与审核不适用自我抑制：那是系统结论，不是"别人对我做了动作"', () => {
    expect(
      planNotification({
        kind: 'moderation',
        recipientId: 'admin-1',
        adminId: 'admin-1',
        projectId: 'proj-1',
        projectName: '小站',
        publicationId: 'pub-1',
        caseId: 'case-1',
        version: 2,
        resolution: 'rejected',
        note: null,
      }),
    ).not.toBeNull();
    expect(planNotification(publish({ recipientId: 'owner-1' }))).not.toBeNull();
  });
});

describe('说什么', () => {
  it('三种可见性各说一句，private 那句要明说公开链接已失效', () => {
    expect(planNotification(publish({ visibility: 'public' }))?.title).toBe('《小站》已发布为公开页（第 3 版）');
    expect(planNotification(publish({ visibility: 'unlisted' }))?.title).toBe('《小站》已发布为仅链接（第 3 版）');
    expect(planNotification(publish({ visibility: 'private' }))?.title).toBe(
      '《小站》已切为私有，公开链接不再可访问（第 3 版）',
    );
  });

  it('审核通过与下架是两句话，备注进 body 并被裁短', () => {
    type Moderation = Extract<NotifyEvent, { kind: 'moderation' }>;
    const event = (resolution: Moderation['resolution']): Moderation => ({
      kind: 'moderation',
      recipientId: 'owner-1',
      adminId: 'admin-1',
      projectId: 'proj-1',
      projectName: '小站',
      publicationId: 'pub-1',
      caseId: 'case-1',
      version: 7,
      resolution,
      note: '  首页  \n 文案越线  ',
    });
    expect(planNotification(event('approved'))?.title).toBe('《小站》第 7 版人工审核通过');
    expect(planNotification(event('rejected'))?.title).toBe('《小站》第 7 版经人工审核后已下架');
    expect(planNotification(event('rejected'))?.body).toBe('首页 文案越线');
    expect(planNotification({ ...event('rejected'), note: null })?.body).toBeNull();
  });

  it('用户输入进标题前压平空白并截到上限（标题是单行文本）', () => {
    const plan = planNotification(like({ actorName: '张三\n李四', projectName: '长'.repeat(200) }));
    expect(plan?.title).not.toContain('\n');
    expect(plan!.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(plan!.title.endsWith('…')).toBe(true);
  });

  it('评论摘录裁到 BODY_MAX，摘录是给作者看一眼的、不是搬运整段', () => {
    const plan = planNotification({
      kind: 'comment',
      recipientId: 'owner-1',
      actorId: 'visitor-1',
      actorName: '阿光',
      projectId: 'proj-1',
      publicationId: 'pub-1',
      path: '/n/owner/thing',
      projectName: '小站',
      commentId: 'c-9',
      text: '写'.repeat(500),
    });
    expect(plan?.body).toHaveLength(BODY_MAX);
    expect(plan?.body?.endsWith('…')).toBe(true);
    // 标题本身不含评论正文：正文只在 body 里出现一次
    expect(plan?.title).not.toContain('写');
  });

  it('clip 在边界上不超发：恰好等于上限的原样返回，多一个字符才截', () => {
    expect(clip('あ'.repeat(BODY_MAX), BODY_MAX)).toHaveLength(BODY_MAX);
    expect(clip('あ'.repeat(BODY_MAX + 1), BODY_MAX)).toHaveLength(BODY_MAX);
    expect(clip('  两头空白  ', 10)).toBe('两头空白');
  });
});

describe('指到哪儿', () => {
  it('public 与 unlisted 指向公开页，private 指向作者的编辑区', () => {
    expect(planNotification(publish({ visibility: 'public' }))?.link).toBe('/n/owner/thing');
    expect(planNotification(publish({ visibility: 'unlisted' }))?.link).toBe('/n/owner/thing');
    expect(planNotification(publish({ visibility: 'private' }))?.link).toBe('/studio/proj-1');
  });

  it('审核结论指向编辑区：被下架的那一版本来就 404，指过去等于给死链', () => {
    const plan = planNotification({
      kind: 'moderation',
      recipientId: 'owner-1',
      adminId: 'admin-1',
      projectId: 'proj-1',
      projectName: '小站',
      publicationId: 'pub-1',
      caseId: 'case-1',
      version: 1,
      resolution: 'rejected',
      note: null,
    });
    expect(plan?.link).toBe('/studio/proj-1');
  });

  it('对方没有 handle 时关注通知不给链接，不编一个 /u/undefined', () => {
    expect(planNotification({ kind: 'follow', recipientId: 'owner-1', actorId: 'a-1', actorName: '客', actorHandle: null })?.link).toBeNull();
    expect(
      planNotification({ kind: 'follow', recipientId: 'owner-1', actorId: 'a-1', actorName: '客', actorHandle: 'ke' })?.link,
    ).toBe('/u/ke');
  });
});

describe('反复发生留几条（dedupe_key）', () => {
  it('同一个人对同一件作品反复点赞是同一个键，换作品就不是', () => {
    const first = planNotification(like())?.dedupeKey;
    expect(planNotification(like())?.dedupeKey).toBe(first);
    expect(planNotification(like({ projectId: 'proj-2' }))?.dedupeKey).not.toBe(first);
    expect(planNotification(like({ actorId: 'visitor-2' }))?.dedupeKey).not.toBe(first);
  });

  it('发布把版本号放进键里：一条 path 一行、换版本不新增，所以两次发布是两件事', () => {
    expect(planNotification(publish({ version: 3 }))?.dedupeKey).toBe('publish:pub-1:3');
    expect(planNotification(publish({ version: 4 }))?.dedupeKey).toBe('publish:pub-1:4');
  });

  it('评论每发一条一个键，改编每份副本一个键', () => {
    const comment = (commentId: string): NotifyEvent => ({
      kind: 'comment',
      recipientId: 'owner-1',
      actorId: 'visitor-1',
      actorName: '阿光',
      projectId: 'proj-1',
      publicationId: 'pub-1',
      path: '/n/owner/thing',
      projectName: '小站',
      commentId,
      text: '好',
    });
    expect(planNotification(comment('c-1'))?.dedupeKey).not.toBe(planNotification(comment('c-2'))?.dedupeKey);
    const remix = (forkedProjectId: string): NotifyEvent => ({
      kind: 'remix',
      recipientId: 'owner-1',
      actorId: 'visitor-1',
      actorName: '阿光',
      projectId: 'proj-1',
      publicationId: 'pub-1',
      path: '/n/owner/thing',
      projectName: '小站',
      forkedProjectId,
    });
    expect(planNotification(remix('f-1'))?.dedupeKey).toBe('remix:f-1');
    expect(planNotification(remix('f-2'))?.dedupeKey).toBe('remix:f-2');
  });
});

describe('§164 四类里没有来源的那一类', () => {
  it('Generation 与 Agent task 两类都有真来源了，只剩 Build complete 挂着', () => {
    expect(UNBACKED_NOTIFICATIONS.map((u) => u.spec)).toEqual(['Build complete']);
    for (const entry of UNBACKED_NOTIFICATIONS) {
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('读取时还能不能点（targetState）', () => {
  const facts = {
    link: '/n/owner/thing',
    needsPublication: true,
    publicationId: 'pub-1',
    publicationLive: true,
    projectId: 'proj-1',
    projectDeleted: false,
  };

  it('一切还在：能跳', () => {
    expect(targetState(facts)).toEqual({ ok: true });
  });

  it('没有链接的通知说"没有可跳转的页面"而不是假装能跳', () => {
    expect(targetState({ ...facts, link: null })).toEqual({ ok: false, why: '没有可跳转的页面' });
  });

  it('项目软删除算不存在，但没有项目指针的那类（关注）不受影响', () => {
    expect(targetState({ ...facts, projectDeleted: true })).toEqual({ ok: false, why: '项目已经不存在' });
    expect(targetState({ ...facts, projectId: null, projectDeleted: true })).toEqual({ ok: true });
  });

  it('指向公开页而那一版已经不公开：说清楚是"这一版已经不公开了"', () => {
    expect(targetState({ ...facts, publicationLive: false })).toEqual({ ok: false, why: '这一版已经不公开了' });
    expect(targetState({ ...facts, publicationId: null })).toEqual({ ok: false, why: '这一版已经不公开了' });
    // 作者自己下架后，指向编辑区的那类（审核/切成私有）不受影响
    expect(targetState({ ...facts, needsPublication: false, publicationId: null, publicationLive: false })).toEqual({
      ok: true,
    });
  });
});

type Generation = Extract<NotifyEvent, { kind: 'generation' }>;

const generation = (over: Partial<Generation> = {}): NotifyEvent => ({
  kind: 'generation',
  recipientId: 'u-1',
  projectId: 'p-1',
  projectName: '深夜便利店',
  taskId: 't-1',
  agentKey: 'design-edit',
  capability: 'demo',
  ok: true,
  durationMs: 1234,
  detail: '3 处补丁 · 1 份方案',
  ...over,
});

describe('Generation complete（§164 里以前没有来源的那一类）', () => {
  it('真模型与 DEMO 模板的"完成"在标题上分开读（§160）', () => {
    const demo = planNotification(generation());
    const real = planNotification(generation({ capability: 'real', taskId: 't-2' }));
    expect(demo?.title).toContain('DEMO 模板生成完成');
    expect(real?.title).toContain('模型生成完成');
    expect(demo?.title).not.toBe(real?.title);
  });

  it('一条任务一个终态：键挂在任务行上，换任务号就是另一件事', () => {
    expect(planNotification(generation())?.dedupeKey).toBe('generation:t-1');
    expect(planNotification(generation({ taskId: 't-9' }))?.dedupeKey).toBe('generation:t-9');
  });

  it('失败也出声，正文就是那句原因；链接指向编辑区而不是公开页', () => {
    const plan = planNotification(generation({ ok: false, detail: 'provider 不可达' }));
    expect(plan?.title).toContain('失败');
    expect(plan?.body).toBe('provider 不可达');
    expect(plan?.link).toBe('/studio/p-1');
  });

  it('没有摘要就不编正文，没有时长就不写用时', () => {
    expect(planNotification(generation({ detail: null }))?.body).toBe(null);
    expect(planNotification(generation({ durationMs: null }))?.title).not.toContain('秒');
  });

  it('Generation 与 Agent task 两类都已摘掉，只剩 Build complete', () => {
    const specs = UNBACKED_NOTIFICATIONS.map((item) => item.spec);
    expect(specs).not.toContain('Generation complete');
    expect(specs).not.toContain('Agent task complete');
    expect(specs).toEqual(['Build complete']);
  });
});

type AgentTask = Extract<NotifyEvent, { kind: 'agent' }>;

const agentTask = (over: Partial<AgentTask> = {}): NotifyEvent => ({
  kind: 'agent',
  recipientId: 'u-1',
  projectId: 'p-1',
  projectName: '深夜便利店',
  taskId: 't-1',
  planner: 'demo',
  ok: true,
  durationMs: 4200,
  steps: { total: 4, done: 4, failed: 0, skipped: 0 },
  detail: '4/4 步完成 · 门禁挡发布 2 条',
  ...over,
});

describe('Agent task complete（§112 跑完之后的那一类终态）', () => {
  it('步数按真发生过的分档说：全走完写 4/4，没走完只说失败与跳过几步', () => {
    expect(planNotification(agentTask())?.title).toContain('4/4 步');
    const half = planNotification(
      agentTask({ ok: false, steps: { total: 4, done: 2, failed: 1, skipped: 1 }, detail: '门禁那一步炸了' }),
    );
    expect(half?.title).toContain('1 步失败');
    expect(half?.title).toContain('1 步被跳过');
    // "计划里有 4 步"不等于"做了 4 步"：半途失败的那次不许出现 4/4
    expect(half?.title).not.toContain('4/4');
  });

  it('DEMO 规划与模型规划在标题上分开读（§160）；一次作业一个终态', () => {
    const demo = planNotification(agentTask());
    const real = planNotification(agentTask({ planner: 'real', taskId: 't-2' }));
    expect(demo?.title).toContain('DEMO 规划');
    expect(real?.title).toContain('模型规划');
    expect(demo?.dedupeKey).toBe('agent:t-1');
    expect(real?.dedupeKey).toBe('agent:t-2');
  });

  it('失败按 error 级别推、正文就是那句原因；链接指向工作区而不是公开页', () => {
    const failed = planNotification(
      agentTask({ ok: false, detail: 'provider 不可达', steps: { total: 4, done: 0, failed: 1, skipped: 3 } }),
    );
    expect(failed?.level).toBe('error');
    expect(failed?.body).toBe('provider 不可达');
    expect(failed?.link).toBe('/studio/p-1');
    expect(planNotification(agentTask())?.level).toBe('success');
  });

  it('没有摘要就不编正文，没有时长就不写用时', () => {
    expect(planNotification(agentTask({ detail: null }))?.body).toBe(null);
    expect(planNotification(agentTask({ durationMs: null }))?.title).not.toContain('秒');
  });
});
