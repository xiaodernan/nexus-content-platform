# 0028 — A contract you can pin: a computed fingerprint, and the read it makes conditional

- **Status:** Accepted (v578, `contractSha256` on every whole declaration, and `If-None-Match` on the two read doors)
- **Date:** 2026-11-02
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (the catalog), ADR 0023 (details), ADR 0024 (history), 0027 (search)

## Context

The history (ADR 0024) answers "what did this declaration say before". It does not answer the cheaper and more
common question: **is the thing I built against still the thing being served?** To answer that today a consumer
must fetch the declaration and compare the summary and the whole schema — up to 8192 bytes — every time it
checks. An agent that polls a registry on a timer pays that cost per poll and per tool, and a human reading a
log cannot tell whether two declarations are the same contract without diffing JSON.

A short, stable name for one contract fixes both: the consumer stores 64 characters instead of 8 KiB.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Where | **A column, written on every accept, beside the summary** | A second statement of the same fact. It has to be backfilled for every row written before this build, it can drift from the bytes it describes if any write path forgets it, and a repair job would then have to decide which of the two is true |
| Where | **Computed from the stored bytes on every read** | **Chosen** — no DDL, no backfill, nothing to keep in step; the rows stay the only truth, and the cost is one parse plus one hash per read, bounded by the schema's existing 8192-byte ceiling |
| Subject | The schema only | An update can reword the summary without touching the schema. A pin over the schema alone would answer "unchanged" to a declaration whose description — the part a model actually reads — was replaced |
| Subject | **The summary AND the schema** | **Chosen** — exactly the pair a revision records, which is exactly the pair an update can change. Id, owner and name are immutable and the creation instant is history, so nothing else belongs in a contract |
| Encoding | Concatenate the two values with a separator | Every separator that can occur inside a summary makes two different contracts able to hash alike; a pin whose collisions depend on the caller's prose is not a pin |
| Encoding | **The canonical JSON object `{"summary":…,"inputSchema":…}`, keys in that fixed order** | **Chosen** — the encoding delimits the fields, so no separator question exists, and the bytes are produced by the same writer that stored the schema |
| Algorithm | SHA-256, 64 lowercase hex characters, bare | **Chosen** — no prefix to parse; the field name states the algorithm, and the length is asserted |
| Door | The field only | A consumer would still have to fetch and compare — 64 bytes is cheaper than 8 KiB, but the schema travels anyway |
| Door | **The field, plus a strong `ETag` and `If-None-Match` on both reads by id and by name** | **Chosen** — this is what makes a pin load-bearing: a caller that holds it is told "nothing changed" in a 304 with no body, and pays for the schema only when it actually changed |
| Precedence | Compare the tag, then look the row up | A 304 would then tell a caller its copy is current when there is no copy. **Existence is settled first**: an unknown id is a 404 whether or not a tag was sent |
| Tag syntax | A full RFC 9110 parser | Out of proportion for one header. `*` matches any existing representation; `W/` prefixes and surrounding quotes are stripped; everything else is an exact string comparison. The bound is stated rather than implied |
| Lists | An `ETag` on the catalog too | The catalog's representation changes when ANY row changes, so its tag would invalidate on other people's edits. The pin travels in every row of the list as a field, and no list is conditional |

## Choice

`GET /tools/{id}` and `GET /tools/by-name/{name}` answer `contractSha256` — 64 lowercase hex characters, the
SHA-256 of the canonical object `{"summary":…,"inputSchema":…}` built from the row — as a field, and the same
value as a strong `ETag` (`"<hex>"`). `If-None-Match` naming that value answers `304` with the `ETag` and no
body; `*` matches any declaration that exists; a tag naming a different contract answers `200` with the
declaration. `GET /tools/{id}/revisions` carries each revision's own pin, recomputed from that revision's own
stored bytes. The catalog rows carry the field too, so two names holding one contract are visible in one page.

## Reason

- **A pin is the smallest true statement about a contract.** 64 characters that change exactly when the
  contract changes, and that a caller can compare without knowing what a schema looks like.
- **Derived, not stored.** Every stored digest is a promise that two writes stay in step; computing it from the
  bytes makes that promise unnecessary. The revision history keeps being the single source of truth, and rows
  written by earlier builds are pinned correctly the moment this build reads them.
- **The summary is part of the contract.** The schema is what a machine enforces; the summary is what a model
  is told about the tool. An agent that pinned only the schema would keep a description it no longer trusts.
- **A 304 is the whole point.** Without a conditional read, the pin only saves bytes in a log. With one, a
  polling consumer stops paying for unchanged contracts — which is what "pinnable" has to mean in practice.

## Tradeoffs (stated, not implied)

- **An exact tag comparison, not a tag parser.** `*`, `W/` and quotes are handled; other RFC 9110 subtleties
  (weak-versus-strong preference lists, malformed-tag recovery) are not. A client that sends garbage gets a
  normal `200`, which is always a correct answer.
- **A computed pin follows the canonicalizer.** If the canonical form of a schema ever changed, every pin would
  change at once. That is why the service tests carry two hard-coded vectors: such a change cannot be silent,
  it fails a test that has to be rewritten deliberately.
- **It is not a signature.** There is no secret and no key; anyone who can write the row can produce a matching
  pin. It detects drift between a consumer's copy and the registry, not forgery.
- **No lookup by pin.** Nothing indexes the digest, so "which tool had this contract" is answered by reading the
  catalog and comparing, not by a door of its own.
- **Not in the schema's stead.** A consumer still must read `inputSchema` once to build its call; the pin tells
  it when to read it again.
- **Lists are not conditional.** Only a single declaration is; the catalog changes with other owners' writes.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **82/82** (52 service, 30 controller). v578
  contributes 7 service cases and 7 controller cases: two hard-coded vectors fixing the canonical object, the
  stable length and alphabet, two spellings of one schema pinning alike, a reworded summary changing the pin,
  a respecified schema changing the pin, a revision pinning what it said rather than what is served now, the
  recomputation being read-only; then the pin as field and `ETag`, a 304 with no body and no schema parse,
  a stale tag answering 200, `*`, the tag spellings matched (`W/`, quotes, a list), an unknown id still 404
  with a tag, and the read by name honouring the same tag.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5 over HTTP: the served pin is 64
  lowercase hex characters and is RECOMPUTED by the proof from the `{summary, inputSchema}` the answer itself
  carried; the `ETag` is that value quoted; holding it is a 304 with an empty body and the tag echoed, on both
  read doors; `*` is a 304; an unknown id with `*` is still a 404; the owner's update changes the pin, leaves
  the old one on revision 1, and a held pin then answers 200. §6: a second JVM recomputes both revision pins to
  the same 64 characters, and `information_schema` still shows six declaration columns — no column for the pin.
- **Still not graded, stated:** no lookup by pin, no weak-tag semantics, no signature.

## Date

2026-11-02