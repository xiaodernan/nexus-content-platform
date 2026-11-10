// NEXUS v651 (ADR 0016 amendment 576) — A MEASUREMENT MAY NOT BE GRADED BY A NUMBER REMEMBERED FROM
// ANOTHER MACHINE. Three hosted rows reddened on two shapes of the same mistake: an assertion compared a
// DURATION against a constant that is only true on the box that wrote it — `outage.elapsedMs >= 25_000`,
// which is Hikari's connectionTimeout as the Windows docker-proxy leaves an already-pooled socket hanging,
// and REFUTED on a runner where `docker stop` closes the socket and the borrow is refused in milliseconds —
// and an assertion compared two READS of an integer-second counter with a strict `>`, so it passed by luck
// whenever the recovery landed inside the same second (`uptime must have grown`). Amendment 576 replaced
// both with bounds derived inside the same run: the service's own `database.latencyMs` beside the client's
// own wall time, and a non-decreasing reading plus a bounded poll for the step up.
//
// This file keeps that repair from rotting. It reads an assertion's PREDICATE — the first argument of
// `assert.ok(...)`, nothing of the message beside it — and charges the two shapes again:
//
//   REMEMBERED-FLOOR  a `>=` or `>` whose left side names a measured field (elapsedMs, latencyMs,
//                     durationMs, uptimeSeconds, or a bare `.ms`) and whose right side is a NUMBER LITERAL
//                     other than 0. `>= 0` is excused: that is a sign claim, not a plane claim.
//   COIN-FLIP         a strict `>` or `<` between two readings of the SAME measured field, which tie
//                     whenever the two reads fall in the same tick and say nothing about the contract.
//
// What is deliberately NOT charged: a CEILING (`< literal`), because "this proof will not wait longer than
// that" is a fact about the proof's own budget and it is the honest half of every timed row; and a bound
// whose far side is another READING (`elapsedMs >= borrowMs`), because both sides came from this run.
//
// The rule grades ITSELF before it grades anyone: `planeBoundRuleIsLive()` plants each chargeable shape in
// memory, plants the excused neighbours too, and refuses the rule when it fails to charge what it names or
// charges what it excuses. A validator whose first run is also its first test is not a validator, and the
// proofs that carry the repaired rows call this on every build, so a rule that went blind mid-edit reddens
// the row rather than quietly clearing it.
//
// Run directly to see the verdict:  node docs/evidence/m9/plane-bound-claims.mjs

const MEASURED = /(?:\b(?:elapsedMs|latencyMs|durationMs|uptimeSeconds)\b|\.ms\b)/;
const OPEN = 'assert.ok(';

/**
 * The predicate of every `assert.ok(...)` in `text`, with its line number. Quote-aware, because a message
 * is a template literal full of the very spellings the rule hunts for; bracket-aware, because the honest
 * predicates in this corpus are compound (`a && a.field >= 0`). Line endings are normalised first: a CRLF
 * checkout must not read as a different program than an LF one.
 */
export function okPredicates(text) {
  const src = text.replace(/\r\n/g, '\n');
  const found = [];
  for (let at = src.indexOf(OPEN); at >= 0; at = src.indexOf(OPEN, at + OPEN.length)) {
    let depth = 1;
    let quote = null;
    let escaped = false;
    let end = src.length;
    let stopReason = 'unterminated';
    for (let i = at + OPEN.length; i < src.length; i++) {
      const c = src[i];
      if (quote !== null) {
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; continue; }
      if (c === ')' || c === ']') {
        depth--;
        if (depth === 0) { end = i; stopReason = 'close'; break; }
        continue;
      }
      if (c === ',' && depth === 1) { end = i; stopReason = 'message'; break; }
    }
    found.push({
      line: src.slice(0, at).split('\n').length,
      predicate: src.slice(at + OPEN.length, end).trim(),
      stopReason,
    });
  }
  return found;
}

const NUMERIC = /(?:>=|>)\s*(\d[\d_]*)/;

