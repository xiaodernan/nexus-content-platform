'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';
import type { NotificationKind } from '@/lib/notify-plan';
import { NOTIFICATION_KINDS } from '@/lib/notify-plan';

/** 双语：每行文案按 cookie locale 选（不夹杂） */
const NS_TXT: Record<Locale, {
  kindLabel: Record<NotificationKind, string>;
  loading: string;
  title: string;
  desc: string;
  on: string;
  off: string;
  aria: (label: string, on: boolean) => string;
}> = {
  zh: {
    kindLabel: {
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
    loading: '加载设置中…',
    title: '通知偏好（§164）',
    desc: '关掉某一类后，那类事件不会再往收件箱里插行。',
    on: '开',
    off: '关',
    aria: (label, on) => `${label}：${on ? '开启' : '关闭'}`,
  },
  en: {
    kindLabel: {
      publish: 'Published',
      moderation: 'Moderation verdict',
      like: 'Like',
      comment: 'Comment',
      follow: 'Follow',
      remix: 'Remix',
      generation: 'Generation done',
      agent: 'Agent task',
      approval: 'Approval lapsed',
      build: 'Export done',
      marketplace_report: 'Report verdict',
      team: 'Member joined',
    },
    loading: 'Loading settings…',
    title: 'Notification preferences (§164)',
    desc: 'Turn off a category and that event will never insert a row into your inbox again.',
    on: 'On',
    off: 'Off',
    aria: (label, on) => `${label}: ${on ? 'on' : 'off'}`,
  },
};

export function NotificationSettings({ locale = 'zh' }: { locale?: Locale }) {
  const T = NS_TXT[locale];
  const KIND_LABEL = T.kindLabel;
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

  if (!settings) return <p className="ns-loading">{T.loading}</p>;

  return (
    <section className="ns-card" data-notification-settings>
      <h2 className="ns-title">{T.title}</h2>
      <p className="ns-desc">{T.desc}</p>
      <ul className="ns-list">
        {(Object.keys(NOTIFICATION_KINDS) as NotificationKind[]).map((kind) => (
          <li key={kind} className="ns-row" data-notification-setting={kind}>
            <span className="ns-kindLabel">{KIND_LABEL[kind]}</span>
            <button
              onClick={() => toggle(kind, !settings[kind])}
              disabled={saving}
              className={`ns-toggle ${
                settings[kind] ? 'ns-toggleOn' : 'ns-toggleOff'
              }`}
              aria-label={T.aria(KIND_LABEL[kind], Boolean(settings[kind]))}
            >
              {settings[kind] ? T.on : T.off}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
