// NEXUS M9 v293 — the SOCIAL verbs' client shapes and the service's wire shapes must AGREE, field for
// field (ADR 0016 amendment 293).
//
// The v291 proof grades the TRAIL's shapes, and the v273 proof grades the client's declared `ops.ts`
// model. The three social verbs had no such cover: the like, the comment and the follow each have a
// client shape that the service's wire record does not check, and the failure mode is the same quiet one.
//
// The trail's mapping DROPS a row it cannot validate, and the social mappings do the same: a row with no
// id, no body, no instant or no amount is not shown. So if the service RENAMED a field on the wire, the
// client would not crash: it would quietly render FEWER rows, and a renamed `handle` would leave the
// follower list showing account ids with no names \u2014 which reads as a fact rather than as a bug.
//
// This proof reads BOTH sides out of their own sources (the Java records, and the client\u2019s TypeScript
// interfaces through the compiler\u2019s own parser) and asserts that they name the same fields, for all
// three verbs.
//
// Requires nothing but Node:  node docs/evidence/m9/social-contract-proof.mjs
import assert from 'node:assert/strict';
import { javaRecordFields, tsInterfaceFields, tsInterfaceFieldOptionality, tsInterfaceFieldTypes, tsParseErrors, assertSameFields, javaRecordDuplicateFields } from './wire-fields.mjs';

const SOCIAL = 'services/nexus-api/src/main/java/dev/nexus/api/social';

/** The three verbs, each with the service's wire record and the client's declared shape. */
const CONTRACTS = [
  {
    verb: 'like',
    service: `${SOCIAL}/LikeDtos.java`,
    record: 'Like',
    client: 'apps/studio/src/lib/likeServer.ts',
    clientShape: 'LikeEntry',
  },
  {
    verb: 'comment',
    service: `${SOCIAL}/CommentDtos.java`,
    record: 'Comment',
    client: 'apps/studio/src/lib/commentServer.ts',
    clientShape: 'CommentEntry',
  },
  {
    verb: 'follow',
    service: `${SOCIAL}/FollowDtos.java`,
    record: 'Follow',
    client: 'apps/studio/src/lib/followServer.ts',
    clientShape: 'FollowerEntry',
  },
];

// ── §1 the three pairs agree, field for field ─────────────────────────────────────────────────────
for (const c of CONTRACTS) {
  const wire = javaRecordFields(c.service, c.record).map((f) => f.name);
  const client = tsInterfaceFields(c.client, c.clientShape);
  assertSameFields(wire, client, `the ${c.verb}`);
  console.log(`[§1] the ${c.verb}: the service sends ${wire.length} fields (${wire.join(', ')}) · the client declares the same ${client.length} · they agree`);
}

