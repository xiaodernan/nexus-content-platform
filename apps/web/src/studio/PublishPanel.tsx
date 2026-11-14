'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import type { HealthJob } from '@/lib/health-job';
import { useRealtime } from '@/lib/useRealtime';
import type { Visibility } from '@/server/domain/publish';
import type { Locale } from '@/lib/i18n';
import { HealthPanel } from './HealthPanel';
import { useHealthReport } from './health-client';
import { studio, useStudioReady } from './store';
import { usePopoverDismiss } from './use-popover-dismiss';

/**
 * §57 Publish：选 Public / Unlisted / Public，然后如实报告门禁。
 *
 * §179 的门禁就是 `analyzeHealth`，Studio 实时看的那份和服务器挡发布用的是同一个函数，
 * 所以这里的数字不是"发布失败后才回传的残骸"，而是随时能读到的当前状态。
 * 测不了的（性能实测、视觉回归、AI 评审）明确落在"未运行"里——
 * 一条都没检查却显示"门禁通过"就是假绿（§159）。
 *
 * §163：面板还订着项目频道，把发布链路上推来的 `build.status` / `preview.status` 画成两行实时读数。
 * 这两行只在**真的收到过事件**时出现（刚进 Studio 时不显示"构建：空闲"那种没来源的状态）；
 * 权威状态依旧是上面那块从库里读出来的发布结果，实时只是让它快一点跟上。
 * 双语（v739）：locale 由 StudioShell 透传；zh 原文原样保留，en 逐句对应。
 */

