import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: ['src/lib/scene3d.test.ts'],
    // This file is also linted by the repo root's stricter (type-aware) ruleset, which needs an
    // inline suppression for the bare-string throw below. This config has no such rule, so the
    // same suppression is inert here and would trip `--max-warnings=0` — the directive is
    // load-bearing under `npm run eslint`, not noise.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
