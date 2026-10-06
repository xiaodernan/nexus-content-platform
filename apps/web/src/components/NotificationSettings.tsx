'use client';

import { useEffect, useState } from 'react';
import type { NotificationKind } from '@/lib/notify-plan';
import { NOTIFICATION_KINDS } from '@/lib/notify-plan';

const KIND_LABEL: Record<NotificationKind, string> = {
  publish: '发布完成',
  moderation: '审核结论',
  like: '点赞',
  comment: '评论',
  follow: '关注',
  remix: '改编',
  generation: '生成完成',
  agent: 'Agent 任务',
  approval: '审批作废',
  build: '导出完成',
};

export function NotificationSettings() {
  const [settings, setSettings] = useState<Record<NotificationKind, boolean> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/notifications/settings')
      .then((r) => r.json())
      .then((data) => setSettings(data.settings))
      .catch(() => {});
  }, []);

  async function toggle(kind: NotificationKind, enabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, enabled }),
      });
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <p className="text-12 text-fg-3">加载设置中…</p>;

  return (
    <section className="mt-6 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-4" data-notification-settings>
      <h2 className="text-12 font-semibold text-fg-1">通知偏好（§164）</h2>
      <p className="mt-1 text-11 text-fg-3">关掉某一类后，那类事件不会再往收件箱里插行。</p>
      <ul className="mt-3 space-y-2">
        {(Object.keys(NOTIFICATION_KINDS) as NotificationKind[]).map((kind) => (
          <li key={kind} className="flex items-center justify-between" data-notification-setting={kind}>
            <span className="text-12 text-fg-2">{KIND_LABEL[kind]}</span>
            <button
              onClick={() => toggle(kind, !settings[kind])}
              disabled={saving}
              className={`rounded px-2 py-1 text-11 ${
                settings[kind] ? 'bg-accent-2 text-white' : 'bg-bg-2 text-fg-3'
              }`}
              aria-label={`${KIND_LABEL[kind]}：${settings[kind] ? '开启' : '关闭'}`}
            >
              {settings[kind] ? '开' : '关'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
