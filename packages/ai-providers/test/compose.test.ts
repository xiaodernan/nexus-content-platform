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
