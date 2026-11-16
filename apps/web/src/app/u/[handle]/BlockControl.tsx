'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

type Kind = 'block' | 'mute';

/** 双语：每行文案按 cookie locale 选（不夹杂） */
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
      note: 'Their content and notifications no longer appear on your side, and their comments are filtered out — but they can still leave you messages; muting is not a ban.',
    },
    block: {
      button: 'Block',
      done: 'Blocked',
      note: 'In addition to muting, you cannot comment, like, follow or remix each other; existing follow relationships are removed.',
    },
  },
};

const UI = {
  zh: { upgrade: '升级为拉黑', clear: '解除', failed: (status: number) => `没做成（HTTP ${status}）` },
  en: { upgrade: 'Escalate to block', clear: 'Undo', failed: (status: number) => `Did not happen (HTTP ${status})` },
} as const;

/**
 * §132 主页上的自助治理。两个按钮都摆在明面上而不是收进一个菜单：
 * 两者的区别（"他还能不能碰到我"）正是使用者做这个决定时唯一需要的信息，
 * 藏起来就等于让人凭感觉选一个更重的动作。
 */
export function BlockControl({ handle, initial, locale = 'zh' }: { handle: string; initial: Kind | null; locale?: Locale }) {
  const copy = COPY[locale];
  const ui = UI[locale];
  const router = useRouter();
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
        setNotice(data?.message ?? data?.reason ?? ui.failed(res.status));
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
              {copy[kind].done} @{handle}
            </span>
            {kind === 'mute' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void send('POST', { handle, kind: 'block' })}
                className="bc-btn"
                data-block-set="block"
              >
                {ui.upgrade}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void send('DELETE', { handle })}
              className="bc-btn"
              data-block-clear
            >
              {ui.clear}
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
              {copy[k].button} @{handle}
            </button>
          ))
        )}
      </div>
      {kind ? <p className="bc-note" data-block-note>{copy[kind].note}</p> : null}
      {notice ? (
        <p className="bc-error" data-block-notice>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
