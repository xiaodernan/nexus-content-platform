# 0041 — An incident is a record with a life, not a status page

- **Status:** Accepted (v594, `POST /incidents`, `GET /incidents`, `GET /incidents/{id}`,
  `POST /incidents/{id}/resolve`, the 38 unit cases and the live-PostgreSQL run)
- **Date:** 2026-11-03
- **Milestone:** M9 (NEXUS Ops)
- **Builds on:** ADR 0018 (public reads, no accounts), ADR 0030 (a fact gets its own door), ADR 0039
  (traffic, the last observability slice), ADR 0032 (retention is an owner's right)

## Context

M9's row reads "observability, incident→patch→PR→approve→deploy". The observability half now has five
doors — `/audit`, `/health`, `/health/live`, `/health/ready`, `/health/vitals`, `/health/traffic` — and
between them a reader can say what this service did, whether it can serve, what its process holds, and how
much traffic it has answered. None of them can record the one thing an operator says next: **something is
wrong**.

That sentence has no home in any of those tables. The audit trail records what the service DID, and an
incident is not a verb it performed; the health doors are computed from the process, and an incident is a
judgment a person makes. Writing "the deploy lane is red" as an audit entry would put a human's claim into
a vocabulary that belongs to the publication verbs, and it would make the claim look like something the
service observed. So the first word of M9's chain needs its own table, and the slice is exactly that word:
a record can be opened, read and closed. The rest of the chain is not built, and this ADR says so rather
than implying it.

The design question is what an incident IS. A status page is a derived summary — it needs a source to
summarize. This service has no source that can decide "there is an incident"; that decision is a person's.
The atom is therefore the record a person writes: a title, a severity they claim, an optional longer
account, an optional pointer to what it is about, who opened it, when the service recorded it, and — at
the end — who resolved it and when. Everything else the milestone names would be built ON that atom, and
none of it is here.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Storage | A log line / heap state | An incident is exactly the thing an operator wants after a restart; a record that dies with the process is a dashboard, not a record |
| Storage | **A new `incident` table** | **Chosen** — survives restarts, and psql can be asked what is in it |
| Shape | A many-state status machine (investigating, mitigated, monitoring, …) | Every state needs a policy for who may enter it and what it means; this milestone has neither, and a state nobody can explain is a status page |
| Shape | **Two statuses and one transition: `open` → `resolved`** | **Chosen** — the smallest life a record can have and still answer "is it still happening?" |
| Life | Reopen a resolved record | A recurrence is a NEW incident; reopening would overwrite the instant the first one ended |
| Severity | Compute it from the target's error rate or evidence | Nothing in this build computes it; a computed severity would be a verdict this service cannot defend |
| Severity | **A claim the opener makes, from four fixed words** | **Chosen** — honest about whose judgment it is, and bounded enough to filter on |
| Severity spelling | Case-fold `High` into `high` | The journal refuses to reinterpret a word the caller typed; `High` is a different value, refused with the vocabulary named |
| Target | A foreign key to the publication/tool/project tables | An incident may be about a deployment, a customer, a third-party service, or nothing this service stores; a key would be a lie or a migration |
| Target | **Two opaque columns, both-or-neither, never dereferenced** | **Chosen** — a pointer a reader can follow, without claiming this service owns every kind of thing |
| Target halves | A kind with no id, or an id with no kind | A kind with no id names nothing to look at; an id with no kind cannot be interpreted |
| Resolve | Last writer wins | The first resolver and instant are facts that already happened; overwriting them edits history |
| Resolve | **One transition; the second is 409 `already-resolved`** | **Chosen** — idempotent in its refusal, not in its write |
| Listing order | `openedAt` alone | Two records written in the same microsecond would have an order the database chooses |
| Listing order | **`openedAt DESC, incidentId DESC`** | **Chosen** — a stable total order a reader can check against the values it was given |
| Listing | Filter in the browser | The browser never sees the excluded rows; a count computed from a filtered window is a lie about the table |
| Listing | **Narrow in the query; both the window and the total** | **Chosen** — the total is the one number that can still say a filter hid something |
| Filter | An unknown word answers an empty window | An empty answer reads as "there are none", not "that word is not a severity" |
| Filter | **400 `invalid-incident` naming the vocabulary** | **Chosen** — the same rule the audit trail's action filter applies |
| Paging | `PageRequest.of(offset, limit)` with an arbitrary row offset | Spring can only skip whole pages; handing it a row count answers from a page the caller did not name |
| Paging | **Floor the offset to the page that contains it, and report the applied value** | **Chosen** — a caller can see the adjustment in the answer instead of guessing |
| Trail | Write an audit entry for every open and resolve | The incident table IS the record; a second copy would be a second answer, and the trail's vocabulary belongs to the publication verbs |
| Notify | Fan out a webhook on open and resolve | v559 delivers AUDIT verbs; adding incident verbs would edit another owner's vocabulary |
| Auth | Ownership checks | No accounts exist (ADR 0018); an incident has no owner to check |

## Choice

Open one:

```json
// POST /incidents — 201
{
  "title": "the deploy lane is red",
  "summary": "the runner never finished; two proofs were cut off",
  "severity": "critical",
  "targetKind": "tool",
  "targetId": "tool-registry",
  "openedBy": "acct-ada"
}
```

The 201 answers the record as written:

```json
{
  "id": "0d5e…",
  "title": "the deploy lane is red",
  "summary": "the runner never finished; two proofs were cut off",
  "severity": "critical",
  "targetKind": "tool",
  "targetId": "tool-registry",
  "status": "open",
  "openedBy": "acct-ada",
  "openedAt": 1793696400000,
  "resolvedBy": null,
  "resolvedAt": null
}
```

A listing:

```json
// GET /incidents?status=open&severity=high&limit=20&offset=0 — 200
{
  "incidents": [ … ],
  "count": 0,
  "total": 0,
  "limit": 20,
  "offset": 0,
  "status": "open",
  "severity": "high"
}
```

- `POST /incidents` — title trimmed to its column (1..120), summary trimmed and bounded (≤2000, blank →
  null), severity one of `low|medium|high|critical` exactly (no case folding), `targetKind`/`targetId`
  either both or neither (each trimmed and bounded), `openedBy` trimmed, blank → null. Status is
  `open`; the id is a UUID minted here; `openedAt` is the service's clock, truncated to microseconds. A
  request that broke a rule is 400 `invalid-incident` whose message NAMES the rule.
- `GET /incidents?status=&severity=&limit=&offset=` — newest first by `(openedAt DESC, incidentId DESC)`.
  `status` and `severity` narrow in the query, so `count` (the window) and `total` (the whole narrowed
  table) are computed over the same set. A blank filter is a typo and an unknown word is a question
  about a vocabulary this service does not have: both are 400, never an empty window. `limit` is floored
  to 1 and capped at 100; `offset` is floored to 0 and then floored DOWN to the page boundary the
  `PageRequest` can express, and the answer reports the value actually applied.
- `GET /incidents/{id}` — 200 with the record; an id that names nothing is 404 `unknown-incident`.
- `POST /incidents/{id}/resolve` — body `{resolvedBy?}`; 200 with the resolved record (`status`,
  `resolvedBy` trimmed / null, `resolvedAt` the service's instant). A second resolve is 409
  `already-resolved` and does not touch the first resolver or instant. An unknown id is 404.
- No audit entry and no webhook delivery is written by any of the four doors. The incident table is the
  record, not a second copy of one.

## Reason

- **A person's claim needs a table of its own.** The audit trail records verbs the service performed; the
  health doors compute numbers from the process. Neither can hold "something is wrong" without
  misrepresenting whose judgment it is.
- **The atom must survive a restart.** An incident that disappears with the process is a dashboard; the
  live proof stops the service, starts it again against the same database, and reads the four records and
  the one resolve back unchanged.
- **One transition is enough to be useful and small enough to be honest.** A status machine would need
  transition rules, actors and meanings this milestone does not have; `open` → `resolved` answers the only
  question an operator asks of this record ("is it still happening?").
- **The second resolve is refused because it would edit history.** The first resolver is a fact. 409
  `already-resolved` says the request was legal and the record's state is what refused it, which is
  different from a malformed request.
- **A filter must narrow the query and both counts.** With the narrowing in the query, a caller never
  receives the excluded rows, so the window's length is the only thing it could count — and that number
  cannot say what the filter hid. `total` can.
- **An empty window for an unknown word is an answer to a question nobody asked.** `severity=HIGH` is not
  a request for every severity; it is a misspelling, and a 400 naming the vocabulary is the honest reply.
- **A target is stored, not resolved.** This service cannot know whether `tool-registry` exists, and
  checking would make it the owner of every kind of thing an incident can mention. The pair says what a
  reader should look at; the reader looks.

## Tradeoffs (stated, not implied)

- **The chain stops at its first word.** There is no patch, no pull request, no approval, no deployment
  door, and nothing links an incident to one. M9's row continues past this slice; this build does not.
- **No detection.** Nothing in this service notices a failing proof, a refused delivery or a red lane and
  opens an incident. An incident exists because a person said so.
- **Severity is a claim, not a verdict.** Four words, chosen by the opener, never re-graded against
  evidence. A later slice could compute one; this one cannot defend doing so.
- **The target is unverified and opaque.** `targetKind` and `targetId` are not checked for existence, and
  this service cannot dereference them. A typo is stored as typed.
- **No assignment, no comments, no notifications.** A resolver is a name, not an account that was told.
  Nothing pages anybody.
- **Anyone may open, read and resolve.** ADR 0018's public-read rule extends to writes here because no
  accounts exist; a deployment that considers incident control sensitive gates the path at its proxy.
- **No reopening.** A recurrence must be written as a new record, which means two short records rather
  than one long one. That is the shape this slice can defend.
- **The offset is floored to a page.** A caller asking for row 15 with a window of 10 is told the service
  read from row 10; `count` and `total` still agree with each other, but the window is not arbitrary.
- **Two counts, not one.** A client that only renders rows must carry `count`; a client that wants to know
  what it is not seeing must carry `total`. Both are in every listing because neither can be derived from
  the other honestly.
- **No cross-record queries.** No incident list by target, by opener or by resolution time. The four doors
  answer the questions this slice asked; an index is a later decision.
- **An incident writes nothing to the trail and knocks on nothing.** Automation that reacts to opens must
  poll this door; the webhook vocabulary stays the publication verbs'.

## Evidence

- `mvn -Dtest='IncidentServiceTest,IncidentControllerTest' test` — **38/38** (26 service, 12 controller):
  trimming and the four refusals, the target pair's two halves, the four listing shapes (no filter, one
  status, one severity, both), the cap and the floored offset, the two counts, a read of an unknown id,
  the first resolve and the refused second one; the controller pins exactly eleven record fields and
  `resolvedAt` present-and-null, the listing's seven fields, the applied cap and offset, and the three
  error tokens.
- **`docs/evidence/m9/incident-proof.mjs`** (`npm run verify:incidents`) — the live run against a
  throwaway `pgvector/pgvector:pg16` and the built `target/nexus-api-0.1.0-SNAPSHOT.jar`. Its readings,
  section by section, are quoted in the amendment 547 entry and the milestone row; every number below is
  from that run rather than from this paragraph's memory.
- `npm run verify:evidence-census` — this proof is a ROW in the population the census counts; the census
  passes only because the proof and this ADR are tracked in the commit that carries them.

## Date

2026-11-03
