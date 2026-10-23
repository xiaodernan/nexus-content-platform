/**
 * Direct coverage for `compose` (packages/ai-providers/src/demo/composer.ts).
 *
 * The deterministic DEMO-MODE design composer — pure, no DOM, no side effects — was only
 * reached indirectly (the DemoDesignProvider drives composeDesignBatch, which wraps it), so
 * `compose` itself was never asserted: template detection from the prompt, parent/child
 * wiring of the produced node tree, and determinism across identical (prompt, seed). Per
 * house discipline an untested pure branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { compose } from '../src/demo/composer.js';

describe('compose — template detection', () => {
  it('routes auth-flavoured prompts to the auth template', () => {
    expect(compose('build a login page', 1).template).toBe('auth');
    expect(compose('create a sign up form', 2).template).toBe('auth');
    // 'register' is a substring of 'register an account' — note 'registration' is NOT matched
    expect(compose('register an account', 3).template).toBe('auth');
  });

  it('routes dashboard/admin prompts to the dashboard template', () => {
    expect(compose('an admin dashboard', 1).template).toBe('dashboard');
    expect(compose('analytics metrics panel', 2).template).toBe('dashboard');
  });

  it('routes portfolio/gallery prompts to the portfolio template', () => {
    expect(compose('a photo portfolio', 1).template).toBe('portfolio');
    expect(compose('image gallery showcase', 2).template).toBe('portfolio');
  });

  it('defaults everything else to the landing template', () => {
    expect(compose('a simple landing page', 1).template).toBe('landing');
    expect(compose('make a website', 2).template).toBe('landing');
  });
});

describe('compose — produced node tree', () => {
  it('returns a non-empty tree with a wired root', () => {
    const { root, all } = compose('a simple landing page', 4);
    expect(Array.isArray(root.childIds)).toBe(true);
    expect(root.childIds.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThan(1);
  });

  it('threads every non-root node under a node that actually exists', () => {
    const { root, all } = compose('a simple landing page', 4);
    const ids = new Set(all.map((n) => n.id));
    for (const n of all) {
      if (n.id === root.id) continue;
      expect(n.parentId, `node ${n.id} must have a parent`).toBeDefined();
      expect(ids.has(n.parentId!), `parent ${n.parentId} of ${n.id} must exist in the tree`).toBe(true);
    }
  });
});

describe('compose — determinism', () => {
  it('is byte-stable across identical (prompt, seed)', () => {
    const a = compose('an admin dashboard', 9);
    const b = compose('an admin dashboard', 9);
    expect(a.template).toBe(b.template);
    expect(a.all.length).toBe(b.all.length);
    expect(a.root.id).toBe(b.root.id);
    expect(a.all.map((n) => n.id)).toEqual(b.all.map((n) => n.id));
  });

  it('different seeds produce different node ids for the same prompt', () => {
    const a = compose('a landing page', 1);
    const b = compose('a landing page', 2);
    expect(a.root.id).not.toBe(b.root.id);
    expect(a.all.length).toBe(b.all.length); // shape is identical, only ids differ
  });
});


// v434 — the BATCH PRODUCER's own rules, graded directly.
//
// The file above pins `compose`: the template detection, the tree wiring, the determinism. The
// function the DemoDesignProvider actually drives is `composeDesignBatch`, which wraps compose and
// turns the tree into the OpBatch the editor applies — and its own decisions had no direct case:
// where the section enters the page, in what order the nodes travel, what the provenance and the
// summary say, what clock the batch is stamped with, and what the seed defaults to. Measured on HEAD,
// every one of those was reachable only by reading the code.
import { applyBatch, childIdList, createEmptyDocument, demoId, getNode } from '@nexus/design-model';
import { composeDesignBatch } from '../src/demo/composer.js';
import { hashString } from '../src/prng.js';

describe('composeDesignBatch — the batch the demo mode hands the editor (v434)', () => {
  const doc = () => createEmptyDocument('Demo');

  it('inserts the composed section as ONE addSubtree at index 0 of the active page', () => {
    const document = doc();
    const { batch, template } = composeDesignBatch({ prompt: 'a login page for sailors', document, seed: 7 });

    expect(template).toBe('auth');
    expect(batch.ops).toHaveLength(1);
    const op = batch.ops[0]!;
    if (op.type !== 'addSubtree') throw new Error(`the demo batch must be an addSubtree, got ${op.type}`);
    expect(op.parentId).toBe(document.activePageId); // the ACTIVE page, not the root
    expect(op.index).toBe(0); // the section goes on top, not appended under whatever is there
  });

  it('orders the nodes root-first, so one pass can wire every parent', () => {
    const { root, all } = compose('a login page for sailors', 7);
    const op = composeDesignBatch({ prompt: 'a login page for sailors', document: doc(), seed: 7 }).batch.ops[0]!;
    if (op.type !== 'addSubtree') throw new Error(`the demo batch must be an addSubtree, got ${op.type}`);
    const ordered = op.nodes;

    expect(ordered[0]!.id).toBe(root.id); // the root leads, or addSubtree cannot wire the rest
    expect(ordered).toHaveLength(all.length); // no node lost, none duplicated
    const seen = new Set<string>();
    for (const [i, node] of ordered.entries()) {
      if (i > 0) expect(seen.has(node.parentId!), `${node.id} names a parent that is not earlier in the list`).toBe(true);
      seen.add(node.id);
    }
  });

  it('names the demo provenance and the template that was chosen', () => {
    const { batch } = composeDesignBatch({ prompt: 'a login page for sailors', document: doc(), seed: 7 });
    expect(batch.provenance).toEqual({ mode: 'demo', provider: 'nexus-demo', label: 'demo:auth' });

    const dash = composeDesignBatch({ prompt: 'an analytics dashboard', document: doc(), seed: 7 });
    expect(dash.template).toBe('dashboard');
    expect(dash.batch.provenance).toEqual({ mode: 'demo', provider: 'nexus-demo', label: 'demo:dashboard' });
  });

  it('quotes the prompt in the summary, and only its first 60 characters', () => {
    const document = doc();
    const short = composeDesignBatch({ prompt: 'hello', document, seed: 1 });
    // The quotes are the typographic kind the composer writes, not ASCII - pinned as measured.
    expect(short.batch.summary).toBe('Generated landing from “hello”');

    const long = 'x'.repeat(100);
    const clipped = composeDesignBatch({ prompt: long, document, seed: 1 });
    expect(clipped.batch.summary).toBe(`Generated landing from “${'x'.repeat(60)}”`);
  });

  it('stamps the batch at 0 and derives its id from the seed', () => {
    const { batch } = composeDesignBatch({ prompt: 'a portfolio gallery', document: doc(), seed: 7 });
    expect(batch.timestamp).toBe(0); // the demo authors at clock-zero; the runtime stamps when it applies
    expect(batch.id).toBe(demoId('batch', 7));
  });

  it('defaults the seed from the prompt, so the same prompt composes the same batch', () => {
    const document = doc(); // one page: the batch names it, so two documents would be two answers
    const first = composeDesignBatch({ prompt: 'a portfolio gallery', document });
    const second = composeDesignBatch({ prompt: 'a portfolio gallery', document });

    expect(first.batch).toEqual(second.batch); // no seed named: the prompt IS the seed
    expect(first.batch.id).toBe(demoId('batch', hashString('a portfolio gallery')));
  });

  it('applies cleanly to a real document: the section lands on the active page, wired', () => {
    const document = doc();
    const { root, template } = compose('an analytics dashboard', 3);
    const { batch } = composeDesignBatch({ prompt: 'an analytics dashboard', document, seed: 3 });

    const next = applyBatch(document, batch);

    expect(template).toBe('dashboard');
    expect(getNode(next, root.id)).toBeDefined();
    expect(getNode(next, root.id)!.parentId).toBe(document.activePageId); // the threaded parent survived the apply
    expect(childIdList(next.nodes[next.activePageId]!)[0]).toBe(root.id); // index 0 is the top of the page
    const first = batch.ops[0]!;
    if (first.type !== 'addSubtree') throw new Error(`the demo batch must be an addSubtree, got ${first.type}`);
    for (const node of first.nodes) {
      expect(getNode(next, node.id), `${node.id} must exist after the apply`).toBeDefined();
    }
  });
});
