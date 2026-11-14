'use client';

import { useRef, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/**
 * §47 跟角色说话的共用一块：CharacterPanel 的档案编辑器与 /world 的 3D HUD 都渲染它。
 *
 * 回复只有一种来源：ai-service 背后的真模型。409（DEMO MODE）/ 429（太频繁）/
 * 其它失败都把服务器的原话亮出来，这里不编一句假的顶上（§159）。
 * 服务端没有会话线程（§47 进度记录），真实回复落的是 §48 的角色记忆，
 * 界面这段刷新就没了——提示行里写明白，不假装它存了档。
 * 双语（v747）：locale 由各渲染点透传；zh 原文原样保留，en 逐句对应。
 */

const COPY = {
  zh: {
    heading: '跟角色说话',
    lede: '对话没有会话线程：真实回复会进 §48 的角色记忆，界面这段刷新就不在了。',
    speakerYou: '你',
    speakerCharacter: '角色',
    colon: '：',
    placeholder: '说点什么…',
    inputAria: '给角色的话',
    busyThinking: '在想…',
    send: '说',
  },
  en: {
    heading: 'Talk to the character',
    lede: 'No session thread: real replies go into the §48 character memory and vanish from this screen on refresh.',
    speakerYou: 'You',
    speakerCharacter: 'Character',
    colon: ': ',
    placeholder: 'Say something…',
    inputAria: 'Message for the character',
    busyThinking: 'Thinking…',
    send: 'Say',
  },
} as const;

export function CharacterChat({
  projectId,
  characterId,
  characterName,
  locale = 'zh',
}: {
  projectId: string;
  characterId: string;
  characterName: string;
  locale?: Locale;
}) {
  const c = COPY[locale];
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
      <h3 className="ch-title">{c.heading}</h3>
      <p className="ch-lede">
        {c.lede}
      </p>
      {log.length ? (
        <ul className="ch-log" data-character-chat-log>
          {log.map((entry, index) => (
            <li
              key={`${entry.role}-${index}`}
              data-character-chat-msg={entry.role}
              className={'ch-msg ' + (entry.role === 'user' ? 'ch-msgUser' : 'ch-msgCharacter')}
            >
              <span className="ch-speaker">
                {(entry.role === 'user' ? c.speakerYou : characterName || c.speakerCharacter) + c.colon}
              </span>
              {entry.text}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="ch-error" data-character-chat-error>
          {error}
        </p>
      ) : null}
      <div className="ch-row">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          placeholder={c.placeholder}
          aria-label={c.inputAria}
          data-character-chat-input
          disabled={busy}
          className="ch-input"
        />
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => void send()}
          data-character-chat-send
          className="ch-send"
        >
          {busy ? c.busyThinking : c.send}
        </button>
      </div>
    </section>
  );
}
