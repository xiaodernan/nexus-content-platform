/**
 * M5 v150 — a save name has ONE owner between the confinement and the host.
 *
 * `resolveSavePath` splits names on `[\\/]`, so it already called a backslash a separator when it refused
 * `saves\..\escape.json` — then handed the name to the host unchanged, where POSIX keeps it as one file whose
 * NAME holds the backslash and Windows writes it into a directory. Measured before the rule existed
 * (`.scratch/vnext/probe196.mjs`, `.scratch/vnext/decide196.mjs`): one script and one store type reported 2
 * saves on a POSIX host and 1 on this one, and a write under the other spelling silently replaced the first
 * save's bytes. Canonicalising was measured and REJECTED — `delete()` would answer `false`, "the path held
 * nothing", while the host plainly holds the file, which is the lie this seam refuses everywhere else.
 *
 * The two halves answer different callers:
 * - a name the CALLER chose meets the door: write, read, exists and delete refuse it, out loud;
 * - a name the STORE chose is reported: `list()` is a fact about the host and may hold a file that predates
 *   the rule, and a save menu that dies on one such name cannot show the other nine.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createHeadlessBackend } from '../src/renderBackend.js';
import { createThreeRuntime, type ThreeRuntime } from '../src/threeRuntime.js';
import {
  createFsSaveStore,
  createMemorySaveStore,
  resolveNewSavePath,
  resolveSavePath,
  savePathRefusal,
  type FsLike,
  type SaveStore,
} from '../src/saveStore.js';

const mockCanvas = {
  clientWidth: 800,
  clientHeight: 600,
  getContext: () => null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
} as unknown as HTMLCanvasElement;

function runtimeWithStore(storage: SaveStore): { rt: ThreeRuntime; scene: string } {
  const created = createThreeRuntime({}, { backend: (_canvas, cfg) => createHeadlessBackend(cfg), storage });
  created.initialize(mockCanvas);
  const scene = created.createScene('World').id;
  created.setActiveScene(scene);
  created.createEntity(scene, 'Hero', 'mesh');
  return { rt: created, scene };
}

/** A POSIX-semantics host over a Map: `/` is the ONLY separator, so `\` is an ordinary character in a name.
 *  `seed` writes BELOW the seam — which is what a store that predates this rule already holds. */
function posixFs(): FsLike & { seed(path: string, contents: string): void; bytes(path: string): string | undefined } {
  const files = new Map<string, string>();
  const parentOf = (p: string): string => {
    const cut = p.lastIndexOf('/');
    return cut < 0 ? '' : p.slice(0, cut);
  };
  const hasFileAncestor = (p: string): boolean => {
    for (let cur = parentOf(p); cur.length > 0; cur = parentOf(cur)) if (files.has(cur)) return true;
    return false;
  };
  const isDir = (p: string): boolean => {
    const prefix = `${p.replace(/\/+$/, '')}/`;
    for (const key of files.keys()) if (key.startsWith(prefix)) return true;
    return false;
  };
  return Object.assign(
    {
      seed(path: string, contents: string) {
        files.set(path, contents);
      },
      bytes(path: string) {
        return files.get(path);
      },
    },
    {
      writeFileSync(p: string, data: string) {
        if (hasFileAncestor(p)) throw new Error(`ENOTDIR: not a directory, open '${p}'`);
        files.set(p, data);
      },
      readFileSync(p: string) {
        if (!files.has(p)) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
        return files.get(p)!;
      },
      existsSync(p: string) {
        return files.has(p) || isDir(p);
      },
      unlinkSync(p: string) {
        if (!files.has(p)) throw new Error(`ENOENT: no such file or directory, unlink '${p}'`);
        files.delete(p);
      },
      readdirSync(dir: string) {
        const prefix = `${dir.replace(/\/+$/, '')}/`;
        const kids = new Set<string>();
        for (const key of files.keys()) {
          if (!key.startsWith(prefix)) continue;
          const seg = key.slice(prefix.length).split('/')[0];
          if (seg) kids.add(seg);
        }
        return [...kids];
      },
      statSync(p: string) {
        return { isDirectory: () => isDir(p), isFile: () => files.has(p) };
      },
    },
  );
}

