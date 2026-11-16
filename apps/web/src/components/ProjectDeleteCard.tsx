'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

const COPY: Record<Locale, {
  deleteFailed: (reason: string) => string;
  open: string;
  nameExpected: string;
  inputHint: string;
  confirming: string;
  confirm: string;
  cancel: string;
}> = {
  zh: {
    deleteFailed: (reason) => `没删除：${reason}`,
    open: '删除项目',
    nameExpected: '逐字输入项目名',
    inputHint: '逐字输入项目名',
    confirming: '删除中…',
    confirm: '确认删除',
    cancel: '取消',
  },
  en: {
    deleteFailed: (reason) => `Not deleted: ${reason}`,
    open: 'Delete project',
    nameExpected: 'Type the project name',
    inputHint: 'Type the project name',
    confirming: 'Deleting…',
    confirm: 'Confirm delete',
    cancel: 'Cancel',
  },
};

/** 只渲染一次确认词节点，避免按 locale 分叉时重复出现同一个 className 字面（§FE-92 的 9 行字面预算） */
function ExpectedWord({ name, projectId }: { name: string; projectId: string }) {
  return <span className="adp-mono" data-project-delete-expected={projectId}>{name}</span>;
}

/**
 * §74 删除项目。界面上要打的字和左边显示的名字是同一串，服务端比的是项目名的原值——
 * 这不是形式主义：审批门的意义就是"停下来把这件事说清楚一次"，
 * 一个"确定要删除吗？【确定】"的弹窗删掉的东西和没弹窗一样多。
 *
 * 说清楚删掉之后会发生什么，是因为这些是用户当时看不到但以后会撞上的：
 * 公开页立刻 404（收藏了这版的人点进去也是 404），但快照、发布记录、评论都还在，
 * 从下面的回收站恢复后原样回来。
 */
export function ProjectDeleteCard({
  projectId,
  projectName,
  locale = 'zh',
}: {
  projectId: string;
  projectName: string;
  locale?: Locale;
}) {
  const c = COPY[locale];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const remove = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ confirm: typed }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; issues?: string[]; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setNotice(c.deleteFailed(body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`));
        return;
      }
      setTyped('');
      setOpen(false);
      // 刷新由服务端重新读列表：这一行消失的依据是查询结果，不是本地把它藏起来
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setNotice(null);
          setTyped('');
          setOpen(true);
        }}
        className="adp-btnSm"
        data-project-delete={projectId}
      >
        {c.open}
      </button>
    );
  }

  return (
    <div className="adp-card" data-project-delete-card={projectId}>
      <p className="adp-note">
        {locale === 'zh' ? (
          <>输入项目名 <ExpectedWord name={projectName} projectId={projectId} /> 才会删除。公开页会立刻打不开，快照与发布记录留着，可以在回收站恢复。</>
        ) : (
          <>Type the project name <ExpectedWord name={projectName} projectId={projectId} /> to delete it. The public page goes dark; snapshots and publish records stay and the project can be restored from the trash.</>
        )}
      </p>
      <div className="adp-row">
        <input aria-label={c.nameExpected}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={c.inputHint}
          maxLength={2000}
          className="adp-input"
          data-project-delete-input={projectId}
        />
        {/* 名字打错时按钮照样能按：审批门的拒绝要在界面上看得见，
            一遇到不匹配就禁用等于让这道门从不显形，测试也撞不到它 */}
        <button
          type="button"
          disabled={busy || typed.trim().length === 0}
          onClick={() => void remove()}
          className="adp-confirmBtn"
          data-project-delete-confirm={projectId}
        >
          {busy ? c.confirming : c.confirm}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setNotice(null);
            setTyped('');
            setOpen(false);
          }}
          className="adp-cancelBtn"
          data-project-delete-cancel={projectId}
        >
          {c.cancel}
        </button>
      </div>
      {notice ? (
        <p className="adp-note" data-project-delete-notice={projectId}>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
