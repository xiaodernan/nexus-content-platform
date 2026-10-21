'use client';
import { useEffect, useState } from 'react';
import Toolbar from './Toolbar';
import Canvas from './Canvas';
import PageTabs from './PageTabs';
import AlignBar from './AlignBar';
import LayersPanel from './LayersPanel';
import Minimap from './Minimap';
import PropertiesPanel from './PropertiesPanel';
import DesignSystemPanel from './DesignSystemPanel';
import ComponentsPanel from './ComponentsPanel';
import HistoryPanel from './HistoryPanel';
import AgentPanel from './AgentPanel';
import PromptBar from './PromptBar';
import PreviewOverlay from './PreviewOverlay';
import Scene3D from './Scene3D';
import WorldPanel from './WorldPanel';
import AssetPanel from './AssetPanel';
import { useStudio } from '@/lib/store';
import { remixIdFromSearch, remixProject } from '@/lib/remixLane';
import { likeIdFromSearch, unlikeIdFromSearch, likeClaimOf } from '@/lib/likeIntent';
import { commentIdFromSearch, uncommentIdFromSearch } from '@/lib/commentIntent';
import { removeComment } from '@/lib/commentLane';
import { reportIdFromSearch } from '@/lib/reportIntent';
import { tipIdFromSearch } from '@/lib/tipIntent';
import { subscribeIdFromSearch } from '@/lib/planIntent';
import { subscribeToPlan } from '@/lib/planLane';
import { TipComposer } from './TipComposer';
import { ReportComposer } from './ReportComposer';
import { followIdFromSearch, unfollowIdFromSearch } from '@/lib/followIntent';
import { followAccount, unfollowAccount } from '@/lib/followLane';
import { claimOf } from '@/lib/socialClaim';
import { CommentComposer } from './CommentComposer';
import { likePublication, unlikePublication } from '@/lib/likeLane';
import { session } from '@/lib/accountSession';
import { deserializeApp, serializeApp } from '@/lib/persist';
import { browserStorage, STUDIO_DOC_KEY } from '@/lib/storage';
import { installBridge } from '@/lib/observability';

const SAVE_DEBOUNCE_MS = 500;