const BS = 'saves\\hero.json';
const SL = 'saves/hero.json';
/** One save, spelled the way a POSIX host would name it: listed by the store, refused by this build. */
const LEGACY = 'legacy\\x.json';

/** One real save file's bytes, produced by the shipped writer so the legacy seed is a readable save in every way
 *  but its name — otherwise a refusal could be excused as "that file was broken anyway". Computed INSIDE the
 *  cases, not at module load: an arm that makes the writer refuse every name must redden the cases that need a
 *  save, not crash this file's import and leave the arm with 0 cases to read. */
let cachedBytes: string | null = null;
function aRealSave(): string {
  if (cachedBytes !== null) return cachedBytes;
  const store = createMemorySaveStore();
  const { rt, scene } = runtimeWithStore(store);
  rt.writeSaveFile('carrier.json', scene, 1700000000000);
  const bytes = store.read('carrier.json');
  if (bytes === null) throw new Error('the writer filed nothing, so this fixture measures nothing');
  cachedBytes = bytes;
  return cachedBytes;
}

function legacyStore(contents: string) {
  const fs = posixFs();
  fs.seed(`/saves/${LEGACY}`, contents);
  fs.seed('/saves/ok.json', contents);
  return { fs, store: createFsSaveStore(fs, '/saves') };
}

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('the door: one name, one owner', () => {
  it('refuses a backslash, in a sentence that names both hosts and the name it refused', () => {
    expect(() => resolveSavePath(BS)).toThrow(/backslash/);
    const message = refusal(() => resolveSavePath(BS));
    expect(message).toMatch(/POSIX/);
    expect(message).toMatch(/host/);
    expect(message, 'the refusal must carry the name the caller passed, not only the rule').toMatch(/saves\\hero\.json/);
  });

  it('refuses before any byte moves, on both stores', () => {
    const memory = createMemorySaveStore();
    expect(() => memory.write(BS, 'no bytes may move behind a refused name')).toThrow(/backslash/);
    expect(memory.list(), 'a refused name must not be held under either spelling').toEqual([]);
    const fs = posixFs();
    const store = createFsSaveStore(fs, '/saves');
    expect(() => store.write(BS, 'no bytes may move behind a refused name')).toThrow(/backslash/);
    expect(fs.bytes('/saves/saves\\hero.json'), 'nothing moved below the seam either').toBeUndefined();
  });

  it('keeps every name that was legal, so the rule is about the backslash and nothing else', () => {
    for (const legal of ['hero.json', SL, 'a/b/c-1_2.json', 'slot.01.json', '.hidden.json', 'saves/x.tmp']) {
      expect(resolveSavePath(legal), `${legal} stays legal and comes back unchanged`).toBe(legal);
      expect(savePathRefusal(legal), `${legal} is re-enterable`).toBeNull();
    }
  });

  it('refuses the same name for creation too, because creation crosses the same door', () => {
    expect(() => resolveNewSavePath(BS)).toThrow(/backslash/);
    expect(() => resolveNewSavePath('saves/../escape.json')).toThrow(/\.\./);
    expect(resolveNewSavePath(SL), 'the one rule creation adds does not narrow the shared one').toBe(SL);
  });

  it('does not canonicalise: a refusal never rewrites a caller\'s name into a different file', () => {
    const memory = createMemorySaveStore();
    memory.write(SL, 'SLASH');
    expect(memory.read(SL)).toBe('SLASH');
    expect(() => memory.read(BS)).toThrow(/backslash/);
    expect(memory.list(), 'the slash bytes were not moved onto the backslash name, or vice versa').toEqual([SL]);
    expect(memory.read(SL)).toBe('SLASH');
  });

  it('cannot be written against the segments, because the split that reads the name already ate the backslash', () => {
    // The first draft of this rule asked `segments.some((segment) => segment.includes("\\"))`. That clause can
    // never fire: the split it followed takes the backslash away. It was measured firing — the grant's own run
    // collected every case, typechecked clean, and said `expected [Function] to throw an error` ten times.
    const segments = BS.split(/[\\/]/);
    expect(segments, 'the split reads the backslash as a separator, so no segment keeps it').toEqual(['saves', 'hero.json']);
    expect(segments.some((segment) => segment.includes('\\')), 'a segment scan is the vacuous shape').toBe(false);
    expect(segments.join('/'), 'the re-join is the test that can still see the difference').not.toBe(BS);
    expect(() => resolveSavePath(BS)).toThrow(/re-join/);
  });
});

