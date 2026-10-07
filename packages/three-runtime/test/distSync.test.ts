import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * v198 — the dist the Studio ships must know what src declares.
 *
 * The v197 harness run shipped a bundle whose runtime had no setEntityName/setEntityVisible at all:
 * vitest resolves this package from `src/`, but the Studio's production build resolves
 * `main: ./dist/index.js`, and dist was last compiled at v192 — so the surface's
 * `setEntityVisible?.(` call no-op'd silently in the real browser behind 459/459 green. This gate
 * grades the plane the suites never looked at: every method the src class declares must be present
 * in dist/threeRuntime.js. No dist (a plane that never built the package) is skipped and named —
 * there is nothing to grade; a dist that EXISTS but lags src is the lie, and it reddens.
 *
 * Bounds: only the ThreeRuntime class's own methods are the population — the browser surface the
 * Studio calls through. Module-level exports of other files (saveStore, renderBackend) are unguarded
 * here, and a src method whose signature wraps without its name and `(` on the first line is missed.
 */

const lf = (s: string) => s.replace(/\r\n/g, '\n');
const SRC = lf(readFileSync(new URL('../src/threeRuntime.ts', import.meta.url), 'utf8'));
const DIST_PATH = new URL('../dist/threeRuntime.js', import.meta.url);

const MODIFIERS = '(?:(?:public|private|protected|static|async|get|set) +)*';
const NAME = '([a-zA-Z_][a-zA-Z0-9_]*)';
const declRe = new RegExp(`^  ${MODIFIERS}${NAME}\\s*\\(`);

const parens = (s: string) => {
  let d = 0;
  for (const ch of s) {
    if (ch === '(') d += 1;
    if (ch === ')') d -= 1;
  }
  return d;
};

/** Method names declared on the class, by the shape `  [modifiers]name(` … `) … {`. */
export function classMethodNames(classSource: string): string[] {
  const lines = lf(classSource).split('\n');
  const names: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(declRe);
    if (!m) continue;
    let buf = lines[i];
    while (parens(buf) > 0 && i + 1 < lines.length) {
      i += 1;
      buf += `\n${lines[i]}`;
    }
    const close = buf.lastIndexOf(')');
    if (close === -1) continue;
    const after = buf.slice(close + 1);
    if (after.indexOf(';') !== -1 && after.indexOf(';') < after.indexOf('{')) continue;
    if (!after.includes('{')) continue;
    names.push(m[1]!);
  }
  return names;
}

/** Names the dist class is missing, by the shape `  [modifiers]name(` at a line start. */
export function distMissing(srcNames: string[], distSource: string): string[] {
  const dist = lf(distSource);
  return srcNames.filter((name) => !new RegExp(`^\\s*(?:(?:static|async|get|set) +)*${name}\\s*\\(`, 'm').test(dist));
}

const CLASS_START = SRC.search(/^export class ThreeRuntime\b/m);
const CLASS_END = SRC.search(/^export interface ThreeRuntimeOptions\b/m);
expect(CLASS_START, 'threeRuntime.ts must still declare the class this gate guards').toBeGreaterThan(-1);
expect(CLASS_END, 'threeRuntime.ts must still declare the options interface after the class').toBeGreaterThan(CLASS_START);
const classSlice = SRC.slice(CLASS_START, CLASS_END);

describe('distSync (v198) — the shipped dist knows what src declares', () => {
  it('the finder catches exactly the v197 shape — a dist compiled before the newest methods', () => {
    const olderDist = `
class ThreeRuntime {
  pickAt(sceneId, nx, ny) {
    return null;
  }
  setLightState(sceneId, lightId, patch) {
    return true;
  }
}
`;
    const names = classMethodNames(classSlice);
    const missing = distMissing(names, olderDist);
    expect(missing).toContain('setEntityName');
    expect(missing).toContain('setEntityVisible');
    expect(missing).not.toContain('pickAt');
    expect(missing).not.toContain('setLightState');
  });

  it('a dist in sync with its source reports nothing missing — and a wrapped signature still extracts', () => {
    const syntheticSrc = `
class ThreeRuntime {
  setEntityName(sceneId, entityId, name) {
    return true;
  }
  setEntityVisible(
    sceneId,
    entityId,
    visible
  ) {
    return true;
  }
  get frameCount() {
    return 0;
  }
}
`;
    const names = classMethodNames(syntheticSrc);
    expect(names, 'one-line, wrapped, and getter declarations all extract').toEqual([
      'setEntityName',
      'setEntityVisible',
      'frameCount',
    ]);
    const synced = `
class ThreeRuntime {
  async setEntityName(sceneId, entityId, name) {
    return true;
  }
  setEntityVisible(
    sceneId,
    entityId,
    visible
  ) {
    return true;
  }
  get frameCount() {
    return 0;
  }
}
`;
    expect(distMissing(names, synced), 'async/wrapped/getter dist shapes all satisfy src').toEqual([]);
  });

  it('an overload signature (no body) is not a method the dist must carry', () => {
    const signatureOnly = SRC.replace(/^  setEntityVisible\(.*$/m, '  setEntityVisible(sceneId: SceneId, entityId: EntityId, visible: boolean): boolean;');
    expect(classMethodNames(signatureOnly)).not.toContain('setEntityVisible');
  });

  it('the shipped dist carries every method the src class declares', (ctx) => {
    if (!existsSync(DIST_PATH)) {
      ctx.skip();
      return;
    }
    const dist = readFileSync(DIST_PATH, 'utf8');
    const missing = distMissing(classMethodNames(SRC), dist);
    expect(
      missing,
      'the Studio build resolves main: ./dist/index.js while every suite resolves src/ — a stale dist ships a runtime without the newest gates and no test notices (the v197 incident). Rebuild the package: npm run build -w @nexus/three-runtime',
    ).toEqual([]);
  });
});
