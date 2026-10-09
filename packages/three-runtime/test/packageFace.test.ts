// M5 v139 — the package face, checked against the modules it is built from rather than against its author's
// memory. `src/index.ts` used to copy each module's export names by hand; the copy lost one (`RefusalRow`) and
// nothing in the suite could notice, because no test asked the barrel what it forwards. These cases derive
// their own populations from the module sources, so they grow when a grant adds an export and cannot be left
// behind by one.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it, expect } from 'vitest';
import * as face from '../src/index.js';

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const MODULES = ['types', 'threeRuntime', 'saveStore', 'renderBackend'];
const normalise = (text: string) => text.replace(/\r\n/g, '\n');
const readSource = (file: string) => normalise(readFileSync(join(SRC_DIR, file), 'utf8'));

const OWN_RE = /^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gm;
const OWN_VALUE_RE = /^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/gm;

/** Names a module declares itself — the module owns these. */
function ownNames(src: string, valueLayerOnly = false): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(valueLayerOnly ? OWN_VALUE_RE : OWN_RE)) out.add(m[1]!);
  return [...out].sort();
}

/** `export { X }` with no `from`, where the file has no own declaration site for X: a forward of an import. */
function forwardedNames(src: string): { name: string; from: string }[] {
  const owned = new Set(ownNames(src));
  const out: { name: string; from: string }[] = [];
  for (const clause of src.matchAll(/^export\s*\{([^}]*)\}(?!\s*from)/g)) {
    for (const raw of clause[1]!.split(',')) {
      const t = raw.trim();
      if (!t) continue;
      const bits = t.split(/\s+as\s+/);
      const name = (bits[1] ?? bits[0] ?? '').trim().replace(/^type\s+/, '');
      if (!name || owned.has(name)) continue;
      out.push({ name, from: importSourceOf(src, name) ?? '(no import site in this file)' });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Which module-level import brought `name` into this file, if any. */
function importSourceOf(src: string, name: string): string | null {
  for (const clause of src.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/gm)) {
    for (const raw of clause[1]!.split(',')) {
      const bits = raw.trim().split(/\s+as\s+/);
      if ((bits[1] ?? bits[0] ?? '').trim().replace(/^type\s+/, '') === name) return clause[2] ?? null;
    }
  }
  return null;
}

interface Clause {
  module: string;
  star: boolean;
  names: string[];
}

/** What `src/index.ts` actually says it forwards, read out of the barrel's own bytes. */
function barrelClauses(): Clause[] {
  const out: Clause[] = [];
  for (const m of readSource('index.ts').matchAll(/^export\s*(\*|\{([\s\S]*?)\})\s*from\s*'([^']+)'/gm)) {
    const module = m[3]!.replace(/^\.\//, '').replace(/\.js$/, '');
    if (!MODULES.includes(module)) continue;
    const names = m[2]
      ? m[2]!.split(',').map((s) => (s.trim().split(/\s+as\s+/)[1] ?? s.trim().split(/\s+as\s+/)[0] ?? '').trim().replace(/^type\s+/, '')).filter(Boolean)
      : [];
    out.push({ module, star: m[1] === '*', names });
  }
  return out;
}

/** The names a module owns that the face can spell — by clause, or by a wholesale re-export of that module. */
function unreachable(clauses: Clause[], ownedByModule: Record<string, string[]>): string[] {
  const holes: string[] = [];
  for (const module of MODULES) {
    const mine = clauses.filter((c) => c.module === module);
    const covered = mine.some((c) => c.star);
    const listed = new Set(mine.flatMap((c) => c.names));
    for (const name of ownedByModule[module]!) {
      if (!covered && !listed.has(name)) holes.push(`${module}.ts:${name}`);
    }
    if (!mine.length) holes.push(`${module}.ts:(the face never mentions this module)`);
  }
  return holes.sort();
}

/** Pairwise collisions of OWNED names: the shape that makes two star exports drop a name silently. */
function collisionsOf(ownedByModule: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (let i = 0; i < MODULES.length; i += 1) {
    for (let j = i + 1; j < MODULES.length; j += 1) {
      const b = new Set(ownedByModule[MODULES[j]!]!);
      for (const name of ownedByModule[MODULES[i]!]!) if (b.has(name)) out.push(`${MODULES[i]} x ${MODULES[j]}: ${name}`);
    }
  }
  return out.sort();
}

const ownedByModule: Record<string, string[]> = {};
const ownedValuesByModule: Record<string, string[]> = {};
const forwardedByModule: Record<string, { name: string; from: string }[]> = {};
for (const module of MODULES) {
  const src = readSource(`${module}.ts`);
  ownedByModule[module] = ownNames(src);
  ownedValuesByModule[module] = ownNames(src, true);
  forwardedByModule[module] = forwardedNames(src);
}
const clauses = barrelClauses();
const allOwned = Object.values(ownedByModule).reduce((n, list) => n + list.length, 0);

it(`every export a module owns is reachable through the package face (${allOwned} owned names over ${MODULES.length} modules)`, () => {
  expect(allOwned).toBeGreaterThan(0);
  expect(unreachable(clauses, ownedByModule)).toEqual([]);
});

it(`the face mentions every module it is built from (${clauses.length} clauses over ${MODULES.length} modules)`, () => {
  const mentioned = new Set(clauses.map((c) => c.module));
  for (const module of MODULES) expect(mentioned.has(module), `index.ts must forward ${module}.ts`).toBe(true);
});

it('no two modules own the same exported name, which is what a wholesale barrel depends on', () => {
  expect(collisionsOf(ownedByModule)).toEqual([]);
});

it(`a forwarded name has exactly one owner (${MODULES.reduce((n, m) => n + forwardedByModule[m]!.length, 0)} forwarded)`, () => {
  const owners = (name: string) => MODULES.filter((m) => ownedByModule[m]!.includes(name));
  const bad: string[] = [];
  for (const module of MODULES) {
    for (const f of forwardedByModule[module]!) {
      const list = owners(f.name);
      if (list.length !== 1) bad.push(`${f.name} forwarded by ${module}.ts has ${list.length} owners (${list.join(', ') || 'none'})`);
    }
  }
  expect(bad).toEqual([]);
  // The forward must come from the owner, or the face hands out a binding no module claims.
  for (const module of MODULES) {
    for (const f of forwardedByModule[module]!) {
      expect(f.from, `${f.name} is forwarded by ${module}.ts from "${f.from}" but owned by ${owners(f.name).join(',')}.ts`).toBe(`./${owners(f.name)[0]}.js`);
    }
  }
});

it(`the value layer the face carries is exactly the modules' own values (${Object.values(ownedValuesByModule).reduce((n, l) => n + l.length, 0)} values, ${Object.keys(face).length} on the namespace)`, () => {
  const values = MODULES.flatMap((m) => ownedValuesByModule[m]);
  const forwardedValues = MODULES.flatMap((m) => forwardedByModule[m]!.map((f) => f.name));
  expect(values.length).toBeGreaterThan(0);
  const missing = values.filter((n): n is string => n !== undefined && !(n in face));
  expect(missing, 'declared as a value but absent from the imported namespace').toEqual([]);
  const invented = Object.keys(face).filter((n) => !values.includes(n) && !forwardedValues.includes(n));
  expect(invented, 'the face carries a value no module owns').toEqual([]);
});

// This package has a live writer on `threeRuntime.ts` and `types.ts` while this grant lands, so the arms that
// would need a second owner of one name are run against a SYNTHETIC surface table in this process, not against
// the tracked files. The bound is honest: it proves the finder names the shape, not that the shape is reachable
// in the modules today.
it('the collision and reachability finders name the shapes they exist to catch', () => {
  const synthetic: Record<string, string[]> = {
    types: ['DEFAULT_THREE_CONFIG', 'ThreeScene'],
    threeRuntime: ['DEFAULT_THREE_CONFIG', 'ThreeRuntime'],
    saveStore: ['createMemorySaveStore'],
    renderBackend: ['webglAvailable'],
  };
  expect(collisionsOf(synthetic)).toEqual(['types x threeRuntime: DEFAULT_THREE_CONFIG']);
  // The clean direction gets a synthetic wholesale barrel, not the real one: if it read `src/index.ts` here,
  // this case would re-run case 1's claim instead of checking that the finder can tell clean from broken.
  const wholesale: Clause[] = MODULES.map((module) => ({ module, star: true, names: [] }));
  expect(unreachable(wholesale, synthetic)).toEqual([]);
  const handListed: Clause[] = [{ module: 'threeRuntime', star: false, names: ['ThreeRuntime'] }];
  expect(unreachable(handListed, { types: ['ThreeScene'], threeRuntime: ['RefusalRow'], saveStore: [], renderBackend: [] })).toEqual([
    'renderBackend.ts:(the face never mentions this module)',
    'saveStore.ts:(the face never mentions this module)',
    'threeRuntime.ts:RefusalRow',
    'types.ts:(the face never mentions this module)',
    'types.ts:ThreeScene',
  ]);
});