describe('a name the store chose: reported, never fatal', () => {
  it('list() still names it, because a listing is a fact about the host', () => {
    const { rt } = runtimeWithStore(legacyStore(aRealSave()).store);
    const listed = rt.listSaveFiles();
    expect(listed.paths).toContain(LEGACY);
    expect(listed.paths).toContain('ok.json');
  });

  it('the save menu survives the refused name instead of dying with it, and still answers the readable save', () => {
    const dying = legacyStore('not json at all');
    const { rt: nullRt } = runtimeWithStore(dying.store);
    expect(nullRt.latestSaveFile(), 'a refused name is not a newest save, and two refused names are no answer').toBeNull();
    const seeded = legacyStore(aRealSave());
    const { rt } = runtimeWithStore(seeded.store);
    const latest = rt.latestSaveFile();
    expect(latest).not.toBeNull();
    expect(latest!.path).toBe('ok.json');
    expect(latest!.ties, 'the refused name is not counted beside the readable ones').toBe(1);
    expect(latest!.unreadable.map((entry) => entry.path)).toEqual([LEGACY]);
    expect(latest!.unreadable[0].why).toMatch(/will not re-enter/);
    expect(latest!.unreadable[0].why, 'the reason carries the door\'s own sentence, not a second opinion').toMatch(/backslash/);
  });

  it('the diagnosis gives it a reason of its own, not not-json and not listed-then-missing', () => {
    const { rt } = runtimeWithStore(legacyStore(aRealSave()).store);
    const report = rt.diagnoseSaveFiles();
    expect(report.unreadable.map((entry) => entry.path)).toEqual([LEGACY]);
    expect(report.unreadable.map((entry) => entry.reason)).toEqual(['name-not-reenterable']);
    expect(report.loadable.map((entry) => entry.path)).toEqual(['ok.json']);
    expect(report.total).toBe(report.loadable.length + report.unloadable.length + report.unreadable.length);
  });

  it('the branch does not read the message: a name refused for ANOTHER rule joins the same bucket with its own sentence', () => {
    const fs = posixFs();
    fs.seed('/saves/ok.json', aRealSave());
    fs.seed('/saves/a/.', aRealSave());
    const { rt } = runtimeWithStore(createFsSaveStore(fs, '/saves'));
    const report = rt.diagnoseSaveFiles();
    expect(report.unreadable.map((entry) => entry.path)).toEqual(['a/.']);
    expect(report.unreadable.map((entry) => entry.reason)).toEqual(['name-not-reenterable']);
    expect(report.unreadable[0].why).not.toMatch(/backslash/);
    expect(report.unreadable[0].why).toMatch(/empty or "\." segment/);
  });

  it('the sweep reports a refused temp, still removes the rest, and does not call it kept', () => {
    const fs = posixFs();
    fs.seed('/saves/gone.json.tmp', 'debris');
    fs.seed('/saves/junk\\x.tmp', 'debris');
    const { rt } = runtimeWithStore(createFsSaveStore(fs, '/saves'));
    const swept = rt.sweepTempFiles();
    expect(swept.removed).toEqual(['gone.json.tmp']);
    expect(swept.refused.map((entry) => entry.path)).toEqual(['junk\\x.tmp']);
    expect(swept.refused[0].why).toMatch(/backslash/);
    expect(swept.kept, 'kept means "asked, found nothing"; this name was never asked').toEqual([]);
    expect(fs.bytes('/saves/junk\\x.tmp'), 'the host still holds it, and the record says so').toBe('debris');
  });

  it('a store holding nothing has all three answers empty, so a silent bucket cannot be a passing scan', () => {
    const { rt } = runtimeWithStore(createFsSaveStore(posixFs(), '/saves'));
    expect(rt.sweepTempFiles()).toEqual({ store: 'fs', removed: [], kept: [], refused: [] });
    const latest = rt.latestSaveFile();
    expect(latest).toBeNull();
    const report = rt.diagnoseSaveFiles();
    expect(report).toEqual({ store: 'fs', total: 0, loadable: [], unloadable: [], unreadable: [] });
  });
});

