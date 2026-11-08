'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §60 头像：选文件 → 上传 → 立刻看到新头像，并显示这一张被剥掉了哪些元数据段。
 *
 * 那句"剥掉了什么"是必须的，不是装饰：EXIF 里的 GPS 和机型就在原图里，
 * 而头像是全站少数几张**任何人不用登录都能看到**的图（/u/<handle> 与公开页）。
 * 不告诉用户处理过，就等于替他假设"你应该知道我们做了这件事"（§80 同一条纪律）。
 */
export function AvatarEditor({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [meta, setMeta] = useState<string[]>([]);
  // 上传成功后显示自己刚传的那张，而不是等 router.refresh 把服务端 props 换过来：
  // 浏览器已经解码过一次，再走一次网络只是让界面闪回旧图
  const [shown, setShown] = useState<string | null>(initialUrl);

  const upload = async (file: File): Promise<void> => {
    setPending(true);
    setNotice(null);
    setMeta([]);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/account/avatar', { method: 'POST', headers: csrfHeaders(), body: form });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; url?: string; removed?: string[]; reused?: boolean; reason?: string; issues?: string[]; message?: string }
        | null;
      if (!res.ok || !body?.ok || !body.url) {
        const why = body?.issues?.length ? `：${body.issues.join('；')}` : '';
        setNotice(`没换上：${body?.reason ?? body?.message ?? `HTTP ${res.status}`}${why}`);
        return;
      }
      setShown(body.url);
      setMeta(body.removed ?? []);
      setNotice(body.reused ? '这张之前就用过，直接复用了同一份字节' : '头像已更新');
      router.refresh();
    } finally {
      setPending(false);
      // 允许连续选同一个文件：不清 value 的话 onChange 不会再触发
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (): Promise<void> => {
    setPending(true);
    setNotice(null);
    try {
      const res = await fetch('/api/account/avatar', { method: 'DELETE', headers: csrfHeaders() });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; removed?: boolean; message?: string } | null;
      if (!res.ok || !body?.ok) {
        setNotice(`没摘掉：${body?.message ?? `HTTP ${res.status}`}`);
        return;
      }
      setShown(null);
      setMeta([]);
      // 摘掉就回到 null，不返回一张"默认头像"：那样主页上的圆圈看着像有图，其实谁都没传过
      setNotice(body.removed ? '头像已摘掉，主页回到首字母' : '本来就没有头像');
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-start gap-[var(--nexus-space-3)]" data-avatar-editor>
      {shown ? (
        <img
          src={shown}
          alt=""
          className="h-12 w-12 rounded-full border border-[var(--nexus-color-border-subtle)] object-cover"
          data-avatar-url={shown}
        />
      ) : (
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-2 font-mono text-11 text-fg-3"
          data-avatar-none
        >
          无
        </span>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={pending}
            aria-label="选择头像图片"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
            className="text-12 text-fg-2 file:mr-2 file:rounded-[var(--nexus-radius-sm)] file:border-0 file:bg-bg-2 file:px-2 file:py-1 file:text-12"
            data-avatar-file
          />
          {shown ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void remove()}
              className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-40"
              data-avatar-remove
            >
              摘掉头像
            </button>
          ) : null}
        </div>
        <p className="text-11 text-fg-3" data-avatar-hint>
          只收 PNG / JPEG / WebP / GIF，按文件头判定；扩展名和浏览器说的类型不算依据。
        </p>
        {meta.length ? (
          <p className="text-11 text-fg-2" data-avatar-meta={meta.join(',')}>
            上传时已剥离元数据段：{meta.join('、')}
          </p>
        ) : null}
        {notice ? (
          <p className="text-11 text-fg-2" data-avatar-notice>
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}
