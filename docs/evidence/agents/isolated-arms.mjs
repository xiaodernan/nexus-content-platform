// NEXUS M2 v84 (docs/evidence) — a HUMAN-RUN tool, not a proof (v79's rule: a tool is not a test of
// itself, and the sweep's corpus selector takes `*-proof.mjs`, so this file is never scheduled as a row).
//
// It exists because of one sentence in amendment 84: the two clean-room BUILD verdicts that increment
// quotes were measured once, back to back, on one box, and no tracked proof re-runs them — each arm is a
// full `npm run build` of a fresh checkout, which is 513 s and 522 s measured under load against the
// 240 000 ms a sweep row is given. A number nobody can re-measure is a number a later reader has to take
// on faith, so the script that produced it is committed here.
//
// What it does: extracts HEAD's clean checkout TWICE, once on the drive `os.tmpdir()` sits on and once on
// the repository's own drive, builds both, and prints each arm's verdict with the drive it was built on.
// Nothing is written inside the repository; the home build digest and the home `node_modules` entry count
// are measured before and after both arms, because a junction cleanup that followed its target would be
// the one way this experiment could cost the user real work.
//
//     node docs/evidence/agents/isolated-arms.mjs            # ~18 minutes on this box, both arms
//     node docs/evidence/agents/isolated-arms.mjs --no-build # the drive axis alone, ~25 seconds
//
// Measured run (2026-09-26, HEAD ea093f7, tmpdir on C:, repository on D:):
//   [A-cross-drive-C] build exit 1 in 522.4s · 55 lines · failed ["@nexus/studio#build"]
//     reason "@nexus/studio:build: Module not found: Error: Can't resolve './D:/终极项目/node_modules/next/dist/client/next.js' in 'C:\Users\18414\AppData\Local\Temp\nexus-isoA-jNseWP\repo\apps\studio'"
//   [B-same-drive-D]  build exit 0 in 513.0s · 59 lines · failed [] · reason NONE CAPTURED
//   [after] home dist 8b3ff8b0e7f62133 (224 files) · home node_modules 309 entries · UNMOVED=true
// The quoted reason line is the string `drive-axis-proof.mjs` §2 re-derives from this box's paths, so it
// must stay on the line with `Can't resolve` and un-paraphrased: a witness compares them byte for byte.
// A quiet box builds faster (v81 measured 212.6 s for the same arm), so the DURATIONS are load-dependent
// while the exit codes are the finding.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sw = await import(pathToFileURL(join(root, 'docs/evidence/agents/sweep.mjs')).href);
const log = (l) => console.log(String(l));
const build = !process.argv.includes('--no-build');

const homeBefore = sw.distDigest(root);
const nmBefore = readdirSync(join(root, 'node_modules')).length;
log(`[before] home dist ${homeBefore.digest.slice(0, 16)} (${homeBefore.files} files) · home node_modules ${nmBefore} entries · tmpdir ${tmpdir()} · repository on ${sw.driveOf(root)}`);

// Arm A asks for the pre-v84 default explicitly, so the comparison survives the fix: `isolatedDest()` now
// refuses to choose tmpdir on a box like this one, which is exactly why a plain default call could no
// longer produce the cross-drive arm at all.
const otherDriveDest = () => mkdtempSync(join(tmpdir(), 'nexus-arm-'));
const arms = [
  { tag: 'A-tmpdir', dest: otherDriveDest(), expect: 'whatever drive os.tmpdir() is on — pre-v84 this WAS the default' },
  { tag: 'B-default', dest: null, expect: 'isolatedDest(): the repository drive when tmpdir disagrees with it' },
];
const results = [];
for (const arm of arms) {
  const t0 = Date.now();
  try {
    const iso = await sw.isolatedCheckout({ ref: 'HEAD', cwd: root, ...(arm.dest ? { dest: arm.dest } : {}), build, log });
    results.push({ ...arm, iso, ms: Date.now() - t0 });
  } catch (e) {
    results.push({ ...arm, error: e.message, ms: Date.now() - t0 });
  }
}

for (const r of results) {
  if (r.error) { log(`[${r.tag}] THREW after ${(r.ms / 1000).toFixed(1)}s: ${r.error.slice(0, 300)}`); continue; }
  const b = r.iso.build;
  log(`[${r.tag}] dest ${r.iso.dir} on ${r.iso.destDrive} vs repository on ${r.iso.repoDrive} · ${r.iso.driveMismatch ? 'CROSS-DRIVE' : 'SAME DRIVE'} (chosen: ${r.iso.destChoice})${build ? ` · build exit ${b.code}${b.timedOut ? ' TIMEOUT' : ''} in ${(b.ms / 1000).toFixed(1)}s · ${b.lines} lines · failed ${JSON.stringify(b.failed)} · reason ${b.reason ? JSON.stringify(b.reason.slice(0, 220)) : 'NONE CAPTURED'} · log ${b.logFile}` : ` · no build ran (--no-build), ${r.ms}ms to extract and link`}`);
}

const homeAfter = sw.distDigest(root);
const nmAfter = readdirSync(join(root, 'node_modules')).length;
const unmoved = homeAfter.digest === homeBefore.digest && nmAfter === nmBefore;
log(`\n[after] home dist ${homeAfter.digest.slice(0, 16)} (${homeAfter.files} files) · home node_modules ${nmAfter} entries · UNMOVED=${unmoved}`);
for (const r of results) {
  if (!r.iso) continue;
  log(`[cleanup] rmSync ${r.iso.dir}`);
  rmSync(r.iso.dir, { recursive: true, force: true });
}
// The exit code is the honest shape of a two-arm comparison: an arms run whose home build moved has
// proven nothing about isolation, whatever the two verdicts said.
process.exit(unmoved ? 0 : 1);
