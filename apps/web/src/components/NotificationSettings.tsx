'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { NotificationKind } from '@/lib/notify-plan';
import { NOTIFICATION_KINDS } from '@/lib/notify-plan';
import type { Locale } from '@/lib/i18n';

const KIND_LABEL: Record<Locale, Record<NotificationKind, string>> = {
  zh: {
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
    marketplace_report: '举报结论',
    team: '成员加入',
  },
  en: {
    publish: 'Published',
    moderation: 'Review outcome',
    like: 'Like',
    comment: 'Comment',
    follow: 'Follow',
    remix: 'Remix',
    generation: 'Generation done',
    agent: 'Agent task',
    approval: 'Approval expired',
    build: 'Export done',
    marketplace_report: 'Report outcome',
    team: 'Member joined',
  },
};

const COPY: Record<Locale, { title: string; desc: string; loading: string; on: string; off: string; ariaState: (on: boolean) => string }> = {
  zh: {
    title: '通知偏好（§164）',
    desc: '关掉某一类后，那类事件不会再往收件箱里插行。',
    loading: '加载设置中…',
    on: '开',
    off: '关',
    ariaState: (on) => (on ? '开启' : '关闭'),
  },
  en: {
    title: 'Notification preferences (§164)',
    desc: 'Switch a category off and events of that kind stop landing in your inbox.',
    loading: 'Loading preferences…',
    on: 'ON',
    off: 'OFF',
    ariaState: (on) => (on ? 'on' : 'off'),
  },
};

export function NotificationSettings({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const labels = KIND_LABEL[locale];
  const [settings, setSettings] = useState<Record<NotificationKind, boolean> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/notifications/settings')
      .then((r) => r.json())
      .then((data) => setSettings(data.settings))
      .catch(() => {});
  }, []);

  function toggle(kind: NotificationKind, enabled: boolean) {
    setSaving(true);
    void fetch('/api/notifications/settings', {
      method: 'PUT',
      // 服务端这道写端点校验 CSRF（§80 双提交 cookie）；客户端必须把 CSRF 头带上，
      // 否则服务端返回 403、这里读到的 data.settings 是 undefined，界面会"看着没反应"
      headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify({ kind, enabled }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) setSettings(data.settings);
      })
      .finally(() => setSaving(false));
  }

  if (!settings) return <p className="ns-loading">{c.loading}</p>;

  return (
    <section className="ns-card" data-notification-settings>
      <h2 className="ns-title">{c.title}</h2>
      <p className="ns-desc">{c.desc}</p>
      <ul className="ns-list">
        {(Object.keys(NOTIFICATION_KINDS) as NotificationKind[]).map((kind) => (
          <li key={kind} className="ns-row" data-notification-setting={kind}>
            <span className="ns-kindLabel">{labels[kind]}</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings[kind]}
              disabled={saving}
              onClick={() => toggle(kind, !settings[kind])}
              className={`ns-toggle ${settings[kind] ? 'ns-toggleOn' : 'ns-toggleOff'}`}
              aria-label={`${labels[kind]}: ${c.ariaState(settings[kind]!)}`}
              data-notification-switch={kind}
            >
              {settings[kind] ? c.on : c.off}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
