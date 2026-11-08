'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

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
}: {
  userId: string;
  handle: string | null;
  role: 'creator' | 'admin';
  self: boolean;
  guest: boolean;
}) {
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
        setNotice(body?.message ?? body?.reason ?? `没做成（HTTP ${res.status}）`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (self) {
    return (
      <span className="text-11 text-fg-3" data-role-self>
        这是你自己，改不了
      </span>
    );
  }
  // 未认领的 guest 不给提权（服务端同样拒）：guest 身份新开一个浏览器就有，提权等于发给匿名会话
  if (guest && next === 'admin') {
    return (
      <span className="text-11 text-fg-3" data-role-guest>
        未认领，先让他注册
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void click()}
        className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
        data-role-set={handle ?? userId}
      >
        {role === 'admin' ? '降为普通' : '提为审核员'}
      </button>
      {notice ? (
        <span className="text-11 text-danger-ink" data-role-notice>
          {notice}
        </span>
      ) : null}
    </span>
  );
}
