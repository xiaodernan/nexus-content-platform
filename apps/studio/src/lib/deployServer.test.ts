import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createStudioDeploySink,
  deployArcState,
  nodeDeployFs,
  readStudioDeployRecords,
  runStudioDeployArc,
  studioDeployCheckpointPolicyError,
  STUDIO_DEPLOY_CHECKPOINT_POLICY,
  STUDIO_DEPLOY_RECORDS_PATH,
  STUDIO_DEPLOY_RECORDS_SHOWN,
  studioDeployRecordCount,
  type DeployRecord,
  type StudioDeployFs,
} from './deployServer';
import { STUDIO_BUILD_ARC_ID, STUDIO_BUILD_GOAL } from './buildServer';

/**
 * Minimal SpawnLike fake — the host never knows it is not docker. Unlike v174's, the
 * stdout is derived from the argv, so the facts the sink receives are distinguishable:
 * `--version` answers v22.11.0, the compute step answers arc ok:5.
 *
 * M5 v263 — the EXIT CODE is the first argument, and the stdout may be overridden.
 *
 * This file's red-verdict case used to read `fakeSpawn('', 0)` — a call shaped like
 * `buildServer.test.ts`'s fake, which takes the STDOUT first. This fake has always taken the
 * exit code first, so both arguments landed the empty string WHERE THE EXIT CODE GOES and the
 * case went red because `'' !== 0`, not because of anything the stdout did. The verdict the
 * shipped code computes is `exitCode === 0 && !result.killedByBudget`
 * (agents/exec-host/src/containerVerifier.ts) — the STDOUT IS NOT PART OF IT, so an empty
 * stdout with a zero exit code is GREEN. The stdout override below exists so a case can say
 * that out loud instead of by accident.
 */
function fakeSpawn(code: number | null = 0, stdout?: string) {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const spawnLike = (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    const out = stdout ?? (args.includes('--version') ? 'v22.11.0\n' : 'arc ok:5\n');
    return {
      onData: (l: (s: 'stdout' | 'stderr', c: Buffer | string) => void) => l('stdout', Buffer.from(out)),
      onEnd: (l: (e: { code: number | null; signal: string | null; error?: string }) => void) => {
        setImmediate(() => l({ code, signal: null }));
      },
      kill: () => {},
    };
  };
  return { spawnLike, calls };
}

/** An in-memory fs the records land in — the fake that proves where the words went. */
function fakeFs() {
  const files = new Map<string, string>();
  const appends: Array<{ path: string; data: string }> = [];
  const fs: StudioDeployFs = {
    appendFileSync: (path, data) => {
      appends.push({ path, data });
      files.set(path, (files.get(path) ?? '') + data);
    },
    readFileSync: (path, encoding) => {
      const raw = files.get(path);
      if (raw === undefined) throw new Error(`no file at ${path}`);
      if (encoding !== 'utf8') throw new Error(`unsupported encoding ${String(encoding)}`);
      return raw;
    },
  };
  return { fs, files, appends };
}

/** Parse the records file the way a cold reader would. */
function readRecords(files: Map<string, string>, path: string): DeployRecord[] {
  const raw = files.get(path) ?? '';
  return raw
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as DeployRecord);
}

describe('studio deploy lane facts (v177)', () => {
  it('pins the §28 policy: deploy.record granted on record, everything else default-deny', () => {
    expect(STUDIO_DEPLOY_RECORDS_PATH).toBe('.nexus/deployments.jsonl');
    expect(studioDeployCheckpointPolicyError()).toBeNull();
    expect(STUDIO_DEPLOY_CHECKPOINT_POLICY.rules[0]!.tool).toBe('deploy.record');
    expect(STUDIO_DEPLOY_CHECKPOINT_POLICY.default.grant).toBe(false);
  });

  it('the sink writes the engine\'s own words to the records file and refuses nothing silently', async () => {
    const { fs, files, appends } = fakeFs();
    const { sink, records } = createStudioDeploySink({ fs, recordsPath: 'records.jsonl', arcId: 'a1', goal: 'g', engine: 'container:node:22-alpine' });
    const ok = await sink({ arcId: 'a1', stepId: 's1', fact: 'arc ok:5\n' });
    expect(ok.ok).toBe(true);
    expect(ok.detail).toContain('recorded s1 → records.jsonl');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ arcId: 'a1', goal: 'g', stepId: 's1', fact: 'arc ok:5\n' });
    expect(appends).toHaveLength(1);
    const stored = readRecords(files, 'records.jsonl');
    expect(stored[0]!.fact).toBe('arc ok:5\n');

    const broken: StudioDeployFs = { ...fs, appendFileSync: () => { throw new Error('disk full'); } };
    const refused = createStudioDeploySink({ fs: broken, recordsPath: 'records.jsonl', arcId: 'a1', goal: 'g', engine: 'e' });
    const bad = await refused.sink({ arcId: 'a1', stepId: 's2', fact: 'x' });
    expect(bad.ok).toBe(false);
    expect(bad.detail).toContain('the record did not land');
    expect(bad.detail).toContain('disk full');
  });

  it('counts the durable lines already on file — 0 when none exist', () => {
    const { fs, files } = fakeFs();
    expect(studioDeployRecordCount({ fs, recordsPath: 'r.jsonl' })).toBe(0);
    files.set('r.jsonl', '{"a":1}\n\n{"b":2}\n');
    expect(studioDeployRecordCount({ fs, recordsPath: 'r.jsonl' })).toBe(2);
  });
});