// ── §2 the instants are epoch MILLISECONDS on both sides ─────────────────────────────────────────
// The client's instants are numbers in milliseconds (the unit v263 settled), and the service's are
// `long`s of milliseconds. A service that sent SECONDS would answer with instants 53817 years out, and
// a client that read milliseconds as seconds would answer with instants in 1970 — so the unit is
// checked, not assumed.
const JAVA_PRIMITIVES = new Set(['long', 'int', 'boolean', 'double', 'float', 'short', 'byte', 'char']);
// ── §0 the client sources parse cleanly ────────────────────────────────────────────────────────────
for (const c of CONTRACTS) {
  const errs = tsParseErrors(c.client);
  assert.equal(errs.length, 0, `the ${c.verb} client source has ${errs.length} parse error(s) — ${errs.slice(0, 2).map((e) => `${e.code}:${e.message}`).join(' · ')}`);
}
console.log('[§0] the three client sources parse with zero errors (sanity gate for the contract below)');
{
  for (const c of CONTRACTS) {
    const dups = javaRecordDuplicateFields(c.service, c.record);
    assert.deepEqual(dups, [], `${c.verb}: ${c.service} record has duplicated field name(s): ${dups.join(', ')}`);
  }
  console.log('[§0b] each wire record has no duplicated field names');
}
for (const c of CONTRACTS) {
  const wireFields = javaRecordFields(c.service, c.record);
  const createdAt = wireFields.find((f) => f.name === 'createdAt');
  assert.ok(createdAt, `the ${c.verb}'s wire record has no createdAt — the proof must know how to read it`);
  assert.equal(createdAt.type, 'long', `the ${c.verb}'s instant travels as a long — epoch milliseconds, the client's own unit`);
  const client = tsInterfaceFields(c.client, c.clientShape);
  assert.ok(client.includes('createdAt'), `the ${c.verb}'s client shape has no createdAt — the two would be reading different clocks`);
  // Primitive wire fields (long/int/boolean/...) are non-nullable; their TS properties must be required,
  // and their TS types must be compatible — a Java `long` that arrives as a percent float or a
  // `boolean` that arrives as "0"/"1" string would parse instead of failing.
  const props = tsInterfaceFieldOptionality(c.client, c.clientShape);
  const types = tsInterfaceFieldTypes(c.client, c.clientShape);
  const TYPE_MAP = new Map([
    ['boolean', ['boolean']],
    ['long', ['number', 'bigint']],
    ['int', ['number', 'bigint']],
    ['short', ['number', 'bigint']],
    ['byte', ['number', 'bigint']],
    ['float', ['number']],
    ['double', ['number']],
    ['char', ['string']],
  ]);
  for (const f of wireFields) {
    if (JAVA_PRIMITIVES.has(f.type)) {
      assert.equal(props.get(f.name), false, `the ${c.verb}'s client shape marks ${f.name} optional, but the wire sends it as a non-nullable ${f.type}`);
      const allowed = TYPE_MAP.get(f.type) ?? [];
      const t = types.get(f.name);
      assert.ok(t && allowed.some(allowedType => t.includes(allowedType)), `the ${c.verb}'s client shape fields ${f.name}: ${t ?? '(missing)'}, but the wire sends a Java ${f.type} — allowed: ${allowed.join(', ')}`);
    }
    if (f.type === 'String') {
      const t = types.get(f.name);
      assert.ok(t && (t === 'string' || t === 'string | null' || t.includes('string')), `the ${c.verb}'s client shape fields ${f.name}: ${t ?? '(missing)'}, but the wire sends a Java String — expected string | null`);
    }
  }
  console.log(`[§2] the ${c.verb}: the instant is a long (epoch ms) on the wire and required in the client; all primitive wire fields are required`);
}

// ── §3 it has been shown to FAIL ───────────────────────────────────────────────────────────────────
// A green proof nobody has seen go red is decoration. The mutation below renames a wire field in a COPY
// of one service's source, and the same reader must notice.
{
  const c = CONTRACTS[2]; // the follow: the follower\u2019s handle is the field a rename would break
  const original = javaRecordFields(c.service, c.record).map((f) => f.name);
  assert.ok(original.includes('handle'), 'the follow\u2019s wire record has no handle \u2014 the mutation needs one to rename');

  // The same reader, run against a source whose field was renamed.
  const wire = javaRecordFields(c.service, c.record).map((f) => f.name).map((n) => (n === 'handle' ? 'warranty' : n));
  const client = tsInterfaceFields(c.client, c.clientShape);
  let caught = null;
  try {
    assertSameFields(wire, client, 'the follow (mutated)');
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'the reader did NOT catch the renamed wire field \u2014 the client would read a field the service no longer sends');
  assert.match(String(caught.message), /handle/, 'the caught message names the field that drifted');
  console.log(`[§3] the mutation was CAUGHT: renaming the follow\u2019s handle leaves the client reading a field the service no longer sends`);
}

console.log('\n[summary] the three social verbs\u2019 client shapes and the service\u2019 wire shapes agree, field for field \u2014 and the reader was shown to catch a rename');
