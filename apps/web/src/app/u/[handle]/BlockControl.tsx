'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

type Kind = 'block' | 'mute';

/**
 * §132 双档治理文案（2026-11-15 双语试玩面 wave 之一）：zh 优先、en 逐字对应。
 * 两个动作的区别正是本页要给按钮旁边的那句话——藏起来等于让人凭感觉选动作。
 */
const COPY: Record<Locale, Record<Kind, { button: string; done: string; note: string }>> = {
  zh: {
    mute: {
      button: '屏蔽',
      done: '已屏蔽',
      note: '他的内容与通知不再出现在你这边，评论列表里也会滤掉他——但他照样能给你留言，屏蔽不是禁言。',
    },
    block: {
      button: '拉黑',
      done: '已拉黑',
      note: '除了屏蔽的那些，你们互相都不能评论、点赞、关注和改编；已有的关注关系一并解除。',
    },
  },
  en: {
    mute: {
      button: 'Mute',
      done: 'Muted',
      note: 'Their content and notifications no longer reach you, and their comments are filtered out of your lists — but they can still leave you comments; muting is not banning.',
    },
    block: {
      button: 'Block',
      done: 'Blocked',
      note: 'Beyond muting’s effects, neither of you can comment, like, follow or remix anymore, and any existing follows between you are severed.',
    },
  },
};

const FEED: Record<Locale, { upgradeToBlock: string; clear: string; failed: (status: number) => string }> = {
  zh: {
    upgradeToBlock: '升级为拉黑',
    clear: '解除',
    failed: (status) => `没做成（HTTP ${status}）`,
  },
  en: {
    upgradeToBlock: 'Upgrade to block',
    clear: 'Lift',
    failed: (status) => `Could not do that (HTTP ${status})`,
  },
};

/**
 * §132 主页上的自助治理。两个按钮都摆在明面上而不是收进一个菜单：
 * 两者的区别（"他还能不能碰到我"）正是使用者做这个决定时唯一需要的信息，
 * 藏起来就等于让人凭感觉选一个更重的动作。
 */
export function BlockControl({ handle, initial, locale = 'zh' }: { handle: string; initial: Kind | null; locale?: Locale }) {
  const router = useRouter();
  const c = COPY[locale];
  const feed = FEED[locale];
  const [kind, setKind] = useState<Kind | null>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const send = async (method: 'POST' | 'DELETE', body: Record<string, unknown>): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/blocks', {
        method,
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; blocked?: boolean; reason?: string; message?: string }
        | null;
      if (data?.ok) {
        setKind(typeof body.kind === 'string' ? (body.kind as Kind) : null);
        // 屏蔽名单影响发现页与作品页上已经渲染的内容，不刷新就还是旧的一份
        router.refresh();
      } else {
        setNotice(data?.message ?? data?.reason ?? feed.failed(res.status));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bc-root" data-block-control>
      <div className="bc-row">
        {kind ? (
          <>
            <span className="bc-hint11" data-block-state={kind}>
              {c[kind].done} @{handle}
            </span>
            {kind === 'mute' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void send('POST', { handle, kind: 'block' })}
                className="bc-btn"
                data-block-set="block"
              >
                {feed.upgradeToBlock}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void send('DELETE', { handle })}
              className="bc-btn"
              data-block-clear
            >
              {feed.clear}
            </button>
          </>
        ) : (
          (['mute', 'block'] as const).map((k) => (
            <button
              key={k}
              type="button"
              disabled={busy}
              onClick={() => void send('POST', { handle, kind: k })}
              className="bc-btn"
              data-block-set={k}
            >
              {c[k].button} @{handle}
            </button>
          ))
        )}
      </div>
      {kind ? <p className="bc-note" data-block-note>{c[kind].note}</p> : null}
      {notice ? (
        <p className="bc-error" data-block-notice>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