describe('studio deploy lane walk (v177, fake spawn, fake fs)', () => {
  it('a green build arc deploys its measured facts — sink first, records on file, receipts on record', async () => {
    const { spawnLike } = fakeSpawn();
    const { fs, files } = fakeFs();
    const a = await runStudioDeployArc({ spawnLike, fs, recordsPath: 'records.jsonl' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('recorded');
    expect(a.goal).toBe(STUDIO_BUILD_GOAL);
    expect(a.detail).toContain('2 fact(s) recorded → records.jsonl');
    expect(a.build.status).toBe('completed');
    expect(a.facts.map((f) => f.stepId)).toEqual(['runtime', 'compute']);
    expect(a.facts.map((f) => f.stdout)).toEqual(['v22.11.0\n', 'arc ok:5\n']);
    expect(a.unmeasured).toEqual([]);
    expect(a.recordsPath).toBe('records.jsonl');
    expect(a.deployReceipts).toHaveLength(2);
    expect(a.deployReceipts.map((r) => r.callId)).toEqual([`${STUDIO_BUILD_ARC_ID}:deploy:runtime`, `${STUDIO_BUILD_ARC_ID}:deploy:compute`]);
    expect(a.deployReceipts.every((r) => r.granted)).toBe(true);
    const stored = readRecords(files, 'records.jsonl');
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ arcId: STUDIO_BUILD_ARC_ID, stepId: 'runtime', fact: 'v22.11.0\n' });
    expect(stored[1]).toMatchObject({ stepId: 'compute', fact: 'arc ok:5\n' });
    expect(typeof stored[0]!.at).toBe('number');
  });

  it('a narrower goal deploys exactly the facts its own arc measured', async () => {
    const { spawnLike } = fakeSpawn();
    const { fs, files } = fakeFs();
    const a = await runStudioDeployArc({ spawnLike, fs, goal: 'check the numbers' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('recorded');
    expect(a.facts).toHaveLength(1);
    expect(a.facts[0]).toEqual({ stepId: 'compute', stdout: 'arc ok:5\n' });
    expect(readRecords(files, STUDIO_DEPLOY_RECORDS_PATH)).toHaveLength(1);
  });

  it('a red build arc deploys NOTHING — not-green, zero appends, zero receipts', async () => {
    const { spawnLike } = fakeSpawn(3);
    const { fs, appends, files } = fakeFs();
    const a = await runStudioDeployArc({ spawnLike, fs });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('not-green');
    expect(a.reason).toContain('verified red');
    expect(a.detail).toContain('did not complete (failed)');
    expect(a.build.status).toBe('failed');
    expect(a.facts).toEqual([]);
    expect(a.deployReceipts).toEqual([]);
    expect(a.recordsPath).toBeUndefined();
    expect(appends).toHaveLength(0);
    expect(files.size).toBe(0);
  });

  it('a goal that plans no arc is an honest unplanned deploy — zero spawn of the write door', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const { fs, appends } = fakeFs();
    const a = await runStudioDeployArc({ spawnLike, fs, goal: 'zzz qqq nonsense' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('unplanned');
    expect(a.detail).toContain('nothing deployed');
    expect(a.facts).toEqual([]);
    expect(appends).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('a sink that cannot write ends the walk failed — the fact named, the file untouched', async () => {
    const { spawnLike } = fakeSpawn();
    const broken: StudioDeployFs = {
      appendFileSync: () => { throw new Error('disk full'); },
      readFileSync: () => { throw new Error('no file'); },
    };
    const a = await runStudioDeployArc({ spawnLike, fs: broken });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('failed');
    expect(a.reason).toContain('disk full');
    expect(a.facts).toEqual([]);
    expect(a.recordsPath).toBeUndefined();
    // the walk stops at the first refused fact: exactly ONE door was asked (runtime's)
    expect(a.deployReceipts).toHaveLength(1);
    expect(a.deployReceipts[0]!.callId).toBe(`${STUDIO_BUILD_ARC_ID}:deploy:runtime`);
  });

  it('the state merges the probe with the records file facts (path + count)', async () => {
    const { spawnLike } = fakeSpawn();
    const { fs, files } = fakeFs();
    files.set(STUDIO_DEPLOY_RECORDS_PATH, '{"at":1}\n');
    const s = await deployArcState({ spawnLike, fs });
    expect(s.available).toBe(true);
    expect(s.recordsPath).toBe(STUDIO_DEPLOY_RECORDS_PATH);
    expect(s.recordCount).toBe(1);
    expect(s.steps).toHaveLength(2);
  });

  it('deploys accumulate on the file: a second, narrower deploy lands beside the first', async () => {
    const { spawnLike } = fakeSpawn();
    const { fs, files } = fakeFs();
    const first = await runStudioDeployArc({ spawnLike, fs, recordsPath: STUDIO_DEPLOY_RECORDS_PATH });
    const second = await runStudioDeployArc({ spawnLike, fs, goal: 'check the numbers' });
    expect(first.ok && first.status === 'recorded').toBe(true);
    expect(second.ok && second.status === 'recorded').toBe(true);
    const stored = readRecords(files, STUDIO_DEPLOY_RECORDS_PATH);
    expect(stored).toHaveLength(3);
    expect(studioDeployRecordCount({ fs, recordsPath: STUDIO_DEPLOY_RECORDS_PATH })).toBe(3);
    expect(stored.map((r) => r.stepId)).toEqual(['runtime', 'compute', 'compute']);
  });
});

describe('studio deploy records read-back (v178)', () => {
  it('a missing records file reads as an empty answer — the normal state before the first deploy', () => {
    const { fs } = fakeFs();
    expect(readStudioDeployRecords({ fs, recordsPath: 'r.jsonl' })).toEqual({ records: [], total: 0, malformed: 0 });
  });

  it('valid lines read back in file order, the fact byte for byte', async () => {
    const { spawnLike } = fakeSpawn();
    const { fs } = fakeFs();
    await runStudioDeployArc({ spawnLike, fs, recordsPath: 'r.jsonl' });
    const read = readStudioDeployRecords({ fs, recordsPath: 'r.jsonl' });
    expect(read.total).toBe(2);
    expect(read.malformed).toBe(0);
    expect(read.records.map((r) => r.stepId)).toEqual(['runtime', 'compute']);
    expect(read.records[0]!.fact).toBe('v22.11.0\n');
    expect(typeof read.records[0]!.at).toBe('number');
  });

  it('a line that is not a readable record is counted, never hidden', () => {
    const { fs, files } = fakeFs();
    files.set(
      'r.jsonl',
      [
        JSON.stringify({ at: 1, arcId: 'a', goal: 'g', stepId: 's1', fact: 'f1', engine: 'e' }),
        'not json at all',
        '{"at":2}',
        JSON.stringify({ at: 3, arcId: 'a', goal: 'g', stepId: 's2', fact: 'f2', engine: 'e' }),
        '',
      ].join('\n') + '\n',
    );
    const read = readStudioDeployRecords({ fs, recordsPath: 'r.jsonl' });
    expect(read.total).toBe(2);
    expect(read.malformed).toBe(2);
    expect(read.records.map((r) => r.stepId)).toEqual(['s1', 's2']);
  });

  it('the state exposes the read side: newest first, with the malformed count named', async () => {
    const { spawnLike } = fakeSpawn();
    const { fs, files } = fakeFs();
    await runStudioDeployArc({ spawnLike, fs, recordsPath: STUDIO_DEPLOY_RECORDS_PATH });
    files.set(STUDIO_DEPLOY_RECORDS_PATH, (files.get(STUDIO_DEPLOY_RECORDS_PATH) ?? '') + 'garbage\n');
    const s = await deployArcState({ spawnLike, fs });
    expect(s.recordCount).toBe(3);
    expect(s.malformed).toBe(1);
    expect(s.records).toHaveLength(2);
    expect(s.records[0]!.stepId).toBe('compute');
    expect(s.records[1]!.stepId).toBe('runtime');
    expect(s.records[0]!.fact).toBe('arc ok:5\n');
  });

  it('the state shows at most the display cap — newest first, the file keeps everything', async () => {
    const { spawnLike } = fakeSpawn();
    const { fs, files } = fakeFs();
    const lines: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      lines.push(JSON.stringify({ at: i, arcId: 'a', goal: 'g', stepId: `s${i}`, fact: `f${i}`, engine: 'e' }));
    }
    files.set(STUDIO_DEPLOY_RECORDS_PATH, lines.join('\n') + '\n');
    const s = await deployArcState({ spawnLike, fs });
    expect(s.recordCount).toBe(10);
    expect(s.records).toHaveLength(STUDIO_DEPLOY_RECORDS_SHOWN);
    expect(s.records[0]!.stepId).toBe('s9');
    expect(s.records[STUDIO_DEPLOY_RECORDS_SHOWN - 1]!.stepId).toBe(`s${9 - (STUDIO_DEPLOY_RECORDS_SHOWN - 1)}`);
    expect(readStudioDeployRecords({ fs, recordsPath: STUDIO_DEPLOY_RECORDS_PATH }).total).toBe(10);
  });

  describe('runStudioDeployArc — build-outcome branches', () => {
    it('returns not-green when the build arc fails (red verdict), recording nothing', async () => {
      // A RED VERDICT IS AN EXIT CODE, not an empty stdout: the verify door's own words are
      // `ok = result.exitCode === 0 && !result.killedByBudget`
      // (agents/exec-host/src/containerVerifier.ts), so exit 1 is what fails the build. The old call
      // `fakeSpawn('', 0)` put an empty string where the exit code goes, so the case went red by
      // that accident and the mechanism its comment named was never the one under test.
      const { spawnLike } = fakeSpawn(1);
      const s = await runStudioDeployArc({ spawnLike });
      expect(s.ok).toBe(true);
      if (!s.ok) throw new Error(`the deploy arc refused instead of answering: ${s.reason}`);
      expect(s.status).toBe('not-green');
      expect(s.facts).toEqual([]);
      expect(s.deployReceipts).toEqual([]);
    });

    it('returns unplanned when the goal summons no steps', async () => {
      const { spawnLike } = fakeSpawn();
      const s = await runStudioDeployArc({ spawnLike, goal: 'zzz qqq nonsense' });
      expect(s.ok).toBe(true);
      if (!s.ok) throw new Error(`the deploy arc refused instead of answering: ${s.reason}`);
      expect(s.status).toBe('unplanned');
      expect(s.facts).toEqual([]);
    });
  });
});

describe('nodeDeployFs — the production fs the sink lands on (v456)', () => {
  // Every other case in this file injects an in-memory fake. The DEFAULT is this one, and its two
  // decisions had no direct case: it makes the directory before it appends, and its reads are node's
  // own. A real temp directory is the honest witness — no fake can answer for mkdir.
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexus-deploy-fs-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appendFileSync CREATES the directory — a records path may be the first thing in it', async () => {
    const file = join(dir, 'deep', 'nested', 'deployments.jsonl');
    expect(existsSync(join(dir, 'deep'))).toBe(false);
    nodeDeployFs.appendFileSync(file, '{"arcId":"a"}\n');
    expect(existsSync(join(dir, 'deep', 'nested'))).toBe(true);
    expect(nodeDeployFs.readFileSync(file, 'utf8')).toBe('{"arcId":"a"}\n');
  });

  it('appendFileSync APPENDS — the records file is append-only, not rewritten', () => {
    const file = join(dir, 'records.jsonl');
    nodeDeployFs.appendFileSync(file, 'one\n');
    nodeDeployFs.appendFileSync(file, 'two\n');
    expect(nodeDeployFs.readFileSync(file, 'utf8')).toBe('one\ntwo\n');
  });

  it('readFileSync hands back the bytes as written — JSONL survives whole', () => {
    const file = join(dir, 'records.jsonl');
    const lines = ['{"a":1}', '{"b":"two words"}', '{"c":null}'].join('\n') + '\n';
    nodeDeployFs.appendFileSync(file, lines);
    expect(nodeDeployFs.readFileSync(file, 'utf8')).toBe(lines);
  });

  it('readFileSync on a missing file throws ENOENT — node’s own answer, not a fake’s', () => {
    expect(() => nodeDeployFs.readFileSync(join(dir, 'nope.jsonl'), 'utf8')).toThrow(/ENOENT/);
  });
});
