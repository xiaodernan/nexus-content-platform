'use client';
import { useEffect, useState } from 'react';
import { renderPreviewHtml } from '@/lib/preview';
import { exportCanvasPng, exportHtml, exportJson, slug } from '@/lib/export';
import { readTrail, type TrailAnswer } from '@/lib/auditLane';
import { readEconomy, type EconomyAnswer } from '@/lib/economyLane';
import { listPublished, probePublish, publishProject, unpublish, type PublishLaneListing, type PublishLaneProbe } from '@/lib/publishLane';
import { remixProject } from '@/lib/remixLane';
import { useStudio, type Tool } from '@/lib/store';
import { session } from '@/lib/accountSession';
import { AccountPanel } from './AccountPanel';

const TOOLS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: 'select', label: 'Move', icon: '↖', key: 'V' },
  { id: 'frame', label: 'Frame', icon: '⛶', key: 'F' },
  { id: 'rectangle', label: 'Rectangle', icon: '▭', key: 'R' },
  { id: 'ellipse', label: 'Ellipse', icon: '◯', key: 'O' },
  { id: 'text', label: 'Text', icon: 'T', key: 'T' },
];

export default function Toolbar() {
  const doc = useStudio((s) => s.doc);
  const activePageId = useStudio((s) => s.activePageId);
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const mode = useStudio((s) => s.mode);
  const status = useStudio((s) => s.status);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const setPreview = useStudio((s) => s.setPreview);
  const newProject = useStudio((s) => s.newProject);
  const remixDocument = useStudio((s) => s.remixDocument);
  const surface = useStudio((s) => s.surface);
  const setSurface = useStudio((s) => s.setSurface);

  const exportPng = () => {
    const el = document.getElementById('nexus-canvas') as HTMLCanvasElement | null;
    if (el) exportCanvasPng(el, slug(doc.name));
  };

  /**
   * M7 v194 — the Publish face.
   *
   * The service is PROBED on mount so the control can say what it will do before it is pressed: a Studio
   * whose backend is not running should say so, rather than offering a button that fails when clicked.
   * `services/nexus-api` not running is the ordinary state of this repository, so "unavailable" is a
   * NORMAL answer with a reason, never an error banner.
   */
  const [service, setService] = useState<PublishLaneProbe | null>(null);
  const [publishNote, setPublishNote] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  // v263 — the account THIS device publishes as, so a listed row can say whether it is yours. Read once per
  // render of the panel; the account changes through the account panel, and the Published panel re-reads its
  // rows after every verb, so the two never disagree for long.
  const myAccountId = session.current()?.id ?? null;

  useEffect(() => {
    let live = true;
    void probePublish().then((probe) => {
      if (live) setService(probe);
    });
    return () => {
      live = false;
    };
  }, []);

  const onPublish = async () => {
    setPublishing(true);
    setPublishNote('');
    try {
      // The project id and the title come from the document; the VERSION, the INSTANT and the URL come back
      // from the service. This component computes none of them — it would be reporting its own guess about a
      // record it did not write.
      const answer = await publishProject(doc.id, doc.name, doc);
      setPublishNote(answer.ok ? `published v${answer.version} → ${answer.url}` : `not published: ${answer.reason}`);
      // A publish can also be the first thing that discovers the service went away.
      if (!answer.ok) setService(await probePublish());
      else if (showPublished) await refreshPublished();
      // v272 — and an open trail re-reads too: the publish just wrote an entry, and a panel that showed the
      // trail from before it would be a panel that did not know what just happened.
      if (showTrail) await refreshTrail();
    } finally {
      setPublishing(false);
    }
  };

  /**
   * v195 — what is published, and taking one down.
   *
   * The list is fetched only when the panel is OPENED, and re-fetched after anything that changes it: a
   * Studio that polled would be asking the service a question nobody asked it, and a list that went stale
   * after an unpublish would show a row that is already gone.
   */
  const [showPublished, setShowPublished] = useState(false);
  const [published, setPublished] = useState<PublishLaneListing | null>(null);

  /**
   * v272 — the AUDIT TRAIL panel. The Published panel is what IS; this is what WAS DONE, in the service's
   * own order. They are different facts with different shapes: a publication is REPLACED on re-publish while
   * an audit entry is APPENDED and never replaced — which is why this is a second panel and not another
   * column of the first one.
   *
   * The answer keeps BOTH numbers: the rows that could be displayed and the count the service reported. A
   * row the reading half cannot display honestly is dropped, and the two numbers must then disagree out loud
   * rather than quietly.
   */
  const [showTrail, setShowTrail] = useState(false);
  const [trail, setTrail] = useState<TrailAnswer | null>(null);

  const refreshTrail = async () => setTrail(await readTrail(20));

  /**
   * v274 — the CREATOR ECONOMY panel. No server endpoints exist yet (ADR 0018),
   * so the panel states that honestly rather than showing mock data.
   */
  const [showEconomy, setShowEconomy] = useState(false);
  const [economy, setEconomy] = useState<EconomyAnswer | null>(null);

  const refreshEconomy = async () => setEconomy(await readEconomy());

  const onToggleEconomy = async () => {
    const next = !showEconomy;
    setShowEconomy(next);
    if (next) { await refreshEconomy(); setShowPublished(false); setShowTrail(false); }
  };

  const onToggleTrail = async () => {
    const next = !showTrail;
    setShowTrail(next);
    if (next) { setShowPublished(false); setShowEconomy(false); }
    if (next) await refreshTrail();
  };

  const refreshPublished = async () => {
    setPublished(await listPublished(20));
  };

  const onTogglePublished = async () => {
    const next = !showPublished;
    setShowPublished(next);
    if (next) { setShowTrail(false); setShowEconomy(false); }
    if (next) await refreshPublished();
  };

  const onUnpublish = async (projectId: string) => {
    const answer = await unpublish(projectId);
    setPublishNote(answer.ok ? (answer.removed ? `took down ${projectId}` : `${projectId} was already down`) : `not taken down: ${answer.reason}`);
    // Re-probed rather than hand-edited: the rows are the service's answer, so they are asked for again.
    await refreshPublished();
    // v272 — the take-down wrote an entry too, and an open trail must not be a step behind the verb.
    if (showTrail) await refreshTrail();
  };

  /**
   * v233 — remix: read SOMEONE ELSE'S publication back in as a NEW project. The lane validates the document
   * and names the field that is wrong when it cannot be used (a service that is down is a different answer
   * from a publication with no document); the store FORKS it, so the copy's id is fresh and re-publishing it
   * can never overwrite the source. The panel closes because the editor behind it is now a different project.
   */
  const onRemix = async (projectId: string) => {
    const answer = await remixProject(projectId);
    if (!answer.ok) {
      setPublishNote(`not remixed: ${answer.reason}`);
      return;
    }
    // v267 — the caller names the instant, and the fork records the lineage so the published copy names
    // the source it was made from.
    remixDocument(answer.document, projectId, new Date().toISOString());
    setPublishNote(`remixed ${projectId} into a new project`);
    setShowPublished(false);
  };

  return (
    <header className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
      <strong style={{ fontSize: 15, letterSpacing: 1 }}>
        NEXUS <span style={{ color: 'var(--nexus-brand)' }}>Studio</span>
      </strong>
      <span style={{ fontSize: 12, color: 'var(--nexus-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {doc.name}
      </span>

      <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`btn ${tool === t.id ? 'tool-active' : ''}`}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.id)}
            style={{ minWidth: 38 }}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn" onClick={undo} title="Undo (Ctrl+Z)">↶</button>
        <button className="btn" onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</button>
      </div>

      {/* M5 v142: the 3D surface is a VIEW, so it is a toggle next to the view-level controls rather
          than a document tool. `2D` is the default the golden-path harness drives. */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
        <button
          className={`btn ${surface === '2d' ? 'tool-active' : ''}`}
          title="2D canvas (the Design Model)"
          onClick={() => setSurface('2d')}
          data-surface-toggle="2d"
        >
          2D
        </button>
        <button
          className={`btn ${surface === '3d' ? 'tool-active' : ''}`}
          title="3D scene (@nexus/three-runtime, M5)"
          onClick={() => setSurface('3d')}
          data-surface-toggle="3d"
        >
          3D
        </button>
        <button
          className={`btn ${surface === 'world' ? 'tool-active' : ''}`}
          title="World (@nexus/world-engine, M4)"
          onClick={() => setSurface('world')}
          data-surface-toggle="world"
        >
          World
        </button>
        <button
          className={`btn ${surface === 'assets' ? 'tool-active' : ''}`}
          title="Assets (@nexus/ai-providers multimodal, M3)"
          onClick={() => setSurface('assets')}
          data-surface-toggle="assets"
        >
          Assets
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span
          data-toolbar-status
          style={{ fontSize: 11, color: 'var(--nexus-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {status}
        </span>
        <span
          title="No AI provider keys configured. All generation runs in deterministic DEMO MODE (§60)."
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            padding: '3px 8px',
            borderRadius: 999,
            background: mode === 'demo' ? '#3a2f00' : '#0d2f1a',
            color: mode === 'demo' ? '#ffd24a' : '#63f0a4',
            border: `1px solid ${mode === 'demo' ? '#7a6300' : '#1c6b40'}`,
          }}
        >
          {mode === 'demo' ? 'DEMO MODE' : 'LIVE'}
        </span>
        <button className="btn" onClick={exportPng}>PNG</button>
        <button className="btn" onClick={() => exportHtml(renderPreviewHtml(doc, activePageId), slug(doc.name))}>HTML</button>
        <button className="btn" onClick={() => exportJson(doc)}>JSON</button>
        <button
          className="btn"
          data-toolbar-publish
          onClick={() => void onPublish()}
          disabled={publishing || service?.available === false}
          title={
            service === null
              ? 'checking whether nexus-api is running…'
              : service.available
                ? `publish this document to ${service.apiBase}`
                : `nexus-api is not reachable at ${service.apiBase} — ${service.reason ?? 'no reason given'}`
          }
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
        {/* The service's state is shown, not implied by whether a button looks enabled. */}
        <span
          data-toolbar-publish-note
          style={{
            fontSize: 11,
            maxWidth: 300,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: publishNote.startsWith('published') ? 'var(--nexus-brand)' : 'var(--nexus-muted)',
          }}
        >
          {publishNote || (service === null ? 'publish: checking…' : service.available ? 'publish: service ready' : 'publish: service unavailable')}
        </span>
        <button
          className={`btn ${showPublished ? 'tool-active' : ''}`}
          data-toolbar-published-toggle
          onClick={() => void onTogglePublished()}
          disabled={service?.available === false}
          title="what is published on the service"
        >
          Published
        </button>
        {/* v272 — the AUDIT TRAIL: what the service recorded HAPPENING, newest first. The Published panel
            answers "what exists"; this answers "what was done to it and who said so". A trail nobody can
            read is a table nobody audits, and this is the reading half of that. */}
        <button
          className={`btn ${showTrail ? 'tool-active' : ''}`}
          data-toolbar-trail-toggle
          onClick={() => void onToggleTrail()}
          disabled={service?.available === false}
          title="what the service recorded happening: publishes and take-downs, newest first"
        >
          Trail
        </button>
        {/* v274 — the CREATOR ECONOMY surface. No server endpoints exist yet (ADR 0018 blocks
            accounts/sessions/tokens), so the panel states that honestly rather than showing
            mock data. When the server is built, this door will forward its answer. */}
        <button
          className={`btn ${showEconomy ? 'tool-active' : ''}`}
          data-toolbar-economy-toggle
          onClick={() => void onToggleEconomy()}
          disabled={service?.available === false}
          title="subscriptions and tips — the economy door is not built yet"
        >
          Economy
        </button>
        {/* v241 — the explore page is the PUBLIC door to what is published; the panel above is the author's
            own list. A link, not a fetch: the page is server-rendered and reachable by anyone. */}
        <a
          className="btn"
          data-toolbar-explore
          href="/explore"
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: 'none' }}
          title="browse everything that is published"
        >
          Explore
        </a>
        <button className="btn" onClick={newProject}>New</button>
        <button className="btn" onClick={() => setShowAccount(!showAccount)} title="Account">
          👤
        </button>
        <button className="btn btn-primary" onClick={() => setPreview(true)}>Preview</button>
      </div>

      {/*
        v195 — the published list. Fixed-positioned rather than in the header flow, because the header is one
        row and a list inside it would push the tools around. The rows are the SERVICE's answer and are
        re-fetched after every verb — never hand-edited, so a row that is gone cannot linger.
      */}
      {showPublished && (
        <div
          data-toolbar-published
          style={{
            position: 'fixed',
            top: 54,
            right: 16,
            zIndex: 40,
            width: 440,
            maxHeight: 320,
            overflow: 'auto',
            background: 'var(--nexus-panel, #12151b)',
            border: '1px solid var(--nexus-border, #262b34)',
            borderRadius: 6,
            padding: 10,
            fontSize: 11,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>PUBLISHED</div>
          {published === null ? (
            <div style={{ color: 'var(--nexus-muted)' }}>asking the service…</div>
          ) : !published.ok ? (
            <div style={{ color: 'var(--nexus-muted)' }}>could not list: {published.reason}</div>
          ) : (published.publications ?? []).length === 0 ? (
            <div style={{ color: 'var(--nexus-muted)' }}>nothing is published yet</div>
          ) : (
            <>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {(published.publications ?? []).map((row) => (
                  <li
                    key={row.projectId}
                    data-published-row={row.projectId}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0' }}
                  >
                    <strong>{row.title}</strong>
                    <span style={{ color: 'var(--nexus-muted)' }}>
                      v{row.version} · {row.projectId}
                    </span>
                    {/* v263 — WHO owns this row, and whether it is yours. The service now records the claim the
                        account panel set, and it REFUSES a take-down by anybody else — so a refusal the user
                        cannot explain is a refusal the user cannot act on. The row names its owner, and says
                        "yours" when that owner is this device's account. A row that names nobody says so. */}
                    <span
                      data-published-owner={row.projectId}
                      style={{ color: 'var(--nexus-muted)', fontSize: 10 }}
                    >
                      {row.owner
                        ? `by ${row.owner.handle} · ${row.owner.assurance}${row.owner.accountId === myAccountId ? ' · yours' : ''}`
                        : 'by nobody'}
                    </span>
                    {/* v196 — the artifact page is THIS Studio's route, so the link is one the Studio is the
                        author of. (The service's own `url` names its JSON endpoint and is shown in the note
                        after a publish; the two are different addresses for different readers.) */}
                    <a
                      className="btn"
                      data-published-open={row.projectId}
                      href={`/p/${encodeURIComponent(row.projectId)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px', textDecoration: 'none' }}
                    >
                      open
                    </a>
                    {/* v233 — remix: read this publication back in as a NEW project. The first control that
                        lets a Studio user take someone else's published work and make it their own. */}
                    <button
                      className="btn"
                      data-published-remix={row.projectId}
                      style={{ fontSize: 10, padding: '1px 6px' }}
                      onClick={() => void onRemix(row.projectId)}
                      title="read this publication back in as a new project you can edit and re-publish"
                    >
                      remix
                    </button>
                    <button
                      className="btn"
                      data-published-unpublish={row.projectId}
                      style={{ fontSize: 10, padding: '1px 6px' }}
                      onClick={() => void onUnpublish(row.projectId)}
                    >
                      take down
                    </button>
                  </li>
                ))}
              </ul>
              {/* What the answer CARRIES versus the cap the service applied — so "20" is never mistaken for
                  "there are only 20". */}
              <div style={{ marginTop: 6, color: 'var(--nexus-muted)' }}>
                {published.count} row(s) at limit {published.limit}
              </div>
            </>
          )}
        </div>
      )}
      {/* v272 — the AUDIT TRAIL panel. Fixed-positioned like the Published panel above it, and the rows
          are the SERVICE's own answer in the service's own order — newest first — because an audit trail's
          order is part of what it asserts. Nothing here is hand-edited; the panel re-reads after every verb. */}
      {showTrail && (
        <div
          data-toolbar-trail
          style={{
            position: 'fixed',
            top: 54,
            right: 16,
            zIndex: 41,
            width: 520,
            maxHeight: 340,
            overflow: 'auto',
            background: 'var(--nexus-panel, #12151b)',
            border: '1px solid var(--nexus-border, #262b34)',
            borderRadius: 6,
            padding: 10,
            fontSize: 11,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>AUDIT TRAIL</div>
          {trail === null ? (
            <div style={{ color: 'var(--nexus-muted)' }}>asking the service…</div>
          ) : !trail.ok ? (
            <div style={{ color: 'var(--nexus-muted)' }}>could not read: {trail.reason}</div>
          ) : (trail.rows ?? []).length === 0 ? (
            <div style={{ color: 'var(--nexus-muted)' }}>nothing has happened yet</div>
          ) : (
            <>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {(trail.rows ?? []).map((row) => (
                  <li
                    key={row.id}
                    data-trail-row={row.id}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0' }}
                  >
                    <strong style={{ color: row.action === 'unpublish' ? 'var(--nexus-muted)' : 'var(--nexus-brand)' }}>
                      {row.actionText}
                    </strong>
                    {/* The target is a LINK, because the thing the entry happened to is a publication a person
                        can open — an audit row that named a project nobody could reach would be a row you could
                        only take on trust. */}
                    <a
                      href={`/p/${encodeURIComponent(row.targetId)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--nexus-muted)', textDecoration: 'none' }}
                    >
                      {row.targetId}
                    </a>
                    {/* v272 — the trail names ACCOUNT IDS, not handles: the service has no account table to
                        resolve them with (v270's finding), and the actor of a take-down never published
                        anything, so no row anywhere carries a handle for it. An anonymous action says
                        NOBODY — the service refuses to fake an actor, and so does the panel. */}
                    <span
                      data-trail-actor={row.id}
                      style={{ color: row.anonymous ? 'var(--nexus-muted)' : 'inherit', fontSize: 10 }}
                    >
                      {row.actorText}
                    </span>
                    <span style={{ marginLeft: 'auto', color: 'var(--nexus-muted)', fontSize: 10 }}>{row.timeText}</span>
                  </li>
                ))}
              </ul>
              {/* The service's OWN count beside what was rendered: a row the reading half could not display
                  honestly is dropped, and these two numbers must then disagree OUT LOUD. */}
              <div style={{ marginTop: 6, color: 'var(--nexus-muted)' }}>
                {(trail.rows ?? []).length} of {trail.count} entry(ies) shown · the service caps at {trail.limit}
              </div>
            </>
          )}
        </div>
      )}
      {/* v274 — the CREATOR ECONOMY panel. No server endpoints exist yet (ADR 0018),
          so the panel states that honestly rather than showing mock data. */}
      {showEconomy && (
        <div
          data-toolbar-economy
          style={{
            position: 'fixed',
            top: 54,
            right: 16,
            zIndex: 42,
            width: 400,
            maxHeight: 340,
            overflow: 'auto',
            background: 'var(--nexus-panel, #12151b)',
            border: '1px solid var(--nexus-border, #262b34)',
            borderRadius: 6,
            padding: 10,
            fontSize: 11,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>CREATOR ECONOMY</div>
          {economy === null ? (
            <div style={{ color: 'var(--nexus-muted)' }}>asking the service…</div>
          ) : !economy.ok ? (
            <div style={{ color: 'var(--nexus-muted)' }}>could not read: {economy.reason}</div>
          ) : (economy.subscriptions?.length === 0 && economy.tips?.length === 0) ? (
            <div style={{ color: 'var(--nexus-muted)' }}>no subscriptions or tips yet — the economy door is not built</div>
          ) : (
            <>
              {economy.subscriptions && economy.subscriptions.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 4, marginTop: 6 }}>Subscriptions</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {economy.subscriptions.map((sub) => (
                      <li key={sub.planId} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                        <span>{sub.planId} — {sub.priceText}</span>
                        <span style={{ color: sub.isActive ? 'var(--nexus-brand)' : 'var(--nexus-muted)', fontSize: 10 }}>
                          {sub.statusText} · {sub.daysLeftText}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {economy.tips && economy.tips.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 4, marginTop: 6 }}>Tips</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {economy.tips.map((tip) => (
                      <li key={tip.recipientId + tip.amountText} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '3px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{tip.anonymous ? 'Anonymous' : tip.recipientId} — {tip.amountText}</span>
                        </div>
                        {tip.messageText && (
                          <div style={{ color: 'var(--nexus-muted)', fontSize: 10, whiteSpace: 'pre-wrap' }}>{tip.messageText}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
      {showAccount && (
        <div
          data-toolbar-account
          style={{
            position: 'fixed',
            top: 54,
            right: 16,
            zIndex: 41,
            background: 'var(--nexus-panel, #12151b)',
            border: '1px solid var(--nexus-border, #262b34)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <AccountPanel onClose={() => setShowAccount(false)} />
        </div>
      )}
    </header>
  );
}
