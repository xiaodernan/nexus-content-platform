'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §47 跟角色说话的共用一块：CharacterPanel 的档案编辑器与 /world 的 3D HUD 都渲染它。
 *
 * 回复只有一种来源：ai-service 背后的真模型。409（DEMO MODE）/ 429（太频繁）/
 * 其它失败都把服务器的原话亮出来，这里不编一句假的顶上（§159）。
 * 服务端没有会话线程（§47 进度记录），真实回复落的是 §48 的角色记忆，
 * 界面这段刷新就没了——提示行里写明白，不假装它存了档。
 */
export function CharacterChat({
  projectId,
  characterId,
  characterName,
}: {
  projectId: string;
  characterId: string;
  characterName: string;
}) {
  const [log, setLog] = useState<{ role: 'user' | 'character'; text: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(`chat_${Date.now().toString(36)}`);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setLog((prev) => [...prev, { role: 'user', text }]);
    setDraft('');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/characters/${characterId}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ message: text, sessionId: sessionRef.current }),
      });
      const body = (await res.json().catch(() => null)) as { reply?: string; message?: string } | null;
      if (!res.ok || !body?.reply) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setLog((prev) => [...prev, { role: 'character', text: body.reply! }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-character-chat>
      <h3 className="mb-1 text-11 text-fg-3">跟角色说话</h3>
      <p className="mb-1 text-11 text-fg-3">
        对话没有会话线程：真实回复会进 §48 的角色记忆，界面这段刷新就不在了。
      </p>
      {log.length ? (
        <ul className="mb-1 flex flex-col gap-1" data-character-chat-log>
          {log.map((entry, index) => (
            <li
              key={`${entry.role}-${index}`}
              data-character-chat-msg={entry.role}
              className={cn(
                'rounded-[var(--nexus-radius-sm)] px-2 py-1 text-12',
                entry.role === 'user' ? 'bg-bg-2 text-fg-1' : 'bg-bg-3 text-fg-1',
              )}
            >
              <span className="mr-1 font-mono text-10 text-fg-3">
                {entry.role === 'user' ? '你' : characterName || '角色'}：
              </span>
              {entry.text}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="mb-1 text-11 text-warn-ink" data-character-chat-error>
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          placeholder="说点什么…"
          aria-label="给角色的话"
          data-character-chat-input
          disabled={busy}
          className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-1 outline-none focus:bg-bg-3 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => void send()}
          data-character-chat-send
          className="shrink-0 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-2 hover:bg-bg-3 disabled:opacity-50"
        >
          {busy ? '在想…' : '说'}
        </button>
      </div>
    </section>
  );
}
