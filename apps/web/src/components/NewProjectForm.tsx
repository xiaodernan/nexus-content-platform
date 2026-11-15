'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

const COPY: Record<Locale, {
  kinds: readonly { value: string; label: string }[];
  nameLabel: string;
  kindLabel: string;
  inputHint: string;
  submit: string;
  submitting: string;
  submitAria: string;
}> = {
  zh: {
    kinds: [
      { value: 'website', label: '网站' },
      { value: 'webapp', label: 'Web 应用' },
      { value: 'mobile-ui', label: '移动端 UI' },
      { value: 'dashboard', label: '数据面板' },
      { value: 'design-system', label: '设计系统' },
      { value: 'prototype', label: '原型' },
      { value: 'game', label: '游戏' },
      { value: 'interactive-story', label: '互动叙事' },
      { value: '3d-experience', label: '3D 体验' },
    ],
    nameLabel: '项目名称',
    kindLabel: '项目类型',
    inputHint: '项目名称',
    submit: '新建项目',
    submitting: '创建中…',
    submitAria: '新建项目',
  },
  en: {
    kinds: [
      { value: 'website', label: 'Website' },
      { value: 'webapp', label: 'Web app' },
      { value: 'mobile-ui', label: 'Mobile UI' },
      { value: 'dashboard', label: 'Dashboard' },
      { value: 'design-system', label: 'Design system' },
      { value: 'prototype', label: 'Prototype' },
      { value: 'game', label: 'Game' },
      { value: 'interactive-story', label: 'Interactive story' },
      { value: '3d-experience', label: '3D experience' },
    ],
    nameLabel: 'Project name',
    kindLabel: 'Project type',
    inputHint: 'Project name',
    submit: 'New project',
    submitting: 'Creating…',
    submitAria: 'New project',
  },
};

/** 新建项目：只有名称与类型，不生成任何“看起来像 AI 结果”的内容（§159） */
export function NewProjectForm({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
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
    <form onSubmit={(event) => void submit(event)} className="npf-root">
      <input aria-label={c.nameLabel}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={c.inputHint}
        maxLength={80}
        className="npf-input"
        data-project-name-input
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        aria-label={c.kindLabel}
        className="npf-select"
        data-project-kind-select
      >
        {c.kinds.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="npf-submit"
        data-create-project
        aria-label={c.submitAria}
      >
        {busy ? c.submitting : c.submit}
      </button>
      {error ? <p className="npf-error">{error}</p> : null}
    </form>
  );
}
