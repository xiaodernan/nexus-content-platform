'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

type Kind = 'block' | 'mute';

const COPY: Record<Kind, { button: string; done: string; note: string }> = {
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
};

/**
 * §132 主页上的自助治理。两个按钮都摆在明面上而不是收进一个菜单：
 * 两者的区别（"他还能不能碰到我"）正是使用者做这个决定时唯一需要的信息，
 * 藏起来就等于让人凭感觉选一个更重的动作。
 */
export function BlockControl({ handle, initial }: { handle: string; initial: Kind | null }) {
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
        setNotice(data?.message ?? data?.reason ?? `没做成（HTTP ${res.status}）`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1" data-block-control>
      <div className="flex items-center gap-2">
        {kind ? (
          <>
            <span className="text-11 text-fg-3" data-block-state={kind}>
              {COPY[kind].done} @{handle}
            </span>
            {kind === 'mute' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void send('POST', { handle, kind: 'block' })}
                className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
                data-block-set="block"
              >
                升级为拉黑
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void send('DELETE', { handle })}
              className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
              data-block-clear
            >
              解除
            </button>
          </>
        ) : (
          (['mute', 'block'] as const).map((k) => (
            <button
              key={k}
              type="button"
              disabled={busy}
              onClick={() => void send('POST', { handle, kind: k })}
              className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
              data-block-set={k}
            >
              {COPY[k].button} @{handle}
            </button>
          ))
        )}
      </div>
      {kind ? <p className="max-w-[22rem] text-right text-11 text-fg-3" data-block-note>{COPY[kind].note}</p> : null}
      {notice ? (
        <p className="text-11 text-danger-ink" data-block-notice>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
