/**
 * M7 v501 (ADR 0016 amendment 494) — the COMPOSERS, graded by static rendering.
 *
 * The gap. v500 rendered the panel layer for the first time and left the overlay family out of it on
 * purpose: the three composers and the account face are not store readers — they are the dialogs a
 * reader opens OVER the studio to say something (a comment, a tip, a report) or to become somebody (an
 * account). They are also the only components whose whole point is a CONVERSATION: every one of them
 * carries the rule that it never invents an author, and every one of them says so by name. None of that
 * had a test: the browser harness clicks them, and clicking is a different, heavier seam.
 *
 * The proof. The same static rendering v500 established — React to a string in plain node, the classic
 * JSX global installed before the dynamic imports, the store state mirrored where React asks for it —
 * now asks each overlay what it shows before anything is typed. The seam grades the OPENING state: the
 * shell each composer wears (its data attribute naming its target, its place in the stack), the fields
 * it offers with their placeholders and defaults, and the closed set the report composer offers its
 * reasons from. The posting itself — the claim check, the fetch, the note — stays with the browser
 * harness and the lane tests; what is pinned here is the form a reader is handed.
 */
import React from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { REPORT_REASONS } from '@/lib/ops';
import type { ComponentType } from 'react';

/**
 * Why a global. Vitest’s esbuild runs the CLASSIC JSX transform here (the studio tsconfig asks for
 * `preserve`, and classic output is what a node test gets), so a component’s JSX compiles to a call on
 * a free variable named `React` — while the components import their hooks by name and not the
 * namespace, because in the app Next’s automatic runtime supplies it. A statically imported component
 * therefore dies on `React is not defined`. Installing the global BEFORE the panels load — they are
 * imported dynamically in `beforeAll` for exactly this reason — gives the classic output something to
 * find, without editing source files or the shared vitest config a parallel lane holds. (The same two
 * paragraphs open panels.test.ts; the composers need no store mirror, because none of them reads one.)
 */
(globalThis as unknown as { React: typeof React }).React = React;

type AnyPanel = ComponentType<Record<string, unknown>>;

let overlays: Record<string, AnyPanel>;

beforeAll(async () => {
  overlays = {
    AccountPanel: (await import('./AccountPanel')).AccountPanel as unknown as AnyPanel,
    CommentComposer: (await import('./CommentComposer')).CommentComposer as unknown as AnyPanel,
    ReportComposer: (await import('./ReportComposer')).ReportComposer as unknown as AnyPanel,
    TipComposer: (await import('./TipComposer')).TipComposer as unknown as AnyPanel,
  };
});

const render = (name: string, props: Record<string, unknown> = {}): string =>
  renderToStaticMarkup(React.createElement(overlays[name]!, props));
const countOf = (html: string, needle: string): number => html.split(needle).length - 1;

describe('the overlay family — three composers, one stack (v501)', () => {
  it('the three composers share one fixed geometry and stack in a declared order', () => {
    const comment = render('CommentComposer', { projectId: 'p-1' });
    const report = render('ReportComposer', { projectId: 'p-1' });
    const tip = render('TipComposer', { accountId: 'a-1' });
    for (const html of [comment, report, tip]) {
      expect(html).toContain('position:fixed');
      expect(html).toContain('top:54px');
      expect(html).toContain('right:16px');
    }
    // comment 44, report 45, tip 46: three mutually exclusive overlays with a written stacking order
    expect(comment).toContain('z-index:44');
    expect(report).toContain('z-index:45');
    expect(tip).toContain('z-index:46');
  });

  it('each composer names its target in a data attribute the harness can find', () => {
    expect(render('CommentComposer', { projectId: 'p-1' })).toContain('data-comment-composer="p-1"');
    expect(render('ReportComposer', { projectId: 'p-1' })).toContain('data-report-composer="p-1"');
    expect(render('TipComposer', { accountId: 'a-1' })).toContain('data-tip-composer="a-1"');
  });

  it('a closer is offered only when one was given', () => {
    expect(render('CommentComposer', { projectId: 'p-1', onClose: () => {} })).toContain('data-comment-close');
    expect(render('CommentComposer', { projectId: 'p-1' })).not.toContain('data-comment-close');
    expect(render('ReportComposer', { projectId: 'p-1', onClose: () => {} })).toContain('data-report-close');
    expect(render('ReportComposer', { projectId: 'p-1' })).not.toContain('data-report-close');
    expect(render('TipComposer', { accountId: 'a-1', onClose: () => {} })).toContain('data-tip-close');
    expect(render('TipComposer', { accountId: 'a-1' })).not.toContain('data-tip-close');
  });
});

