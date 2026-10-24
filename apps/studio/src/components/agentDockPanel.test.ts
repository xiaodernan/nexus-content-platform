/**
 * M7 v503 (ADR 0016 amendment 496) — the AGENT DOCK, graded by static rendering.
 *
 * The gap. The agent dock is where the Studio talks to the runtime: a goal, a plan, a human checkpoint
 * (§28), three lanes (container exec, build arc, deploy arc) that each probe a host capability, and a
 * ledger of decisions. It is the most stateful component in the app — thirty-odd pieces of local
 * state — and like every other component it had no test: the browser harness drives it, and a harness
 * proves the run, not the opening face. What the dock shows BEFORE anything is asked is a contract too:
 * three lanes must say they are probing rather than claiming a capability they have not measured, no
 * lane may offer its run button before its probe answers, and the human gate must be named on the
 * controls that will later ask for it.
 *
 * The proof. Static rendering (v500) asks the dock what it shows with every probe still out. Seven
 * cases: the name and the §28 promise; the goal field and the Plan button live with nothing planned;
 * the UI run naming its §63 gate; all three lanes saying `probing…`; no run button offered while
 * probing; the role-chain checkbox untouched and naming its four roles; and the ledger line opening
 * at zero decisions.
 */
import React from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useStudio } from '@/lib/store';
import type { ComponentType } from 'react';

/**
 * Why a global. Vitest’s esbuild runs the CLASSIC JSX transform here (the studio tsconfig asks for
 * `preserve`, and classic output is what a node test gets), so a component’s JSX compiles to a call on
 * a free variable named `React` — while the components import their hooks by name and not the
 * namespace, because in the app Next’s automatic runtime supplies it. Installing the global BEFORE the
 * dock loads — it is imported dynamically in `beforeAll` for exactly this reason — gives the classic
 * output something to find, without editing source files or the shared vitest config a parallel lane
 * holds.
 */
(globalThis as unknown as { React: typeof React }).React = React;

/**
 * Why the mirror. React renders on the server from a store’s INITIAL state: zustand hands
 * `getInitialState` to `useSyncExternalStore` as the server snapshot. The dock’s opening face does not
 * read the store yet, but the mirror is installed anyway so that a later edit that shows store state
 * here is graded against the driven store rather than the module’s birth state — the same discipline
 * panels.test.ts runs under.
 */
function mirrorLiveStateIntoServerSnapshot(): void {
  const initial = useStudio.getInitialState() as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(useStudio.getState() as unknown as Record<string, unknown>)) {
    if (typeof value !== 'function') initial[key] = value;
  }
}

let AgentPanel: ComponentType<Record<string, unknown>>;

beforeAll(async () => {
  AgentPanel = (await import('./AgentPanel')).default as unknown as ComponentType<Record<string, unknown>>;
});

const render = (): string => {
  mirrorLiveStateIntoServerSnapshot();
  return renderToStaticMarkup(React.createElement(AgentPanel, {}));
};
const countOf = (html: string, needle: string): number => html.split(needle).length - 1;

describe('AgentPanel — the dock before anything is asked (v503)', () => {
  it('opens with its name and its §28 promise', () => {
    const html = render();
    expect(html).toContain('Agent dock');
    expect(html).toContain('DEMO MODE · §28 you approve');
  });

  it('offers the goal field and a live Plan button with nothing planned', () => {
    const html = render();
    expect(html).toContain('placeholder="goal, e.g. highlight the hero title"');
    expect(html).toContain('>Plan<');
    // phase is idle: no proposal, so no approve/deny pair and no plan summary
    expect(html).not.toContain('data-testid="agent-approve"');
    expect(html).not.toContain('data-testid="agent-deny"');
    expect(html).not.toContain('Proposed for');
  });

  it('names the human gate on the UI run before it is ever pressed', () => {
    const html = render();
    expect(html).toContain('data-testid="agent-ui-run"');
    expect(html).toContain('Agent UI run (§63 · you gate each action)');
    // and no checkpoint is waiting, because nothing is running
    expect(html).not.toContain('data-testid="ui-allow"');
    expect(html).not.toContain('data-testid="ui-deny"');
  });

  it('all three lanes say they are probing, rather than claiming a capability', () => {
    const html = render();
    expect(html).toContain('data-testid="container-status"');
    expect(html).toContain('container exec: probing…');
    expect(html).toContain('data-testid="build-status"');
    expect(html).toContain('build arc: probing…');
    expect(html).toContain('data-testid="deploy-status"');
    expect(html).toContain('deploy arc: probing…');
  });

  it('no lane offers its run button while its probe is still out', () => {
    const html = render();
    expect(html).not.toContain('data-testid="container-run"');
    expect(html).not.toContain('data-testid="build-run"');
    expect(html).not.toContain('data-testid="deploy-run"');
    expect(html).not.toContain('data-testid="container-ask"');
    expect(html).not.toContain('data-testid="build-ask"');
    expect(html).not.toContain('data-testid="deploy-ask"');
  });

  it('the role chain checkbox starts untouched and names its four roles', () => {
    const html = render();
    expect(html).toContain('role chain (researcher → designer → qa → editor, §24)');
    const at = html.indexOf('role chain');
    const box = html.slice(html.lastIndexOf('<input', at), at);
    expect(box).not.toContain('checked');
  });

  it('the ledger line opens at zero decisions, with no decisions and no memory shown', () => {
    const html = render();
    expect(html).toContain('data-testid="memory-refresh"');
    expect(html).toContain('Memory (§26)');
    expect(html).toContain('ledger: 0 decision(s)');
    expect(html).not.toContain('RECENT DECISIONS');
    expect(html).not.toContain('durable record(s)');
  });
});