/** Every chargeable claim in `text`: what was charged, where, and why the neighbours are not charges. */
export function planeBoundClaims(text) {
  const claims = [];
  for (const { line, predicate } of okPredicates(text)) {
    const floor = predicate.match(NUMERIC);
    if (floor && floor[1] !== '0') {
      const lhs = predicate.slice(0, predicate.indexOf(floor[0])).trim();
      if (MEASURED.test(lhs)) {
        claims.push({
          line,
          shape: 'remembered-floor',
          predicate,
          why: `a measured field is floored against the literal ${floor[1]} — that number is true only on the plane that wrote it`,
        });
        continue;
      }
    }
    const flip = predicate.match(/(\w+(?:\.\w+)*(?:Ms|Seconds|\.ms))\s*([><])\s*(\w+(?:\.\w+)*(?:Ms|Seconds|\.ms))/);
    if (flip && flip[1].split('.').pop() === flip[3].split('.').pop() && MEASURED.test(flip[1])) {
      claims.push({
        line,
        shape: 'coin-flip',
        predicate,
        why: `two reads of ${flip[1].split('.').pop()} compared with a strict ${flip[2]} — they tie whenever the reads share a tick, so the row grades the clock`,
      });
    }
  }
  return claims;
}

/**
 * The rule on trial against planted bytes, both directions. Every plant states its predicted charge count,
 * so a rule that went blind charges nothing and reddens; a rule that over-charges reddens on an excused
 * neighbour. Returns the sentence the proofs print, and throws with the full table on a mismatch.
 */
export function planeBoundRuleIsLive() {
  const plants = [
    // The two shapes amendment 576 removed, planted as they were written.
    { name: 'remembered-floor', expect: 1, source: "assert.ok(outage.elapsedMs >= 25_000, 'readiness is bounded by the pool's OWN borrow');" },
    { name: 'coin-flip', expect: 1, source: "assert.ok(recovered.body.uptimeSeconds > outage.body.uptimeSeconds, 'uptime must have grown');" },
    // The repairs this repository now ships, planted so the excuse is measured rather than asserted.
    { name: 'derived-bound', expect: 0, source: 'assert.ok(outage.elapsedMs >= borrowMs, `the client timed ${outage.elapsedMs} ms`);' },
    { name: 'ceiling', expect: 0, source: "assert.ok(liveDuringOutage.elapsedMs < 2000, 'liveness must NOT wait for the pool');" },
    { name: 'sign-claim', expect: 0, source: 'assert.ok(Number.isInteger(outage.body.database.latencyMs) && outage.body.database.latencyMs >= 0, `a failure is still a measurement, got ${outage.body.database.latencyMs}`);' },
    { name: 'non-decreasing', expect: 0, source: 'assert.ok(liveAfter.body.uptimeSeconds >= liveDuringOutage.body.uptimeSeconds, `uptime never goes backwards (${liveDuringOutage.body.uptimeSeconds}s -> ${liveAfter.body.uptimeSeconds}s)`);' },
    { name: 'message-not-predicate', expect: 0, source: "assert.ok(outage.elapsedMs < 120_000, `a message that says 25_000 >= elapsedMs and uptimeSeconds > uptimeSeconds is not a claim`);" },
  ];
  const verdicts = plants.map((plant) => {
    const claims = planeBoundClaims(`${plant.source}\n`);
    return { name: plant.name, expect: plant.expect, got: claims.length, shapes: claims.map((c) => c.shape) };
  });
  const wrong = verdicts.filter((v) => v.expect !== v.got);
  if (wrong.length > 0) {
    throw new Error(`the plane-bound rule does not grade what it claims: ${wrong.map((w) => `${w.name} predicted ${w.expect} charge(s), got ${w.got} [${w.shapes.join(',') || 'none'}]`).join('; ')} — a rule that cannot charge the shape it names, or charges one it excuses, is not a guard`);
  }
  const charged = verdicts.filter((v) => v.expect > 0).length;
  return `${verdicts.length} planted assertion(s): ${charged} charged and ${verdicts.length - charged} excused, exactly as the rule claims`;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('docs/evidence/m9/plane-bound-claims.mjs')) {
  console.log(`[plane-bound-claims] ${planeBoundRuleIsLive()}`);
}
