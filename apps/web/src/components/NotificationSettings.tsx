'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
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
  marketplace_report: '举报结论',
  team: '成员加入',
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

  if (!settings) return <p className="ns-loading">加载设置中…</p>;

  return (
    <section className="ns-card" data-notification-settings>
      <h2 className="ns-title">通知偏好（§164）</h2>
      <p className="ns-desc">关掉某一类后，那类事件不会再往收件箱里插行。</p>
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
