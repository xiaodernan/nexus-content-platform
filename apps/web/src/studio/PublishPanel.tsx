'use client';

import { useMemo, useState } from 'react';
import { analyzeHealth } from '@nexus/design-model';
import { cn } from '@/lib/cn';
import { useRealtime } from '@/lib/useRealtime';
import type { Visibility } from '@/server/domain/publish';
import { HealthPanel } from './HealthPanel';
import { studio, useStudioReady } from './store';

/**
 * §57 Publish：选 Public / Unlisted / Private，然后如实报告门禁。
 *
 * §179 的门禁就是 `analyzeHealth`，Studio 实时看的那份和服务器挡发布用的是同一个函数，
 * 所以这里的数字不是"发布失败后才回传的残骸"，而是随时能读到的当前状态。
 * 测不了的（性能实测、视觉回归、AI 评审）明确落在"未运行"里——
 * 一条都没检查却显示"门禁通过"就是假绿（§159）。
 *
 * §163：面板还订着项目频道，把发布链路上推来的 `build.status` / `preview.status` 画成两行实时读数。
 * 这两行只在**真的收到过事件**时出现（刚进 Studio 时不显示"构建：空闲"那种没来源的状态）；
 * 权威状态依旧是上面那块从库里读出来的发布结果，实时只是让它快一点跟上。
 */

const BUILD_LABEL = { idle: '空闲', building: '构建中', ok: '成功', failed: '失败' } as const;
const PREVIEW_LABEL = { idle: '公开地址已收回', starting: '打开中', ready: '可达', failed: '解析不出来' } as const;

const CHOICES: { id: Visibility; label: string; hint: string }[] = [
  { id: 'public', label: '公开', hint: '任何人拿到链接都能看；将来会出现在探索页' },
  { id: 'unlisted', label: '仅链接', hint: '只有知道链接的人能看，不在任何列表里出现' },
  { id: 'private', label: '私有', hint: '公开链接立刻不可访问，只有你自己能在 Studio 里看' },
];

