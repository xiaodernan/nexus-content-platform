'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { PublicationState } from '@/server/domain/social';

/**
 * §59 作品页上的互动：Like / Comment / Follow / Remix / Share。
 *
 * 计数与"我做没做过"由服务端算好带进来（publicationState），这里只发请求并如实显示回话：
 * - 评论被机检挡下时，界面写的是"这条没发出去 + 为什么"，不写"发送失败"糊过去；
 * - 评论发出去时把机检的限度一起显示出来（没命中不等于合规）；
 * - Remix 明确说是"分叉一份改编"，不是改原作者的东西（§58）；
 * - Share 就是复制链接；Save 收下的是"这一版"，作者重新发布不会把收藏里的内容换掉。
 */
export function PublicationActions({ state }: { state: PublicationState }) {
  const router = useRouter();
  const [liked, setLiked] = useState(state.likedByMe);
  const [likeCount, setLikeCount] = useState(state.likeCount);
  const [comments, setComments] = useState(state.comments);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(state.followingOwner);
  const [followers, setFollowers] = useState(state.followers);
  const [saved, setSaved] = useState(false);

  const act = async (payload: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    try {
      const res = await fetch('/api/published/interact', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ path: state.path, ...payload }),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        // message 来自服务端，理论上可以是任何 JSON；只有字符串才是能显示的原因
        const reason = typeof body?.message === 'string' ? body.message : `HTTP ${res.status}`;
        setNotice(`没做成：${reason}`);
      }
      return body;
    } finally {
      setBusy(false);
    }
  };

  const onLike = async (): Promise<void> => {
    const body = await act({ action: 'like' });
    if (body?.ok) {
      setLiked(body.liked === true);
      setLikeCount(Number(body.count ?? likeCount));
    }
  };

  const onComment = async (): Promise<void> => {
    const body = await act({ action: 'comment', text });
    if (!body) return;
    if (body.ok) {
      const comment = body.comment as { id: string; body: string; author: string; createdAt: string };
      setComments([comment, ...comments]);
      setText('');
      setNotice(typeof body.notice === 'string' ? body.notice : '评论已发布');
    } else {
      setNotice(typeof body.reason === 'string' ? body.reason : '这条评论没发出去');
    }
  };

  const onSave = async (): Promise<void> => {
    const body = await act({ action: 'save' });
    if (body?.ok) setSaved(body.saved === true);
  };

  const onRemix = async (): Promise<void> => {
    const body = await act({ action: 'remix' });
    if (body?.ok && typeof body.projectId === 'string') {
      // 分叉完了直接进自己的副本：§58 要的是"生成 Fork，而不是修改原作品"
      router.push(`/studio/${body.projectId}`);
    }
  };

  const onFollow = async (): Promise<void> => {
    if (!state.ownerHandle) return;
    setBusy(true);
    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ handle: state.ownerHandle }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; following?: boolean; followers?: number; message?: string } | null;
      if (body?.ok) {
        setFollowing(body.following === true);
        setFollowers(Number(body.followers ?? followers));
      } else {
        setNotice(`没做成：${body?.message ?? `HTTP ${res.status}`}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const share = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice('链接已复制');
    } catch {
      setNotice('这个浏览器不让脚本复制链接，地址栏里手动复制即可');
    }
  };

  return (
    <div className="pu-root" data-actions-root>
      <div className="pu-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onLike()}
          className="pu-btn"
          data-action-like={liked ? 'on' : 'off'}
        >
          {liked ? '已点赞' : '点赞'} · {likeCount}
        </button>
        <span className="pu-hint" data-comment-count>
          {comments.length} 条评论 · {state.remixCount} 个改编
        </span>
        {!state.isOwner && state.ownerHandle ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onFollow()}
            className="pu-btn"
            data-action-follow={following ? 'on' : 'off'}
          >
            {following ? '已关注' : '关注作者'} · {followers}
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => void onRemix()} className="pu-btn" data-action-remix>
          Remix 成我的改编
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="pu-btn"
          data-action-save={saved ? 'on' : 'off'}
        >
          {saved ? '已收藏' : '收藏这一版'}
        </button>
        {state.ownerHandle ? (
          <a
            href={`/u/${state.ownerHandle}`}
            className="pu-authorLink"
            data-action-author
          >
            作者主页
          </a>
        ) : null}
        <button type="button" onClick={() => void share()} className="pu-shareBtn" data-action-share>
          复制链接
        </button>
      </div>

      <div className="pu-commentRow">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="写条评论（会过一遍发布机检）"
          className="pu-input"
          data-comment-input
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void onComment()}
          className="pu-submitBtn"
          data-comment-submit
        >
          发送
        </button>
      </div>
      {notice ? (
        <p className="pu-hint" data-action-notice>
          {notice}
        </p>
      ) : null}

      <ul className="pu-commentList" data-comment-list>
        {comments.map((c) => (
          <li className="pu-commentItem" data-comment={c.id} key={c.id}>
            <span className="pu-commentAuthor">{c.author}</span> {c.body}
          </li>
        ))}
        {comments.length === 0 ? <li className="pu-hint">还没有评论。</li> : null}
      </ul>
      {/* §132：过滤要报数。评论从 5 条变成 3 条而没有解释，人会以为评论真的少了 */}
      {state.hiddenComments > 0 ? (
        <p className="pu-hint" data-hidden-comments={state.hiddenComments}>
          另有 {state.hiddenComments} 条来自你已屏蔽或拉黑的人，没有显示在这里（别人仍然看得到）。
        </p>
      ) : null}
    </div>
  );
}
