import { defineConfig } from 'vitest/config'

/**
 * v215 — the ROOT test config, and it is load-bearing rather than cosmetic.
 *
 * `.scratch/` is where this repo's proof runs materialise a ref (a whole copy of the tree) and where ad-hoc
 * probes are written. Measured 2026-10-09: **879 `*.test.ts` files** live under the four `.scratch/`
 * directories, and every one of them is a STALE COPY of a real suite. A root-level `vitest` run that globbed
 * them would grade last week's code and report it as this tree's result.
 *
 * The same directory caused a second, quieter failure: `.scratch/` was not in `.gitignore`, so a `git add -A`
 * swept an in-flight doc edit into an unrelated commit — which is how amendment 196's record landed inside an
 * M5 commit and described a tree that did not exist. It is ignored now (see `.gitignore`), and this config is
 * the other half of the guard.
 *
 * Per-package runs (`turbo run test`, or `vitest run --root <pkg>`) resolve their own root and are unaffected;
 * `apps/studio` has its own `vitest.config.ts` for the source-alias reason recorded at v142.
 */
export default defineConfig({
  test: {
    exclude: ['**/.scratch/**', '**/node_modules/**', '**/dist/**', '**/.git/**'],
  },
})