export default function Studio() {
  const previewOpen = useStudio((s) => s.previewOpen);
  const surface = useStudio((s) => s.surface);
  // M7 v286 — the publication the COMMENT composer is for, or null when no composer is open.
  const [commentTarget, setCommentTarget] = useState<string | null>(null);
  // M7 v296 — the publication the REPORT composer is for, or null when no composer is open.
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  // M7 v298 — the account the TIP composer is for, or null when no composer is open.
  const [tipTarget, setTipTarget] = useState<string | null>(null);

  // Read-only observability bridge (§56/§57/§32): exposes editor state on `window.__nexus`
  // so verification and evaluation assert against the canonical model, not scraped markup.
  // Lazy getter ⇒ always current; frozen object ⇒ no back-door mutation of the product.
  useEffect(() => {
    installBridge(() => useStudio.getState());
  }, []);

  // Local persistence: hydrate once, then debounced-save on every document change (§32 durability
  // for the slice; server snapshot/versioning is M7+). Storage I/O lives behind the seam in
  // lib/storage so this component never touches `window` directly.
  useEffect(() => {
    const store = browserStorage();
    const raw = store.getItem(STUDIO_DOC_KEY);
    if (raw) {
      const res = deserializeApp(raw);
      if (res.ok) useStudio.getState().loadDocument(res.doc);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useStudio.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          store.setItem(STUDIO_DOC_KEY, serializeApp(useStudio.getState().doc));
        } catch {
          /* quota / private-mode: persistence is best-effort for the slice */
        }
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // M7 v234 — a REMIX link: the artifact page (`/p/{id}`) sends a visitor here as `/?remix={id}`. Read the
  // intent once on mount, fetch the publication through the client lane, and open it as a NEW project. It is
  // declared AFTER the hydrate effect above so an explicit remix wins over a stale local snapshot, and the
  // query is dropped afterwards — the URL was a one-time intent, and a reload must not silently discard the
  // edits the visitor then makes.
  useEffect(() => {
    const id = remixIdFromSearch(window.location.search);
    if (!id) return;
    let live = true;
    void remixProject(id).then((answer) => {
      if (!live) return;
      if (answer.ok) {
        // v267 — the caller names the instant (the store owns no clock), and the fork records the lineage
        // so the published copy can name the source it was made from.
        useStudio.getState().remixDocument(answer.document, id, new Date().toISOString());
        window.history.replaceState(null, '', '/');
      } else {
        useStudio.getState().setStatus(`Could not remix ${id}: ${answer.reason}`);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  // M7 v284 — a LIKE link: the artifact page sends a reader here as `/?like={id}` (and `/?unlike={id}`).
  // The page is server-rendered and cannot act — it does not know who the device is — so the Studio is
  // where the like happens, exactly as the Studio is where the remix happens.
  //
  // The claim is built from the device's OWN account: a device with no account has no claim, and the
  // service refuses an accountless like by name. The client does NOT invent an actor to make the
  // request succeed — an invented account id would be a like nobody made.
  useEffect(() => {
    const search = window.location.search;
    const likeId = likeIdFromSearch(search);
    const unlikeId = unlikeIdFromSearch(search);
    if (!likeId && !unlikeId) return;
    let live = true;
    const account = session.current();
    const claim = likeClaimOf(account?.id ?? null, account?.handle ?? null, account?.assurance ?? null);
    const finish = (message: string) => {
      if (!live) return;
      useStudio.getState().setStatus(message);
      window.history.replaceState(null, '', '/');
    };
    if (likeId) {
      if (!claim) {
        finish(`Could not like ${likeId}: this device has no account, and a like needs one`);
      } else {
        void likePublication(likeId, claim as never).then((answer) => {
          if (!live) return;
          if (answer.ok) {
            finish(`liked ${likeId} — ${answer.count ?? 0} like(s)`);
          } else {
            finish(`Could not like ${likeId}: ${answer.reason}`);
          }
        });
      }
    } else if (unlikeId) {
      if (!claim) {
        finish(`Could not take the like back: this device has no account, and a like needs one`);
      } else {
        void unlikePublication(unlikeId, claim.accountId).then((answer) => {
          if (!live) return;
          if (answer.ok) {
            // v320 — the service answers the same way whether there was a like to take back or not
            // ("a like that is already gone is already gone"), so the words must be true in BOTH cases:
            // "the like is gone" is, and "took the like back" would not be.
        finish(`the like on ${unlikeId} is gone — ${answer.count ?? 0} like(s) now`);
          } else {
            finish(`Could not take the like back: ${answer.reason}`);
          }
        });
      }
    }
    return () => {
      live = false;
    };
  }, []);

  // M7 v288 — a FOLLOW link: the profile page sends a reader here as `/?follow={accountId}` (and
  // `/?unfollow={accountId}`). The page is server-rendered and cannot act — it does not know who the
  // device is (ADR 0018) — so the Studio is where the follow happens, exactly as the like and the comment
  // are.
  //
  // The claim is built from the device's OWN account: a device with no account has no claim, and the
  // service refuses an accountless follow by name. The client does NOT invent an actor.
  //
  // The query is NOT dropped: a follow is not a one-time intent like a remix, and a reader who reloads
  // should still find the account they asked to follow named in the URL.
  useEffect(() => {
    const search = window.location.search;
    const followId = followIdFromSearch(search);
    const unfollowId = unfollowIdFromSearch(search);
    if (!followId && !unfollowId) return;
    let live = true;
    const account = session.current();
    const claim = claimOf(account?.id ?? null, account?.handle ?? null, account?.assurance ?? null);
    const finish = (message: string) => {
      if (!live) return;
      useStudio.getState().setStatus(message);
    };
    if (followId) {
      if (!claim) {
        finish(`Could not follow ${followId}: this device has no account, and a follow needs one`);
      } else {
        void followAccount(followId, claim).then((answer) => {
          if (!live) return;
          if (answer.ok) {
            finish(`followed ${followId} — ${answer.followerCount ?? 0} follower(s)`);
          } else {
            finish(`Could not follow ${followId}: ${answer.reason}`);
          }
        });
      }
    } else if (unfollowId) {
      if (!claim) {
        finish(`Could not take the follow back: this device has no account, and a follow needs one`);
      } else {
        void unfollowAccount(unfollowId, claim.accountId).then((answer) => {
          if (!live) return;
          if (answer.ok) {
            finish(`took the follow back on ${unfollowId} — ${answer.followerCount ?? 0} follower(s)`);
          } else {
            finish(`Could not take the follow back: ${answer.reason}`);
          }
        });
      }
    }
    return () => {
      live = false;
    };
  }, []);

  // M7 v296 — a REPORT link: the artifact page sends a reader here as `/?report={id}`, and the Studio
  // opens a composer over it — the same arrangement the like, the comment and the follow use.
  //
  // The query is NOT dropped: the composer is a place the reader is, and a reader who reloads should
  // still find it open over the publication it is for.
  useEffect(() => {
    const id = reportIdFromSearch(window.location.search);
    if (id) setReportTarget(id);
  }, []);

  // v321 — an UN-COMMENT link: the artifact page's comments section sends a reader here as
  // `/?uncomment={id}`, and the Studio takes the comment back. The chain the service needs was already
  // there (the DELETE door, the author's own rule, the trail's `uncomment` verb since v289) — but nothing in
  // the product pointed at it, so a comment its author could not take back was a comment that could only
  // be lived with.
  //
  // The words are the service's own truth: it says whether a comment was ACTUALLY taken back, and the two
  // cases are two different sentences — "took it back" and "it was already gone".
  useEffect(() => {
    const id = uncommentIdFromSearch(window.location.search);
    if (!id) return;
    let live = true;
    const account = session.current();
    if (!account) {
      useStudio.getState().setStatus('Could not take the comment back: this device has no account, and a comment needs one');
      return;
    }
    void removeComment(id, account.id).then((answer) => {
      if (!live) return;
      if (!answer.ok) {
        useStudio.getState().setStatus(`Could not take the comment back: ${answer.reason}`);
        return;
      }
      useStudio.getState().setStatus(
        answer.removed === true
          ? `took the comment back — the thread now says it was removed by its author`
          : `that comment was already gone`,
      );
    });
    return () => {
      live = false;
    };
  }, []);

  // M7 v298 — a TIP link: the profile page sends a reader here as `/?tip={accountId}`, and the Studio
  // opens a composer over it. A tip is for an ACCOUNT, so the bar it comes from is on the profile.
  useEffect(() => {
    const id = tipIdFromSearch(window.location.search);
    if (id) setTipTarget(id);
  }, []);

  // M7 v301 — a SUBSCRIBE link: the profile page sends a reader here as `/?subscribe={planId}`, and
  // the Studio backs the plan on mount. A subscription is a commitment, so the claim goes with it: a
  // device with no account has no claim, and the service refuses an accountless subscription by name.
  useEffect(() => {
    const planId = subscribeIdFromSearch(window.location.search);
    if (!planId) return;
    let live = true;
    const account = session.current();
    const claim = claimOf(account?.id ?? null, account?.handle ?? null, account?.assurance ?? null);
    if (!claim) {
      useStudio.getState().setStatus(`Could not back ${planId}: this device has no account, and a subscription needs one`);
      return;
    }
    void subscribeToPlan(planId, claim).then((answer) => {
      if (!live) return;
      if (answer.ok) {
        useStudio.getState().setStatus(`backed ${planId} — ${answer.subscription?.priceCents ?? 0} cents`);
      } else {
        useStudio.getState().setStatus(`Could not back ${planId}: ${answer.reason}`);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  // M7 v286 — a COMMENT link: the artifact page sends a reader here as `/?comment={id}`, and the
  // Studio opens a composer over it. The page is server-rendered and cannot know who the device is
  // (ADR 0018), so the writing happens HERE — the same arrangement the like and the remix use.
  //
  // The query is NOT dropped: a comment is not a one-time intent like a remix, and a reader who reloads
  // the page should still find the composer open with the publication it is for.
  useEffect(() => {
    const id = commentIdFromSearch(window.location.search);
    if (id) setCommentTarget(id);
  }, []);

  return (
    <div data-surface={surface} style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--nexus-bg)' }}>
      <Toolbar />
      {commentTarget && (
        <CommentComposer projectId={commentTarget} onClose={() => setCommentTarget(null)} />
      )}
      {reportTarget && (
        <ReportComposer projectId={reportTarget} onClose={() => setReportTarget(null)} />
      )}
      {tipTarget && (
        <TipComposer accountId={tipTarget} onClose={() => setTipTarget(null)} />
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside className="panel" style={{ width: 240, borderLeft: 'none', borderBottom: 'none', borderTop: 'none', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '8px 12px', fontSize: 11, letterSpacing: 1, color: 'var(--nexus-muted)', textTransform: 'uppercase' }}>
            Layers
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <LayersPanel />
          </div>
          <div style={{ borderTop: '1px solid var(--nexus-border)' }}>
            <ComponentsPanel />
          </div>
          <div style={{ borderTop: '1px solid var(--nexus-border)' }}>
            <DesignSystemPanel />
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <PageTabs />
          <AlignBar />
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {/* M5 v142 / M4 v148: the main pane shows ONE surface. The 2D canvas is the default and is
                untouched; the 3D scene and the world are each mounted only while they are asked for, so
                neither one's runtime is alive behind the editor. */}
            {surface === '3d' ? (
              <Scene3D />
            ) : surface === 'world' ? (
              <WorldPanel />
            ) : surface === 'assets' ? (
              <AssetPanel />
            ) : (
              <>
                <Canvas />
                <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 5 }}>
                  <Minimap />
                </div>
              </>
            )}
          </div>
          <PromptBar />
        </main>

        <aside className="panel" style={{ width: 300, borderRight: 'none', borderBottom: 'none', borderTop: 'none', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: '1 1 55%', minHeight: 0, overflow: 'auto' }}>
            <PropertiesPanel />
          </div>
          <div style={{ borderTop: '1px solid var(--nexus-border)' }}>
            <AgentPanel />
          </div>
          <div style={{ flex: '1 1 45%', minHeight: 0, overflow: 'auto', borderTop: '1px solid var(--nexus-border)' }}>
            <HistoryPanel />
          </div>
        </aside>
      </div>
      {previewOpen && <PreviewOverlay />}
    </div>
  );
}
