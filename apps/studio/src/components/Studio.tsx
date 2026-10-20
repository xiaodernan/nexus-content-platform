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
import { commentIdFromSearch } from '@/lib/commentIntent';
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
            finish(`took the like back on ${unlikeId} — ${answer.count ?? 0} like(s)`);
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
