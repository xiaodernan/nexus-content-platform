'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

const COPY: Record<Locale, {
  saveFailed: (reason: string) => string;
  noDescription: string;
  edit: string;
  write: string;
  placeholder: string;
  save: string;
  saving: string;
  clear: string;
  cancel: string;
  editTitle: string;
  saveTitle: string;
  clearTitle: string;
  cancelTitle: string;
}> = {
  zh: {
    saveFailed: (reason) => `没保存：${reason}`,
    noDescription: '没有简介',
    edit: '改简介',
    write: '写简介',
    placeholder: '一句话说明这个项目是什么（会作为公开页的 og:description）',
    save: '保存简介',
    saving: '保存中…',
    clear: '清空',
    cancel: '取消',
    editTitle: '展开简介输入框：一句话说明项目是什么，会作为公开页的搜索描述。',
    saveTitle: '保存简介到最后一次发布的版本；已有的公开页要重新发布才会更新。',
    clearTitle: '清空简介：立即保存空值，公开页会显示「没有简介」。',
    cancelTitle: '放弃这次改动，恢复成展开前的简介。',
  },
  en: {
    saveFailed: (reason) => `Not saved: ${reason}`,
    noDescription: 'No description',
    edit: 'Edit description',
    write: 'Write a description',
    placeholder: 'One line about this project (used as og:description on the public page)',
    save: 'Save description',
    saving: 'Saving…',
    clear: 'Clear',
    cancel: 'Cancel',
    editTitle: 'Open the description field: one line about the project, used as the public page’s search description.',
    saveTitle: 'Save the description to the latest release; an already-published page needs a new release to show it.',
    clearTitle: 'Clear the description and save the empty value immediately; the public page will say “No description”.',
    cancelTitle: 'Discard this edit and restore the description from before you opened the field.',
  },
};

/**
 * §49 项目简介。展开后才显示输入框，收起时只有一行状态文字——
 * 九个项目的列表里如果每个都常驻一个 textarea，这一屏就没法看了。
 *
 * 为什么不并进 TopBar 的重命名：那条链是设计文档的自动保存，改一个像素都会跑一次 PUT；
 * 简介是项目行的元信息，PUT 里带它只会被下一次自动保存覆盖掉。
 */
export function ProjectDescriptionEditor({
  projectId,
  initialDescription,
  locale = 'zh',
}: {
  projectId: string;
  initialDescription: string | null;
  locale?: Locale;
}) {
  const c = COPY[locale];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialDescription ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async (next: string): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        // 空串在这里是"清空"而不是"没改"：服务端把 trim 后为空的值写成 null
        body: JSON.stringify({ description: next }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; issues?: string[]; project?: { description: string | null } }
        | null;
      if (!res.ok || !body?.ok) {
        setNotice(c.saveFailed(body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`));
        return;
      }
      setValue(body.project?.description ?? '');
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="adp-row" data-project-desc-row={projectId}>
        <span className="pe-hint" data-project-desc={initialDescription ? 'set' : 'empty'}>
          {initialDescription ?? c.noDescription}
        </span>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
          className="adp-btnSm"
          title={c.editTitle}
          data-project-desc-edit={projectId}
        >
          {initialDescription ? c.edit : c.write}
        </button>
      </div>
    );
  }

  return (
    <div className="pe-root" data-project-desc-row={projectId}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder={c.placeholder}
        className="pe-input"
        data-project-desc-input={projectId}
      />
      <div className="adp-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(value)}
          className="pe-saveBtn"
          title={c.saveTitle}
          data-project-desc-save={projectId}
        >
          {busy ? c.saving : c.save}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save('')}
          className="adp-btnSm"
          title={c.clearTitle}
          data-project-desc-clear={projectId}
        >
          {c.clear}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setValue(initialDescription ?? '');
            setNotice(null);
            setOpen(false);
          }}
          className="adp-cancelBtn"
          title={c.cancelTitle}
          data-project-desc-cancel={projectId}
        >
          {c.cancel}
        </button>
        <span className="pe-monoHint">{value.length}/500</span>
      </div>
      {notice ? (
        <p className="adp-note" data-project-desc-notice={projectId}>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
