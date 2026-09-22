'use client';

import { useMemo, useState } from 'react';
import { analyzeHealth } from '@nexus/design-model';
import { cn } from '@/lib/cn';
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
 */

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
  const health = useMemo(
    () => (state.document ? analyzeHealth(state.document) : null),
    [state.document],
  );

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

          {state.publishError ? (
            <p className="mb-2 text-11 text-danger" data-publish-error>
              {state.publishError}
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
                {publication.moderation === 'pending' ? ' 内容审核管线尚未接入。' : ''}
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={state.publishBusy}
              onClick={() => void studio.publish(visibility)}
              data-publish-submit
              className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-fg-1 disabled:opacity-50"
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