const COPY = {
  zh: {
    stopped: '已停',
    published: '已发布',
    publish: '发布',
    buildIdle: '空闲',
    buildBuilding: '构建中',
    buildOk: '成功',
    buildFailed: '失败',
    previewIdlePub: '公开地址已收回',
    previewStarting: '打开中',
    previewReady: '可达',
    previewFailed: '解析不出来',
    choices: [
      { id: 'public', label: '公开', hint: '任何人拿到链接都能看；将来会出现在探索页' },
      { id: 'unlisted', label: '仅链接', hint: '只有知道链接的人能看，不在任何列表里出现' },
      { id: 'private', label: '私有', hint: '公开链接立刻不可访问，只有你自己能在 Studio 里看' },
    ] as { id: Visibility; label: string; hint: string }[],
    ariaLabel: '发布与分享',
    sectionTitle: '§56 / §57 发布与分享',
    privateNote: '切成私有是下架动作：即使门禁没过也允许，把链接收回来永远比挡住它安全。',
    gatePending: '正在后台算门禁…',
    realtimeClosed: '（实时已断开，以刷新后的数据为准）',
    buildLabel: '构建：',
    previewLabel: '预览：',
    currentAddr: (v: number) => `当前公开地址（第 ${v} 版）`,
    publishNote: '发布的是那一刻的快照：之后在 Studio 里改的东西要点"发布"才会换出去。 ',
    moderationPending: '人工审核还没看过这一版（机检不能替它下结论）。',
    moderationApproved: '人工审核：已放行。',
    moderationRejected: '人工审核：已拒绝，公开地址不再可访问。',
    moderationOther: (m: string) => `人工审核状态：${m}。`,
    scanNoRule: (v: string) => `机检（${v}）：这次没命中规则。`,
    scanReview: (v: string, n: number) => `机检（${v}）：${n} 项挂人工复核，页面已发出去。`,
    scanRedline: (v: string) => `机检（${v}）：命中硬红线，这次没有发出去。`,
    scanScanned: (pages: number, textNodes: number, assetRefs: number) =>
      `扫过：${pages} 页 / ${textNodes} 段可见文字 / ${assetRefs} 个引用资产`,
    scanAt: (where: string, quote: string) => `位置 ${where} ·「${quote}」`,
    unpublishing: '取消发布中：正在把公开地址收回来；请求没回来之前访客仍能打开。',
    publishing: '发布中：先把这一版存成快照，再过门禁与机检，最后换公开地址。',
    publishingBtn: '发布中…',
    republish: '重新发布',
    unpublishBtn: '取消发布',
    collapse: '收起',
    preflightBlocked: (first: string, extra: number) =>
      `预检挡下：${first}${extra > 0 ? `（另 ${extra} 项）` : ''}`,
    preflightWarn: (first: string) => `预检：可以发布，但 ${first}`,
    preflightClear: '预检全绿：名额、门禁、机检都放行了',
    preflightUnknown: '预检还没跑完（或跑不成）——这不是绿灯，是还没有答案',
    aiReal: (image: string, video: string) => `文本链路：真实生成就绪（image=${image} · video=${video}）`,
    aiDemo: '文本链路：DEMO（ai-service 未就绪；内容仍由本地确定性 Mock 组合装）',
  },
  en: {
    stopped: 'Off',
    published: 'Published',
    publish: 'Publish',
    buildIdle: 'idle',
    buildBuilding: 'building',
    buildOk: 'ok',
    buildFailed: 'failed',
    previewIdlePub: 'public URL revoked',
    previewStarting: 'opening',
    previewReady: 'reachable',
    previewFailed: "can't resolve",
    choices: [
      { id: 'public', label: 'Public', hint: 'Anyone with the link can view; it will show up on Discover eventually' },
      { id: 'unlisted', label: 'Unlisted', hint: 'Only people with the link can view; it appears in no list' },
      { id: 'private', label: 'Private', hint: 'The public link stops working immediately; only you can view it in Studio' },
    ] as { id: Visibility; label: string; hint: string }[],
    ariaLabel: 'Publish and share',
    sectionTitle: '§56 / §57 Publish & share',
    privateNote: 'Switching to private is a takedown: allowed even when the gate fails — pulling the link back is always safer than blocking it.',
    gatePending: 'Computing the gate in the background…',
    realtimeClosed: '(realtime disconnected — the refreshed data wins)',
    buildLabel: 'Build: ',
    previewLabel: 'Preview: ',
    currentAddr: (v: number) => `Current public address (v${v})`,
    publishNote: 'Publishing stores the snapshot at that moment: anything you edit in Studio afterwards needs “Publish” to go out. ',
    moderationPending: 'Human review has not seen this version yet (machine checks cannot decide for it).',
    moderationApproved: 'Human review: approved.',
    moderationRejected: 'Human review: rejected — the public address is no longer reachable.',
    moderationOther: (m: string) => `Human review status: ${m}.`,
    scanNoRule: (v: string) => `Machine check (${v}): no rule hit this time.`,
    scanReview: (v: string, n: number) => `Machine check (${v}): ${n} flagged for human review; the page went out.`,
    scanRedline: (v: string) => `Machine check (${v}): hard red line hit — nothing went out.`,
    scanScanned: (pages: number, textNodes: number, assetRefs: number) =>
      `Scanned: ${pages} pages / ${textNodes} visible text nodes / ${assetRefs} asset refs`,
    scanAt: (where: string, quote: string) => `at ${where} · “${quote}”`,
    unpublishing: 'Unpublishing: pulling the public address; visitors can still open it until the request returns.',
    publishing: 'Publishing: snapshot this version first, then the gate & machine check, then swap the public address.',
    publishingBtn: 'Publishing…',
    republish: 'Republish',
    unpublishBtn: 'Unpublish',
    collapse: 'Collapse',
    preflightBlocked: (first: string, extra: number) =>
      `Preflight blocked: ${first}${extra > 0 ? ` (and ${extra} more)` : ''}`,
    preflightWarn: (first: string) => `Preflight: publishable, but ${first}`,
    preflightClear: 'Preflight is all green: quota, gate and machine check all clear',
    preflightUnknown: "Preflight hasn't finished (or can't run) — that's not a green light, it's no answer yet.",
    aiReal: (image: string, video: string) => `Text chain: real generation ready (image=${image} · video=${video})`,
    aiDemo: 'Text chain: DEMO (ai-service not ready; content still comes from the local deterministic mock)',
  },
} as const;

