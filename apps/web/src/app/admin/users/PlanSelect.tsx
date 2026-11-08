'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §133 的改档位入口。与 `RoleButton` 的两处不同，都是刻意的：
 * - 用下拉框而不是一个按钮。档位有五档（角色只有两个方向），按钮会变成一排；
 *   误点的代价也小得多——改档位是发额度，不是发权限（ADR-0019）。
 * - 下拉框改了**不会立刻生效**：必须再点一次「改档位」。档位决定这个账号每月能发多少额度
 *   与能存多少字节，静默生效会让人以为自己只是点开了列表。
 *
 * 判定全在服务端（只有审核员能改、档位必须是五档之一、允许改自己），这里只显示被拒的原因。
 * 页面上不许出现"升级""购买"这类词：支付没接，这不是购买流程（§159）。
 */
const PLANS = ['free', 'pro', 'creator', 'studio', 'enterprise'] as const;
type Plan = (typeof PLANS)[number];
const LABELS: Record<Plan, string> = {
  free: 'Free',
  pro: 'Pro',
  creator: 'Creator',
  studio: 'Studio',
  enterprise: 'Enterprise',
};

export function PlanSelect({
  userId,
  plan,
  self,
  handle,
}: {
  userId: string;
  plan: Plan;
  self: boolean;
  handle: string | null;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<Plan>(plan);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (choice === plan) {
      setNotice('还是这一档，没有改动');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ plan: choice }),
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

  return (
    <span className="flex items-center gap-2">
      <select
        value={choice}
        disabled={busy}
        onChange={(event) => setChoice(event.target.value as Plan)}
        aria-label="该用户的订阅档位"
        className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
        data-plan-select={handle ?? userId}
      >
        {PLANS.map((key) => (
          <option key={key} value={key}>
            {LABELS[key]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
        data-plan-set={handle ?? userId}
      >
        改档位
      </button>
      {self ? <span className="text-11 text-fg-3">（你自己）</span> : null}
      {notice ? (
        <span className="text-11 text-danger-ink" data-plan-notice>
          {notice}
        </span>
      ) : null}
    </span>
  );
}