describe('CommentComposer — the comment a reader writes here (v501)', () => {
  it('opens on its target with an empty body and an idle post button', () => {
    const html = render('CommentComposer', { projectId: 'p-1' });
    expect(html).toContain('COMMENT');
    expect(html).toContain('on p-1');
    expect(html).toContain('placeholder="say something about this publication…"');
    expect(html).toContain('data-comment-post');
    expect(html).toContain('>Post<');
    expect(countOf(html, 'disabled=')).toBe(0);
  });

  it('shows no note and no comment list before anything is asked', () => {
    // the read of what this account wrote runs in an effect, and effects do not run here
    const html = render('CommentComposer', { projectId: 'p-1' });
    expect(html).not.toContain('data-comment-note');
    expect(html).not.toContain('data-comment-mine');
    expect(html).not.toContain('YOUR COMMENTS HERE');
  });
});

describe('TipComposer — the amount is asked in yuan (v501)', () => {
  it('opens on its target with five yuan and the anonymity box untouched', () => {
    const html = render('TipComposer', { accountId: 'a-1' });
    expect(html).toContain('TIP');
    expect(html).toContain('to a-1');
    expect(html).toContain('data-tip-amount');
    expect(html).toContain('value="5"');
    expect(html).toContain('data-tip-anonymous');
    expect(html).not.toContain('checked');
  });

  it('offers the optional message field and the tip button', () => {
    const html = render('TipComposer', { accountId: 'a-1' });
    expect(html).toContain('placeholder="say something with it? (optional)"');
    expect(html).toContain('data-tip-post');
    expect(html).toContain('>Tip<');
  });
});

describe('ReportComposer — the reason comes from the closed set (v501)', () => {
  it('offers exactly the reasons the constant declares, the first one active', () => {
    const html = render('ReportComposer', { projectId: 'p-1' });
    expect(countOf(html, 'data-report-reason=')).toBe(REPORT_REASONS.length);
    expect(countOf(html, 'tool-active')).toBe(1);
    for (const r of REPORT_REASONS) {
      expect(html).toContain('data-report-reason="' + r + '"');
      expect(html).toContain('title="report it as ' + r + '"');
    }
    // the active chip is the FIRST reason, not a later one: its mark sits before the second chip opens
    expect(html.indexOf('tool-active')).toBeLessThan(html.indexOf('data-report-reason="' + REPORT_REASONS[1] + '"'));
  });

  it('opens on its target with an optional detail field and the report button', () => {
    const html = render('ReportComposer', { projectId: 'p-1' });
    expect(html).toContain('REPORT');
    expect(html).toContain('on p-1');
    expect(html).toContain('placeholder="what is wrong with it? (optional)"');
    expect(html).toContain('data-report-post');
    expect(html).toContain('>Report<');
  });
});

describe('AccountPanel — the face a device with no account sees (v501)', () => {
  it('offers the handle and display name, and says the name carries no proof', () => {
    const html = render('AccountPanel', {});
    expect(html).toContain('data-account-handle-input');
    expect(html).toContain('placeholder="Handle"');
    expect(html).toContain('data-account-display-name');
    expect(html).toContain('placeholder="Display name (optional)"');
    expect(html).toContain('data-account-create');
    expect(html).toContain('>Create Account<');
    expect(html).toContain('unsigned local name');
    expect(html).toContain('ADR 0018');
  });

  it('offers nothing that belongs to a signed-in creator yet', () => {
    // the account is read in an effect, and effects do not run here: the signed-in branch — the save,
    // the sign out, the whole plan offer — is the browser harness’s subject, not this seam’s
    const html = render('AccountPanel', {});
    expect(html).not.toContain('data-account-signout');
    expect(html).not.toContain('data-account-plans');
    expect(html).not.toContain('data-plan-offer');
  });
});