/** 弹层与它那颗触发键的绑定：`aria-controls` 指的必须是真存在的 id，所以两边共用这一个常量。 */
const PANEL_ID = 'nexus-publish-panel';
/**
 * §85（第三十七片）：切成私有那句后果说明只在私下出现，读屏用户先读到的是选项本身。
 * 用 `aria-describedby` 把说明挂到那颗单选上；id 只在说明真的渲染时存在，不能留一个悬空引用。
 */
const PRIVATE_NOTE_ID = 'nexus-publish-private-note';

export function PublishPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const BUILD_LABEL = { idle: c.buildIdle, building: c.buildBuilding, ok: c.buildOk, failed: c.buildFailed } as const;
  const PREVIEW_LABEL = { idle: c.previewIdlePub, starting: c.previewStarting, ready: c.previewReady, failed: c.previewFailed } as const;
  const state = useStudioReady();
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const { rootRef, triggerRef } = usePopoverDismiss(open, setOpen);
  const publication = state.publication;
  /**
   * 发布预检（§56）：向服务器要回 "按下发布会发生什么"——名额 / 门禁 / 机检，
   * 与真的 publishProject 共用同一批判定函数；本地 HealthReport 只够画门禁，
   * 这个回执补齐名额与机检两格。只读；面板关着不发请求（与门禁同一条纪律）。
   */
  const [preflight, setPreflight] = useState<{
    ok: boolean;
    blockers: string[];
    warnings: string[];
    aiReadiness?: { text: string; image: string; video: string; live: boolean };
  } | null>(null);
  const projectIdForPreflight = state.document?.id ?? null;
  useEffect(() => {
    if (!open || !projectIdForPreflight) return undefined;
    let cancelled = false;
    setPreflight(null);
    fetch(`/api/projects/${projectIdForPreflight}/publish-preflight?visibility=${visibility}`)
      .then(async (r) =>
        r.ok
          ? ((await r.json()) as {
              ok: boolean;
              blockers: string[];
              warnings: string[];
              facts?: { aiReadiness?: { text: string; image: string; video: string; live: boolean } };
            })
          : null,
      )
      .then((v) => {
        if (!cancelled && v) setPreflight({ ...v, aiReadiness: v.facts?.aiReadiness });
      })
      .catch(() => {
        // 预检没跑成就老实说"没跑成"——空白比假绿（§159）好
        if (!cancelled) setPreflight(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectIdForPreflight, visibility]);
  /**
   * §147：弹层合着时不算——打开才需要门禁读数。每次按键都重算 10k 节点的全量体检，
   * 而用户根本没在看它，是纯浪费。打开后的那次计算仍是全量（门禁不能读旧数），
   * 只是不再为闭合状态下的每一次 commit 付账。
   * 布局复用与 HealthRail 同一条纪律：只有 design 视口的几何才能喂给门禁。
   * 2026-10-29 起这份计算交给 worker（`health-client.ts`）：弹层打开后先在后台算，
   * 算完才画 `data-publish-gate`；这也意味着那一刻之前**没有**门禁读数可看，
   * 所以中间那行"正在算"必须画出来，不能空着让人以为门禁是空的。
   */
  const job = useMemo<HealthJob | null>(() => {
    if (!open) return null;
    const layouts =
      state.viewport === 'design' && state.layout && state.page
        ? { [state.page.id]: state.layout }
        : undefined;
    return { document: state.document, layouts };
  }, [open, state.document, state.layout, state.page, state.viewport]);
  const { reading: health, pending: healthPending } = useHealthReport(job, open);
  const [build, setBuild] = useState<{ status: keyof typeof BUILD_LABEL; log?: string } | null>(null);
  const [preview, setPreview] = useState<{ status: keyof typeof PREVIEW_LABEL; url?: string } | null>(null);
  /**
   * §85（第四十二片）：取消发布与发布共用同一个 `publishBusy`，但那行忙态原来只有发布口径
   * （"存快照、过门禁、换公开地址"）——取消发布根本不存快照。照着发布那句话念，
   * 读屏用户会把"正在撤下"听成"正在发出去"。这里只区分播报文案，不动状态机。
   */
  const [unpublishing, setUnpublishing] = useState(false);
  const realtime = useRealtime({
    projectId: state.projectId,
    enabled: Boolean(state.projectId),
    onEvent: (event) => {
      if (event.projectId !== state.projectId) return;
      if (event.type === 'build.status') setBuild({ status: event.status, log: event.log });
      if (event.type === 'preview.status') setPreview({ status: event.status, url: event.url });
    },
  });

  const statusLabel = publication
    ? `${publication.visibility === 'private' ? c.stopped : c.published} v${publication.version}`
    : c.publish;

  return (
    <div ref={rootRef} className="pb-rel" data-publish-root>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? PANEL_ID : undefined}
        data-publish-open
        className={cn('pb-publishBtn', publication && publication.visibility !== 'private' ? 'pb-publishLive' : 'pb-publishIdle')}
      >
        {statusLabel}
      </button>

      {open ? (
        <div
          id={PANEL_ID}
          role="region"
          aria-label={c.ariaLabel}
          data-publish-panel
          className="pb-popPanel"
        >
          <p className="pb-monoMt2">{c.sectionTitle}</p>
          <div className="pb-col">
            {c.choices.map((choice) => (
              <label key={choice.id} className="pb-pickRow" data-publish-choice={choice.id}>
                <input
                  type="radio"
                  name="publish-visibility"
                  checked={visibility === choice.id}
                  onChange={() => setVisibility(choice.id)}
                  aria-describedby={visibility === 'private' && health && choice.id === 'private' ? PRIVATE_NOTE_ID : undefined}
                  className="pb-mt3px"
                />
                <span>
                  <span className="pb-ink1">{choice.label}</span>
                  <span className="pb-faintBlock">{choice.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {health ? (
            <div className="pb-block" data-publish-gate>
              <HealthPanel
                report={health.report}
                healthSource={health.source}
                pending={healthPending}
                seq={health.seq}
                computeMs={health.computeMs}
              />
              {visibility === 'private' ? (
                <p id={PRIVATE_NOTE_ID} className="sb-faintMt1" data-publish-private-note>
                  {c.privateNote}
                </p>
              ) : null}
            </div>
          ) : healthPending ? (
            <p className="pb-faintMb3" data-publish-gate-pending>
              {c.gatePending}
            </p>
          ) : null}

          {state.publishScan ? (
            <div
              className="pb-block"
              role="status"
              data-publish-scan
            >
              <p className="sb-faint11" data-scan-decision={state.publishScan.decision}>
                {state.publishScan.decision === 'clear'
                  ? c.scanNoRule(state.publishScan.rulesVersion)
                  : state.publishScan.decision === 'review'
                    ? c.scanReview(state.publishScan.rulesVersion, state.publishScan.findings.length)
                    : c.scanRedline(state.publishScan.rulesVersion)}
              </p>
              <p className="sb-faint11">
                {c.scanScanned(state.publishScan.scanned.pages, state.publishScan.scanned.textNodes, state.publishScan.scanned.assetRefs)}
              </p>
              {state.publishScan.findings.length ? (
                <ul className="pb-listMt1">
                  {state.publishScan.findings.map((finding, i) => (
                    <li className="sb-ink11" data-scan-finding={finding.rule} key={`${finding.rule}-${i}`}>
                      <span className="sb-monoFaint">{finding.rule}</span> · {finding.why}
                      <span className="pb-faintBlock">
                        {c.scanAt(finding.where, finding.quote)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {/* §159：没命中不等于合规。机检覆盖不到的部分必须和结论一起出现 */}
              <ul className="pb-listMt1">
                {state.publishScan.limits.map((limit) => (
                  <li className="sb-faint11" data-scan-limit key={limit}>
                    · {limit}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {state.publishError ? (
            <p className="pb-dangerMb2" role="alert" data-publish-error>
              {state.publishError}
            </p>
          ) : null}

          {build ? (
            <p className="pb-faint11m2" data-publish-build={build.status}>
              {c.buildLabel}{BUILD_LABEL[build.status]}
              {build.log ? ` · ${build.log}` : ''}
              {realtime.state === 'closed' ? c.realtimeClosed : ''}
            </p>
          ) : null}
          {preview ? (
            <p className="pb-faint11m2" data-publish-preview={preview.status}>
              {c.previewLabel}{PREVIEW_LABEL[preview.status]}
              {/* 路径是服务端给的那一条，不在这里用 origin 拼一遍——拼出来的和真能打开的那个可能不是一回事 */}
              {preview.url ? ` · ${preview.url}` : ''}
            </p>
          ) : null}

          {publication && publication.visibility !== 'private' ? (
            <div
              className="pb-blockBordered"
              role="status"
              data-publish-result
            >
              <p className="sb-faint11">{c.currentAddr(publication.version)}</p>
              <a
                href={publication.path}
                target="_blank"
                rel="noreferrer"
                className="pb-mirrorLink"
                data-publish-url
              >
                {typeof window !== 'undefined' ? `${window.location.origin}${publication.path}` : publication.path}
              </a>
              <p className="sb-faintMt1">
                {c.publishNote}
                {publication.moderation === 'pending'
                  ? c.moderationPending
                  : publication.moderation === 'approved'
                    ? c.moderationApproved
                    : publication.moderation === 'rejected'
                      ? c.moderationRejected
                      : c.moderationOther(publication.moderation)}
              </p>
            </div>
          ) : null}

          {state.publishBusy ? (
            <p
              className="pb-faint11m2"
              role="status"
              data-publish-busy
              data-publish-busy-kind={unpublishing ? 'unpublish' : 'publish'}
            >
              {unpublishing ? c.unpublishing : c.publishing}
            </p>
          ) : null}

          <div className="wd-row2" aria-busy={state.publishBusy}>
            <button
              type="button"
              disabled={state.publishBusy}
              onClick={() => void studio.publish(visibility)}
              data-publish-submit
              className="sb-accentBtn"
            >
              {state.publishBusy ? c.publishingBtn : publication ? c.republish : c.publish}
            </button>
            {publication ? (
              <button
                type="button"
                disabled={state.publishBusy}
                onClick={() => {
                  setUnpublishing(true);
                  void studio.unpublish().finally(() => setUnpublishing(false));
                }}
                data-publish-off
                className="pb-ghostBig"
              >
                {c.unpublishBtn}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="pb-closeBtn"
            >
              {c.collapse}
            </button>
          </div>
          {open && preflight ? (
            <p
              className={
                preflight.blockers.length > 0
                  ? 'pb-note12Danger'
                  : preflight.warnings.length > 0
                    ? 'pb-note12Warn'
                    : 'pb-note12'
              }
              data-publish-preflight-ok={preflight.ok ? 'true' : 'false'}
              data-publish-preflight-outcome={preflight.blockers.length > 0 ? 'blocked' : preflight.warnings.length > 0 ? 'warn' : 'all-clear'}
            >
              {preflight.blockers.length > 0
                ? c.preflightBlocked(preflight.blockers[0]!, preflight.blockers.length - 1)
                : preflight.warnings.length > 0
                  ? c.preflightWarn(preflight.warnings[0]!)
                  : c.preflightClear}
            </p>
          ) : open && projectIdForPreflight ? (
            <p className="pb-note12" data-publish-preflight-outcome="unknown">
              {c.preflightUnknown}
            </p>
          ) : null}
          {open && preflight?.aiReadiness ? (
            <p
              className={preflight.aiReadiness.live ? 'pb-note12Live' : 'pb-note12Warn'}
              data-publish-ai-ready={preflight.aiReadiness.live ? 'real' : 'demo'}
            >
              {preflight.aiReadiness.live
                ? c.aiReal(preflight.aiReadiness.image, preflight.aiReadiness.video)
                : c.aiDemo}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
