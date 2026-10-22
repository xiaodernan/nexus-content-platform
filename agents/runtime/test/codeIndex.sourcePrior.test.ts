/**
 * Direct coverage for `sourcePrior` (agents/runtime/src/codeIndex.ts).
 *
 * The ranking weight feeding `queryIndex`'s hybrid score is only exercised *indirectly*
 * through `queryIndex` in codeIndex.test.ts, so its own branch decisions (src/lib boost,
 * docs/test/spec/README discount, the `.test.`/`.spec.` carve-out that stops test files
 * in src/ from being boosted, and case-insensitive README) were never asserted directly.
 * Per house discipline, an untested branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { sourcePrior } from '../src/codeIndex.js';

describe('sourcePrior', () => {
  it('boosts real source trees (src/, lib/) that are not tests', () => {
    expect(sourcePrior('src/foo.ts')).toBe(1.2);
    expect(sourcePrior('lib/bar.ts')).toBe(1.2);
    // nested under an unrelated dir, still matched by the /(^|\/)(src|lib)\// anchor
    expect(sourcePrior('app/src/nested/x.ts')).toBe(1.2);
    expect(sourcePrior('packages/lib/components/y.tsx')).toBe(1.2);
  });

  it('does NOT boost test/spec files even when they live in src/', () => {
    expect(sourcePrior('src/foo.test.ts')).toBe(0.85);
    expect(sourcePrior('src/foo.spec.ts')).toBe(0.85);
    expect(sourcePrior('lib/foo.test.tsx')).toBe(0.85);
  });

  it('discounts docs/, README, and .test./.spec. basenames anywhere', () => {
    expect(sourcePrior('docs/guide.md')).toBe(0.85);
    expect(sourcePrior('README.md')).toBe(0.85);
    expect(sourcePrior('foo/README.md')).toBe(0.85);
    // README match is case-insensitive
    expect(sourcePrior('readme.md')).toBe(0.85);
    // precedence: a src/ path that is NOT a .test./.spec. file is boosted to 1.2 even if it is a
    // README — the src/lib branch is checked before the docs/README discount branch.
    expect(sourcePrior('src/README.TXT')).toBe(1.2);
    expect(sourcePrior('a/b.test.ts')).toBe(0.85);
    expect(sourcePrior('c/d.spec.js')).toBe(0.85);
  });

  it('returns the neutral 1.0 for everything else', () => {
    expect(sourcePrior('scripts/build.js')).toBe(1);
    // a test/ DIRECTORY without a .test./.spec. filename is NOT discounted
    expect(sourcePrior('test/helpers.ts')).toBe(1);
    expect(sourcePrior('data/config.json')).toBe(1);
    expect(sourcePrior('styles/app.css')).toBe(1);
  });

  it('is deterministic for identical inputs', () => {
    expect(sourcePrior('src/foo.ts')).toBe(sourcePrior('src/foo.ts'));
    expect(sourcePrior('docs/x.md')).toBe(sourcePrior('docs/x.md'));
  });
});
