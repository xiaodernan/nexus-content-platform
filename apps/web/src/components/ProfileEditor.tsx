'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §60：改自己的简介。公开主页上就是这一段，所以它会先过一遍发布机检的红线词表 ——
 * 命中时界面显示"没保存"和原因，而不是悄悄存下来再说"已更新"。
 */
export function ProfileEditor({ initialBio }: { initialBio: string | null }) {
  const router = useRouter();
  const [bio, setBio] = useState(initialBio ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ bio }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; issues?: string[]; bio?: string | null } | null;
      if (!res.ok) {
        setNotice(`没保存：${body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`}`);
        return;
      }
      setNotice('简介已更新');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pe-root" data-profile-editor>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="一句话介绍你自己（会公开在 /u/你的地址 上）"
        className="pe-input"
        data-bio-input
      />
      <div className="pe-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="pe-saveBtn"
          data-bio-save
        >
          {busy ? '保存中…' : '保存简介'}
        </button>
        {notice ? (
          <span className="pe-hint" data-bio-notice>
            {notice}
          </span>
        ) : null}
      </div>
    </div>
  );
}
