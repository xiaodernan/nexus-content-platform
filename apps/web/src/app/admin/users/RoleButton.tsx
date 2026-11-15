'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

const COPY = {
  zh: {
    failedNotice: (status: number) => `没做成（HTTP ${status}）`,
    selfBlock: '这是你自己，改不了',
    guestBlock: '未认领，先让他注册',
    demote: '降为普通',
    promote: '提为审核员',
  },
  en: {
    failedNotice: (status: number) => `Did not go through (HTTP ${status})`,
    selfBlock: 'That’s you — cannot change',
    guestBlock: 'Not claimed yet — ask them to sign up first',
    demote: 'Demote to creator',
    promote: 'Promote to admin',
  },
} as const;

/**
 * §131 的提权入口。按钮直接按当前角色给一个动作（creator → 提为审核员，admin → 降为普通），
 * 而不是放一个下拉框让人"选一个角色保存"——后者容易误点成把自己降权。
 * 规则都在服务端（不能改自己、最后一个 admin 不能降），这里只负责把被拒的原因显示出来。
 */
export function RoleButton({
  userId,
  handle,
  role,
  self,
  guest,
  locale = 'zh',
}: {
  userId: string;
  handle: string | null;
  role: 'creator' | 'admin';
  self: boolean;
  guest: boolean;
  locale?: Locale;
}) {
  const c = COPY[locale];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const next = role === 'admin' ? 'creator' : 'admin';

  const click = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ role: next }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; reason?: string } | null;
      if (!res.ok) {
        setNotice(body?.message ?? body?.reason ?? c.failedNotice(res.status));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (self) {
    return (
      <span className="adm-capNote" data-role-self>
        {c.selfBlock}
      </span>
    );
  }
  // 未认领的 guest 不给提权（服务端同样拒）：guest 身份新开一个浏览器就有，提权等于发给匿名会话
  if (guest && next === 'admin') {
    return (
      <span className="adm-capNote" data-role-guest>
        {c.guestBlock}
      </span>
    );
  }
  return (
    <span className="am-triageRow">
      <button
        type="button"
        disabled={busy}
        onClick={() => void click()}
        className="am-btn"
        data-role-set={handle ?? userId}
      >
        {role === 'admin' ? c.demote : c.promote}
      </button>
      {notice ? (
        <span className="am-triageError" data-role-notice>
          {notice}
        </span>
      ) : null}
    </span>
  );
}
