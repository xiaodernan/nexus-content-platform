#!/usr/bin/env tsx
/**
 * Deterministic re-pin of the echo/anchor counts after adding a world-bible echo.
 *
 * Why this exists: every new Echo requires the same edits — guideCopy (zh count, en count,
 * two locale phrasings), bible-ask-behavior (pin + trailing history comment), and
 * canon-answer-graph (heading count + toHaveLength). Doing them by hand with an exact
 * string replace keeps failing because the history comments are re-worded over time, so a
 * replace that matches one epoch silently misses the next. This tool re-pins by SHAPE
 * (a number literal adjacent to a stable token), never by a whole comment line.
 *
 * IMPORTANT — two DIFFERENT anchor counts exist and must not be conflated:
 *   - world-bible 锚句 (verify:world-bible) counts all main + echo anchors in the corpus.
 *   - the bible-ask-behavior / guideCopy "N bilingual anchor sentences" is the number the
 *     digest actually replays for the quiz, which is smaller (measured: 5 fewer as of E226).
 * Passing one number for both silently reddens the pin. Hence the tool takes BOTH numbers.
 *
 * ATOMICITY: all files are validated first; only when every replacement is found is any
 * file written. A missing token aborts with NO partial rewrite — the single worst failure
 * mode of the manual version this replaces.
 *
 * Usage:
 *   npx tsx scripts/repin-echo-counts.mts --echo 227 --pin 1371 --phrase 二百二十七 \
 *       --phrase-en "two hundred twenty-seven"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  const value = i >= 0 ? args[i + 1] : undefined;
  return value !== undefined ? value : null;
};
const num = (name: string): number | null => {
  const v = flag(name);
  return v !== null && /^\d+$/.test(v) ? Number(v) : null;
};

const echo = num('echo');
const pin = num('pin');
const zhPhrase = flag('phrase');
const enPhrase = flag('phrase-en');
if (!echo || !pin || !zhPhrase || !enPhrase) {
  console.error('usage: npx tsx scripts/repin-echo-counts.mts --echo <N> --pin <N> --phrase <中文> --phrase-en <en>');
  process.exit(2);
}

const behaviorPath = 'apps/web/test/bible-ask-behavior.test.ts';
const graphPath = 'apps/web/test/canon-answer-graph.test.ts';
const guidePath = 'apps/web/src/lib/guideCopy.ts';

const behavior = readFileSync(join(ROOT, behaviorPath), 'utf8');
const pins = [...behavior.matchAll(/expect\((zh|en)\)\.toBe\((\d+)\)/g)];
const zhPin = pins.find((m) => m[1] === 'zh');
const enPin = pins.find((m) => m[1] === 'en');
if (!zhPin || !enPin || zhPin[2] !== enPin[2]) {
  console.error('cannot determine a unique current anchor pin (zh/en differ or missing)');
  process.exit(1);
}
const oldPin = Number(zhPin[2]);

const graph = readFileSync(join(ROOT, graphPath), 'utf8');
// The echo count is `expect(echoes).toHaveLength(N)`, NOT the chapter count 14.
const gm = graph.match(/expect\(echoes\)\.toHaveLength\((\d+)\)/);
const oldEcho = gm ? Number(gm[1]) : null;
if (!oldEcho || !(oldEcho === echo || oldEcho + 1 === echo)) {
  console.error(`cannot confirm echo increment: graph pin=${oldEcho}, requested echo=${echo}`);
  process.exit(1);
}

const guide = readFileSync(join(ROOT, guidePath), 'utf8');
const zhOld = [...guide.matchAll(/([二百千万零一二三四五六七八九十]+)回响/g)].map((m) => m[1]).pop();
const enOld = [...guide.matchAll(/(two hundred [\w-]+) echoes/g)].map((m) => m[1]).pop();
const graphHeadingOld = `14 章 + ${oldEcho} 回响`;
if (!zhOld || !enOld || !graph.includes(graphHeadingOld)) {
  console.error(`cannot locate current echo phrases: zh=${zhOld}, en=${enOld}, graph heading=${graphHeadingOld}`);
  process.exit(1);
}

// Phase 1: build every target string in memory and validate all tokens exist.
const plan: Array<{ path: string; text: string; pairs: Array<[string, string]> }> = [
  { path: guidePath, text: guide, pairs: [
    [zhOld, zhPhrase],
    [enOld, enPhrase],
    [String(oldPin), String(pin)],
  ] },
  { path: behaviorPath, text: behavior, pairs: [
    [`expect(zh).toBe(${oldPin})`, `expect(zh).toBe(${pin})`],
    [`expect(en).toBe(${oldPin})`, `expect(en).toBe(${pin})`],
  ] },
  { path: graphPath, text: graph, pairs: [
    [graphHeadingOld, `14 章 + ${echo} 回响`],
    [`toHaveLength(${oldEcho})`, `toHaveLength(${echo})`],
  ] },
];
const staged: Array<{ path: string; text: string }> = [];
for (const item of plan) {
  let text = item.text;
  for (const [from, to] of item.pairs) {
    if (from === to) continue;
    if (!text.includes(from)) {
      console.error(`  ${item.path}: missing ${JSON.stringify(from)} — aborting with NO writes`);
      process.exit(1);
    }
    text = text.split(from).join(to);
  }
  staged.push({ path: item.path, text });
}

// Phase 2: all tokens validated — write everything.
let wrote = false;
for (const item of staged) {
  const full = join(ROOT, item.path);
  if (item.text !== readFileSync(full, 'utf8')) {
    writeFileSync(full, item.text, 'utf8');
    wrote = true;
  }
  console.log(`  ${item.path}: ${wrote ? 'updated' : 'unchanged'}`);
}
console.log(wrote
  ? `re-pinned: echoes ${oldEcho}→${echo}, quiz anchors ${oldPin}→${pin}`
  : `already at echoes ${echo}, quiz anchors ${pin} — no-op`);
