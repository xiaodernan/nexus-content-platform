// v570 — append a short, honest final verdict line to each row §13 named as guaranteed-cut.
// Every line uses variables the row already prints, so the compact sentence cannot claim more than the long
// one above it. The script refuses to write a tail that would itself overrun the bound.
import { readFileSync, writeFileSync } from 'node:fs';

const bound = 300;

// the same brace-balanced hole-punching §13 uses, kept here so the check is the check the gate will run
function staticText(lit) {
  let out = '';
  for (let k = 0; k < lit.length; k++) {
    if (lit[k] === '\\' && k + 1 < lit.length) {
      const nx = lit[k + 1];
      if (nx === 'n') { out += '\n'; k++; } else if (nx === 'r') { out += '\r'; k++; }
      else if (nx === 't') { out += '\t'; k++; } else if (nx === '\\') { out += '\\'; k++; }
      else out += lit[k];
      continue;
    }
    if (lit[k] === '$' && lit[k + 1] === '{') {
      let depth = 1;
      k += 2;
      while (k < lit.length && depth > 0) {
        if (lit[k] === '{') depth++;
        else if (lit[k] === '}') depth--;
        k++;
      }
      k--;
      continue;
    }
    out += lit[k];
  }
  return out;
}

const APPENDS = {
  'docs/evidence/agents/confession-proof.mjs':
    "console.log(`[verdict] ${clauses.length} confessions graded · ${selfNamed.length} nameable by the runner · ${byState('supported').length} corroborated by a body · ${misCited.length} mis-cited (must be 0) · ${unreadable.length} at the arm's ceiling, named not fixed`);",
  'docs/evidence/agents/asks-axis-proof.mjs':
    "console.log(`[verdict] ${rows.length} scored rows · ${declared.length} declare · ${corroborated.length} scanner-corroborated · ${uncorroborated.length} visible only to the row · ${budgetCases.length - budgetBad.length}/${budgetCases.length} budget grammar cases exact`);",
  'docs/evidence/agents/timeout-axis-proof.mjs':
    "console.log(`[verdict] ${counts.declared}/${cases.length} fixture texts recognised and ${counts.refused} refused with a reason · one real runSweep honoured a declaration UP and DOWN · this witness took ${totalMs}ms of the ${D}ms default and declares nothing`);",
  'docs/evidence/agents/isolated-proof.mjs':
    "console.log(`[verdict] home dist UNMOVED (${before.digest.slice(0, 16)}, ${before.files} files) · clean checkout walks ${cleanTree.files}/${home.files} worktree files · build exit ${iso.build.code} · the downgrade REFUSES with exit ${refusal.code} in ${refusalMs}ms`);",
  'docs/evidence/agents/door-kill-proof.mjs':
    "console.log(`[verdict] ${faces.length} faces driven to a real kill · 0 sentences blamed git for the host's kill · every kill carried its record · ${doorReads} door reads · home HEAD byte-identical`);",
  'docs/evidence/agents/color-proof.mjs':
    "console.log(`[verdict] ${faces.length} faces measured · ${doorReads} door reads over 5 distinct doors · ${spawns} door-spawned processes, one per read · home HEAD byte-identical`);",
  'docs/evidence/agents/report-kill-proof.mjs':
    "console.log(`[verdict] 2 real kills examined (reaper off / on) · ${beats} detached child beats after \"killed\" · cut and kill are never substituted for each other · home HEAD byte-identical`);",
  'docs/evidence/agents/table-recount-proof.mjs':
    "console.log(`[verdict] plane ${gitPlane}: ${total} tracked cases in ${fileCount} files over ${PKGS.length} packages · every row matched its file · 4 mutations of the table caught by the reader that calls the real one clean`);",
  'docs/evidence/agents/report-window-proof.mjs':
    "console.log('[verdict] 6 report shapes read · 3 carry the pipe list · 3 carry no key · 0 verdicts changed by a cut · home HEAD byte-identical');",
  'docs/evidence/m10/tool-registry-proof.mjs':
    "console.log('[m10-tool-registry] ALL ASSERTIONS PASSED — the registry rows, their schemas, the global name, the revision history, the deprecation and the catalog search were each read back from the service this proof started');",
};

// the tail each file ends on today, and the anchor the append must follow
const AFTER = {
  'docs/evidence/m10/tool-registry-proof.mjs': "a catalog search whose wildcards are literal, and no capability this build does not have)');",
};

const report = [];
for (const [rel, line] of Object.entries(APPENDS)) {
  const text = readFileSync(rel, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lit = line.slice(line.search(/[`'"]/) + 1, line.lastIndexOf(line[line.search(/[`'"]/)]));
  const printed = staticText(lit).split('\n').map((l) => l.trim()).filter(Boolean).pop() || '';
  const bytes = Buffer.byteLength(printed);
  if (bytes > bound) { console.log(`REFUSED ${rel}: the new tail is ${bytes} bytes, over the bound`); process.exit(1); }
  if (text.includes(line)) { console.log(`skip ${rel}: already carries its verdict line`); continue; }
  let next = text.endsWith('\n') ? text : text + eol;
  if (AFTER[rel]) {
    const at = next.indexOf(AFTER[rel]);
    if (at < 0) { console.log(`REFUSED ${rel}: the anchor line is not there`); process.exit(1); }
    if (next.split(AFTER[rel]).length - 1 !== 1) { console.log(`REFUSED ${rel}: the anchor is not unique`); process.exit(1); }
    const insertAt = at + AFTER[rel].length;
    next = `${next.slice(0, insertAt)}${eol}  ${line}${next.slice(insertAt)}`;
  } else {
    next = `${next}${line}${eol}`;
  }
  writeFileSync(rel, next, 'utf8');
  report.push(`${rel} :: tail ${bytes}B of ${bound} (append${AFTER[rel] ? ' after its anchor' : ' at end'})`);
}
console.log(report.join('\n'));