export function PublishPanel() {
  const state = useStudioReady();
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const publication = state.publication;
  /**
   * §147：弹层合着时不算——打开才需要门禁读数。每次按键都重算 10k 节点的全量体检，
   * 而用户根本没在看它，是纯浪费。打开后的那次计算仍是全量（门禁不能读旧数），
   * 只是不再为闭合状态下的每一次 commit 付账。
   * 布局复用与 HealthRail 同一条纪律：只有 design 视口的几何才能喂给门禁。
   */
  const health = useMemo(() => {
    if (!open || !state.document) return null;
    const layouts =
      state.viewport === 'design' && state.layout && state.page
        ? { [state.page.id]: state.layout }
        : undefined;
    return analyzeHealth(state.document, layouts ? { layouts } : undefined);
  }, [open, state.document, state.layout, state.page, state.viewport]);
  const [build, setBuild] = useState<{ status: keyof typeof BUILD_LABEL; log?: string } | null>(null);
  const [preview, setPreview] = useState<{ status: keyof typeof PREVIEW_LABEL; url?: string } | null>(null);
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
    ? `${publication.visibility === 'private' ? '已停' : '已发布'} v${publication.version}`
    : '发布';

  return (
    <div className="relative" data-publish-root>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-publish-open
        className={cn(
          'rounded-[var(--nexus-radius-sm)] px-[var(--nexus-space-3)] py-1 text-13',
          publication && publication.visibility !== 'private' ? 'bg-brand text-bg-0' : 'border border-[var(--nexus-color-border-strong)] text-fg-2 hover:bg-bg-2',
        )}
      >
        {statusLabel}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[70] max-h-[72vh] w-[440px] overflow-auto rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-strong)] bg-bg-1 p-[var(--nexus-space-3)] shadow-2xl">
          <p className="mb-2 font-mono text-12 text-fg-3">§56 / §57 发布与分享</p>
          <div className="mb-[var(--nexus-space-3)] flex flex-col gap-1">
            {CHOICES.map((choice) => (
              <label key={choice.id} className="flex cursor-pointer items-start gap-2 text-12" data-publish-choice={choice.id}>
                <input
                  type="radio"
                  name="publish-visibility"
                  checked={visibility === choice.id}
                  onChange={() => setVisibility(choice.id)}
                  className="mt-[3px]"
                />
                <span>
                  <span className="text-fg-1">{choice.label}</span>
                  <span className="block text-11 text-fg-3">{choice.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {health ? (
            <div className="mb-[var(--nexus-space-3)] rounded-[var(--nexus-radius-sm)] bg-bg-2 p-2" data-publish-gate>
              <HealthPanel report={health} />
              {visibility === 'private' ? (
                <p className="mt-1 text-11 text-fg-3" data-publish-private-note>
                  切成私有是下架动作：即使门禁没过也允许，把链接收回来永远比挡住它安全。
                </p>
              ) : null}
            </div>
          ) : null}

          {state.publishScan ? (
            <div className="mb-[var(--nexus-space-3)] rounded-[var(--nexus-radius-sm)] bg-bg-2 p-2" data-publish-scan>
              <p className="text-11 text-fg-3" data-scan-decision={state.publishScan.decision}>
                {state.publishScan.decision === 'clear'
                  ? `机检（${state.publishScan.rulesVersion}）：这次没命中规则。`
                  : state.publishScan.decision === 'review'
                    ? `机检（${state.publishScan.rulesVersion}）：${state.publishScan.findings.length} 项挂人工复核，页面已发出去。`
                    : `机检（${state.publishScan.rulesVersion}）：命中硬红线，这次没有发出去。`}
              </p>
              <p className="text-11 text-fg-3">
                扫过：{state.publishScan.scanned.pages} 页 / {state.publishScan.scanned.textNodes} 段可见文字 /{' '}
                {state.publishScan.scanned.assetRefs} 个引用资产
              </p>
              {state.publishScan.findings.length ? (
                <ul className="mt-1 space-y-1">
                  {state.publishScan.findings.map((finding, i) => (
                    <li className="text-11 text-fg-2" data-scan-finding={finding.rule} key={`${finding.rule}-${i}`}>
                      <span className="font-mono text-fg-3">{finding.rule}</span> · {finding.why}
                      <span className="block text-fg-3">
                        位置 {finding.where} · 「{finding.quote}」
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {/* §159：没命中不等于合规。机检覆盖不到的部分必须和结论一起出现 */}
              <ul className="mt-1 space-y-[2px]">
                {state.publishScan.limits.map((limit) => (
                  <li className="text-11 text-fg-3" data-scan-limit key={limit}>
                    · {limit}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {state.publishError ? (
            <p className="mb-2 text-11 text-danger" data-publish-error>
              {state.publishError}
            </p>
          ) : null}

          {build ? (
            <p className="mb-2 text-11 text-fg-3" data-publish-build={build.status}>
              构建：{BUILD_LABEL[build.status]}
              {build.log ? ` · ${build.log}` : ''}
              {realtime.state === 'closed' ? '（实时已断开，以刷新后的数据为准）' : ''}
            </p>
          ) : null}
          {preview ? (
            <p className="mb-2 text-11 text-fg-3" data-publish-preview={preview.status}>
              预览：{PREVIEW_LABEL[preview.status]}
              {/* 路径是服务端给的那一条，不在这里用 origin 拼一遍——拼出来的和真能打开的那个可能不是一回事 */}
              {preview.url ? ` · ${preview.url}` : ''}
            </p>
          ) : null}

          {publication && publication.visibility !== 'private' ? (
            <div className="mb-[var(--nexus-space-3)] rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2" data-publish-result>
              <p className="text-11 text-fg-3">当前公开地址（第 {publication.version} 版）</p>
              <a
                href={publication.path}
                target="_blank"
                rel="noreferrer"
                className="block truncate font-mono text-12 text-fg-1 underline"
                data-publish-url
              >
                {typeof window !== 'undefined' ? `${window.location.origin}${publication.path}` : publication.path}
              </a>
              <p className="mt-1 text-11 text-fg-3">
                发布的是那一刻的快照：之后在 Studio 里改的东西要点"发布"才会换出去。
                {' '}
                {publication.moderation === 'pending'
                  ? '人工审核还没看过这一版（机检不能替它下结论）。'
                  : publication.moderation === 'approved'
                    ? '人工审核：已放行。'
                    : publication.moderation === 'rejected'
                      ? '人工审核：已拒绝，公开地址不再可访问。'
                      : `人工审核状态：${publication.moderation}。`}
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={state.publishBusy}
              onClick={() => void studio.publish(visibility)}
              data-publish-submit
              className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-accent-fg disabled:opacity-50"
            >
              {state.publishBusy ? '发布中…' : publication ? '重新发布' : '发布'}
            </button>
            {publication ? (
              <button
                type="button"
                disabled={state.publishBusy}
                onClick={() => void studio.unpublish()}
                data-publish-off
                className="rounded-[var(--nexus-radius-sm)] px-3 py-1 text-12 text-fg-3 hover:bg-bg-2"
              >
                取消发布
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-11 text-fg-3 hover:text-fg-1"
            >
              收起
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
