// scratch pre-check: build a plane for the three §12 arms and judge them, before committing to a full
// arms run (~12 min). Mirrors the tool's own machinery: same closure, same append, same frontier rule.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePopulation, splitSet } from '../tools/ci/proof-set.mjs';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLANE = resolve(SRC, '..', 'nexus-pre12-plane');
const pkg = JSON.parse(readFileSync(join(SRC, 'package.json'), 'utf8'));
const population = derivePopulation(pkg.scripts);
const CLOSURE = [...new Set([
  'package.json', '.github/workflows/ci.yml', 'tools/ci/proof-set.mjs', 'docs/evidence/agents/sweep.mjs',
  'docs/evidence/ci/ci-wiring-proof.mjs', ...population.map((d) => d.file),
])];
const CLAUSES = ['§1', '§2', '§3', '§4', '§5', '§6', '§7', '§8', '§9', '§10', '§11', '§12'];
const COLOR = 'docs/evidence/agents/color-proof.mjs';
const SWEEP = 'docs/evidence/agents/sweep.mjs';

const APPEND = {
  A25: `console.log('[cleanup] an arm puts a housekeeping print back below the row summary');`,
  C1: `console.log('[measured] an arm plants a tail that is not cleanup');`,
  C2: `console.log('[cleanup] an arm plants this below a HELPER, whose tail §12 has no business reading');`,
};

function build(tag, file, text) {
  const dir = join(PLANE, tag);
  rmSync(dir, { recursive: true, force: true });
  for (const rel of CLOSURE) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    let body = readFileSync(join(SRC, rel), 'utf8');
    if (rel === file) {
      const eol = body.includes('\r\n') ? '\r\n' : '\n';
      body = `${body.endsWith('\n') ? body : body + eol}${text.split('\n').join(eol)}${eol}`;
    }
    writeFileSync(p, body, 'utf8');
  }
  return dir;
}

try {
  for (const [tag, expect] of [['A25', '§12'], ['C1', null], ['C2', null]]) {
    const file = tag === 'C2' ? SWEEP : COLOR;
    const dir = build(tag, file, APPEND[tag]);
    const r = spawnSync(process.execPath, [join(dir, 'docs/evidence/ci/ci-wiring-proof.mjs')], { cwd: dir, encoding: 'utf8', windowsHide: true });
    const out = r.stdout || '';
    const err = r.stderr || '';
    const passed = [...new Set([...out.matchAll(/^\[(§\d+)\]/gm)].map((m) => m[1]))];
    if (expect === null) {
      const okExit = r.status === 0;
      const okTags = passed.join(' ') === CLAUSES.join(' ');
      console.log(`${okExit && okTags ? 'MATCHED ' : 'MISMATCH'} ${tag} exit=${r.status} tags=[${passed.join(' ')}]${okExit ? '' : `\nstderr: ${err.slice(0, 700)}`}`);
    } else {
      const beyond = passed.filter((t) => CLAUSES.indexOf(t) >= CLAUSES.indexOf(expect));
      const missing = CLAUSES.slice(0, CLAUSES.indexOf(expect)).filter((t) => !passed.includes(t));
      const sig = /end their SOURCE on a housekeeping print/.test(err);
      const ok = r.status === 1 && !missing.length && !beyond.length && sig;
      console.log(`${ok ? 'MATCHED ' : 'MISMATCH'} ${tag} exit=${r.status} firstRedAt=${passed.at(-1) ?? 'none'} missing=[${missing.join(' ')}] beyond=[${beyond.join(' ')}] sig=${sig}`);
      if (!ok) console.log(`  stderr head: ${err.split('\n').slice(0, 6).join(' | ').slice(0, 500)}`);
      else console.log(`  refusal: ${err.split('\n').find((l) => /housekeeping print/.test(l))?.slice(0, 260)}`);
    }
  }
} finally {
  rmSync(PLANE, { recursive: true, force: true });
  console.log(`plane removed: ${!existsSync(PLANE)}`);
}
