// NEXUS v567 (tools/ci) — THE TREE GUARD: a directory OUTSIDE the repository that holds a reparse point
// (symlink or Windows junction) resolving INSIDE it must never be deleted by a tool that follows links,
// because such a delete lands in the graded tree itself (ADR 0016 amendment 542).
//
// Why this exists, measured rather than remembered: on 2026-11-02 this lane ran `git worktree remove --force`
// on a scratch worktree whose `node_modules/@nexus/*` were junctions into the checkout (npm makes them
// absolute). The removal deleted THROUGH the junctions and 522 tracked files — apps/studio, agents/runtime,
// agents/exec-host, packages/* — vanished from the working tree; only `git checkout` of HEAD's bytes put them
// back, and the concurrent lane's UNCOMMITTED edits inside them were not recoverable. A probe on the same box
// (git 2.52.0.windows.1, Node 24.18, MSYS coreutils 8.32) measured which instruments follow:
//   `git worktree remove --force`  → deletes THROUGH a junction (target emptied); a plain symlink survives
//   `git worktree remove` (no -f)  → REFUSES while the worktree holds untracked files, so it never walks
//   `fs.rmSync(dir,{recursive})`   → removes the link, target intact
//   `rm -rf` (MSYS) / `rmdir /S /Q`→ removes the link, target intact
// So the guarantee this repo's own teardowns rest on belongs to ONE instrument (Node), and the hazard belongs
// to a command a person types. This module names the links before either runs.
//
// The ORDER of the unlinking is not a detail, and this file learned it the same day it was written: the guard's
// first live run named `D:/…/nexus-pkgcounts-wt/node_modules` as a single link into the checkout, while an
// earlier command of this lane had already removed seven links found by listing `…/node_modules/@nexus` — a path
// reached THROUGH that first link. Listing through a link is listing the tree, so the seven entries deleted were
// the checkout's own workspace links (recreated the same hour, and every gate re-run afterwards). The rule the
// refusal below carries: scan first, unlink what the scan NAMES, and never walk a path through a link.
//
// CLI, from anywhere:
//   node tools/ci/tree-guard.mjs --check <dir> [--root <repo>]     # 0 clean · 1 links into the tree · 2 unreadable
//   node tools/ci/tree-guard.mjs --worktrees [--root <repo>]       # every registered worktree outside the root
// The remedy it prints is the safe one: remove the LINK (`fs.rmdirSync` on it drops the reparse point and
// never touches the target), then delete the directory.
import { execFileSync } from 'node:child_process';
import { lstatSync, readlinkSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** How many entries one scan reads before it stops and says so — a truncating scan must not read as clean. */
export const SCAN_CAP = 200_000;

export const REMEDY =
  'remove the LINK first — node -e "require(\'fs\').rmdirSync(process.argv[2])" "<link>" — which drops the reparse point and leaves the target; then delete the directory';

/** Is `child` the same directory as `root` or below it? Path-wise, without touching the disk. */
export function inside(child, root) {
  const r = relative(resolve(root), resolve(child));
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
}

/**
 * Every regular file and every reparse point under `dir`, WITHOUT descending through a link. Descending is the
 * bug this whole file exists to avoid: a walker that walks through a junction reports the target's own files as
 * if they lived in the plane, and a guard built on that count cannot tell a plane from a tree.
 */
export function scan(dir, cap = SCAN_CAP) {
  const files = [];
  const links = [];
  let entries = 0;
  let truncated = false;
  const stack = [resolve(dir)];
  while (stack.length && !truncated) {
    const d = stack.pop();
    let names;
    try {
      names = readdirSync(d);
    } catch {
      continue; // an unreadable subdirectory is not a link into the tree; the caller's own read decides that.
    }
    for (const name of names) {
      if (++entries > cap) {
        truncated = true;
        break;
      }
      const p = resolve(d, name);
      let st;
      try {
        st = lstatSync(p);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) links.push(p);
      else if (st.isDirectory()) stack.push(p);
      else files.push(p);
    }
  }
  return { files, links, entries, truncated };
}

/** Where a link points, resolved the way the OS resolves it: against the directory holding the link. */
export function targetOf(link) {
  return resolve(dirname(link), readlinkSync(link));
}

/**
 * The question a teardown asks: does deleting `dir` risk `root`? A directory INSIDE the tree is exempt by
 * definition — this repository's own `node_modules/@nexus/*` are links into `apps/`, `agents/` and `packages/`,
 * and a rule that refused them would refuse the checkout it protects.
 */
export function linksInto(dir, root) {
  const d = resolve(dir);
  const r = resolve(root);
  if (inside(d, r)) return { dir: d, root: r, contained: true, links: [], entries: 0, truncated: false };
  const self = (() => {
    try {
      return lstatSync(d).isSymbolicLink();
    } catch {
      return false;
    }
  })();
  const s = scan(d);
  const hits = s.links
    .map((link) => ({ link, target: targetOf(link) }))
    .filter((x) => inside(x.target, r));
  if (self) hits.unshift({ link: d, target: targetOf(d) });
  return { dir: d, root: r, contained: false, links: hits, entries: s.entries, truncated: s.truncated };
}

/** The refusal a person can act on: which links, where each lands, how many were seen, and the safe command. */
export function refusalOf(inspection) {
  const named = inspection.links
    .slice(0, 12)
    .map((x) => `      ${x.link}\n   -> ${x.target}`)
    .join('\n');
  const more = inspection.links.length > 12 ? `   … and ${inspection.links.length - 12} more\n` : '';
  return (
    `${inspection.dir} holds ${inspection.links.length} reparse point(s) resolving INSIDE ${inspection.root}. ` +
    `Deleting the directory with an instrument that follows them deletes THROUGH it into the tree — measured on ` +
    `this box: \`git worktree remove --force\` empties the target.\n${named}\n${more}` +
    `   Each link named here is the OUTERMOST one on its path: the scan never descends through a link, so a link ` +
    `below it is reached only by walking the target — which is the tree, not the plane. Unlink what is named, ` +
    `in this order, and nothing deeper needs touching.\n   ${REMEDY}`
  );
}

export function assertRemovable(dir, root) {
  const inspection = linksInto(dir, root);
  if (inspection.truncated) {
    throw new Error(`${inspection.dir}: the scan stopped at its ${SCAN_CAP}-entry cap, so "no links" would be a guess — refuse or narrow the directory`);
  }
  if (inspection.links.length) throw new Error(refusalOf(inspection));
  return inspection;
}

/** The directories git would delete if asked to remove a worktree. */
export function worktrees(root) {
  const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
  return out
    .split(/\r?\n/)
    .filter((l) => l.startsWith('worktree '))
    .map((l) => resolve(l.slice('worktree '.length).trim()));
}

/** The live question, answerable in a build: is any registered worktree of this repo a loaded hazard right now? */
export function inspectWorktrees(root, list = worktrees(root)) {
  const outside = list.filter((w) => !inside(w, root));
  const findings = outside.map((w) => linksInto(w, root));
  return { root: resolve(root), listed: list.length, outside, findings, links: findings.flatMap((f) => f.links) };
}

function summarize(label, i) {
  if (i.contained) return `${label}: ${i.dir} is inside ${i.root} — exempt (a tree's own links are not this rule's subject)`;
  const state = i.links.length ? `REFUSED · ${i.links.length} into the tree` : 'clean';
  return `${label}: ${i.dir} — ${state} · ${i.entries} entries read${i.truncated ? ' (TRUNCATED at cap)' : ''}`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  const opt = (name, at) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + (at ?? 1)] : null;
  };
  const root = opt('--root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const run = (dir) => {
    const i = linksInto(dir, root);
    console.log(summarize('check', i));
    if (i.links.length) console.log(refusalOf(i));
    return i.links.length ? 1 : i.truncated ? 2 : 0;
  };
  if (argv.includes('--worktrees')) {
    const w = inspectWorktrees(root);
    console.log(`[tree-guard] ${w.listed} registered worktree(s) of ${w.root} · ${w.outside.length} outside it · ${w.links.length} link(s) into the tree`);
    for (const f of w.findings) {
      console.log('  ' + summarize('worktree', f));
      if (f.links.length) console.log(refusalOf(f));
    }
    process.exitCode = w.links.length ? 1 : w.findings.some((f) => f.truncated) ? 2 : 0;
  } else if (argv.includes('--check')) {
    process.exitCode = run(opt('--check'));
  } else {
    console.error('usage: node tools/ci/tree-guard.mjs --check <dir> [--root <repo>] | --worktrees [--root <repo>]');
    process.exitCode = 2;
  }
}