describe('a name the caller chose: the door, out loud', () => {
  it('write, read, delete and the single-file diagnosis all refuse it and none of them half-does the job', () => {
    const store = createMemorySaveStore();
    const { rt, scene } = runtimeWithStore(store);
    expect(() => rt.writeSaveFile(BS, scene, 1700000000000)).toThrow(/backslash/);
    expect(() => rt.readSaveFile(BS, scene)).toThrow(/backslash/);
    expect(() => rt.deleteSaveFile(BS)).toThrow(/backslash/);
    expect(() => rt.diagnoseSaveFile(BS)).toThrow(/backslash/);
    expect(rt.listSaveFiles().paths, 'the refused write filed nothing').toEqual([]);
  });

  it('a backslash-named directory is refused the same way, where this host would have made one', () => {
    const memory = createMemorySaveStore();
    expect(() => memory.write('a\\b\\c.json', 'no bytes may move behind a refused name')).toThrow(/backslash/);
    expect(() => resolveSavePath('saves\\..\\escape.json')).toThrow(/\.\./);
  });

  it('savePathRefusal answers about every name without walking through the door', () => {
    const names = [BS, LEGACY, 'x/../y.json', '', 'a/.', SL, 'hero.json', 'saves/x.tmp'];
    const refused: string[] = [];
    const reenterable: string[] = [];
    for (const name of names) (savePathRefusal(name) === null ? reenterable : refused).push(name);
    expect(refused).toEqual([BS, LEGACY, 'x/../y.json', '', 'a/.']);
    expect(reenterable).toEqual([SL, 'hero.json', 'saves/x.tmp']);
    for (const name of refused) {
      expect(savePathRefusal(name), `${name} quotes the sentence the door throws`).toBe(refusal(() => resolveSavePath(name)));
    }
  });
});

describe('how narrow the rule is', () => {
  it('the naming rule has one owner: the split that reads a name is the split that refuses it', () => {
    const shipped = readSource('src/saveStore.ts');
    const splitters = countOf(shipped, 'split(/[\\\\/]/)');
    expect(splitters, 'one segment split over [ \\/ ]; a second owner restarts this divergence').toBe(1);
    expect(countOf(shipped, "segments.join('/') !== path"), 'the re-join is the clause that owns this refusal').toBe(1);
    expect(countOf(shipped, "segment.includes('\\\\')"), 'a segment scan cannot see the backslash the split already ate; it was measured firing').toBe(0);
    expect(countOf(shipped, 'function savePathRefusal')).toBe(1);
    expect(countOf(shipped, 'throw new Error'), 'the scan reads a real file').toBeGreaterThan(10);
  });

  it('the three surveys that re-enter a listed name all ask the door, and none of them keys a branch on its wording', () => {
    const shipped = readSource('src/threeRuntime.ts');
    expect(countOf(shipped, 'savePathRefusal(path)')).toBe(3);
    expect(countOf(shipped, "'name-not-reenterable'")).toBe(3);
    expect(countOf(shipped, 'storage.list()')).toBe(4);
  });

  it('a refusal is not a rewrite: no caller of the seam canonicalises a name before storing it', () => {
    const shipped = readSource('src/saveStore.ts');
    expect(countOf(shipped, "replace(/\\\\/g, '/')" ), 'canonicalising was measured and rejected: delete() would answer "held nothing" about a file the host holds').toBe(0);
  });
});

function refusal(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected a refusal and got none');
}

function readSource(relative: string): string {
  return readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}
