'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

const KINDS: { value: string; label: string }[] = [
  { value: 'website', label: '网站' },
  { value: 'webapp', label: 'Web 应用' },
  { value: 'mobile-ui', label: '移动端 UI' },
  { value: 'dashboard', label: '数据面板' },
  { value: 'design-system', label: '设计系统' },
  { value: 'prototype', label: '原型' },
  { value: 'game', label: '游戏' },
  { value: 'interactive-story', label: '互动叙事' },
  { value: '3d-experience', label: '3D 体验' },
];

/** 新建项目：只有名称与类型，不生成任何"看起来像 AI 结果"的内容（§159） */
export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('website');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ name: name.trim(), kind }),
      });
      const body = (await res.json().catch(() => null)) as { projectId?: string; issues?: string[]; message?: string } | null;
      if (!res.ok || !body?.projectId) {
        throw new Error(body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`);
      }
      router.push(`/studio/${body.projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-center gap-[var(--nexus-space-2)]">
      <input aria-label="项目名称"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="项目名称"
        maxLength={80}
        className="min-w-[180px] flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-[var(--nexus-space-3)] py-2 text-14 placeholder:text-fg-3"
        data-project-name-input
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        aria-label="项目类型"
        className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-2 text-13"
        data-project-kind-select
      >
        {KINDS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--nexus-color-brand)] px-5 py-2 text-14 font-semibold text-[var(--nexus-color-accent-fg)] transition-all duration-150 hover:shadow-[0_0_30px_rgb(91_108_255/0.45)] disabled:opacity-40 disabled:hover:shadow-none"
        data-create-project
      >
        {busy ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--nexus-color-accent-fg)] border-t-transparent" aria-hidden="true" />
            创建中…
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            新建项目
          </>
        )}
      </button>
      {error ? (
        <p className="w-full rounded-lg border border-[var(--nexus-color-danger)]/30 bg-danger/10 px-3 py-2 text-12 text-danger-ink" data-create-project-error>
          {error}
        </p>
      ) : null}
    </form>
  );
}
