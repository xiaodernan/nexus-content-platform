import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * M5 v142 — the Studio grades the SHARED PACKAGES FROM SOURCE, not from their `dist`.
 *
 * Why this file exists at all: the Studio's first consumer of `@nexus/three-runtime` is the 3D surface
 * (`components/Scene3D.tsx`), and a workspace package resolves through `.` → `dist/index.js`. That is
 * the right entry for a BUILT app, and the wrong one for a unit test: `dist/` is gitignored, so a test
 * that imported it would grade whatever the last `tsc` happened to leave on this machine — green on a
 * checkout that has never been built, stale on one where the source moved after the build. An alias
 * makes the file under test the same file a reviewer is reading.
 *
 * `three` is deliberately NOT aliased: it is a real dependency and its ESM build loads in Node.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@nexus/three-runtime': fileURLToPath(new URL('../../packages/three-runtime/src/index.ts', import.meta.url)),
    },
  },
});
