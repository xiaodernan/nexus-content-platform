# M7 evidence — the backend

M7 is the first milestone that needs a service. Its evidence is different in kind from every earlier
milestone's: those proofs ran a shipped TypeScript module in Node, and this one **starts a real Spring Boot
service and a real PostgreSQL**, then talks to it over HTTP.

## `publish-proof.mjs` (M7 v193 — ADR 0016 amendment 193)

```
npm run verify:publish        # needs Java 25, Maven, and a running Docker daemon
```

It is deliberately not a unit test. `services/nexus-api/src/test` already checks the four rules
`PublishService` owns, with no Spring context and no database. What only this file can answer:

| § | what it proves |
| --- | --- |
| 1 | the service **builds and starts** against a real PostgreSQL, on a port it was told to pick |
| 2 | publishing creates **version 1** and answers **201** with a URL naming THIS server |
| 3 | the publication reads back with its document **as JSON** — deep-equal to what was sent, which is what catches double-encoding |
| 4 | re-publishing **UPDATES**: same id, version 2, and the **database counted at exactly one row** |
| 5 | refusals answer **400 naming the rule**, and an unpublished id answers **404** rather than an empty 200 |
| 6 | the publication **SURVIVES A SERVICE RESTART** — the claim a fake repository cannot make |
| 7 | teardown: the container is removed even if an assertion failed |

Everything it creates is throwaway: a `pgvector/pgvector:pg16` container on a free port, removed by name at
the end; the jar is built into the service's own gitignored `target/`.

### Four things it measured that reading the code would not have

1. **A receipt claiming precision the database had already dropped.** The instant was reported as
   `…01.824829200Z` (nanoseconds) while the row read back as `…01.824829Z` (microseconds — PostgreSQL's
   precision). The service now truncates to microseconds, and a unit case pins it.
2. **A 400 on every well-formed publish.** `PublishRequest.document` was declared a `String` while the
   contract is a JSON **object**, so Jackson refused every real request. The DTO now says `JsonNode`.
3. **`child.kill()` does not stop a JVM here within ten seconds**, so the restart section waited for a
   process that was still running — and then the exit check itself was wrong: **a process killed by a signal
   has `exitCode === null` and `signalCode` set**, so `exitCode !== null` is not "it has stopped".
4. **Environment variables are not a safe way to configure a service under test on this host.** Exporting
   `NEXUS_API_PORT` had no effect: the service bound a constant 61212 held by this machine's own tooling.
   `--debug` showed `--server.port=18099` on the command line taking effect while the same value in the
   environment did not — an injected `SERVER_PORT` outranks a `${…}` placeholder in `application.yml`.
   Command-line arguments outrank environment properties in Spring Boot, so the proof passes configuration
   that way. **A proof should not be at the mercy of the ambient environment.**

### Bounds, stated

The proof exercises ONE aggregate and TWO endpoints. It does not test concurrency, does not test a second
writer, does not test the schema surviving a destructive change (there is no migration tool), and does not
test auth — there is none. What it proves is that publishing is REAL: a row on a real database, at an address
this server answers, that outlives the process that wrote it.

## What is NOT here yet

The Studio does not call this service. v193 is the backend half of "hosted publish"; the Publish control that
reaches it — through a fetch-only lane, the shape v172 and v184 already use — is the next increment. Until
then, `services/nexus-api` is a working service with no product consumer, and that is written down rather
than implied by the endpoint list.

## `studio-publish.mjs` — the Studio's Publish control, END TO END (M7 v194 — amendment 194)

```
npm run verify:publish-e2e     # starts a throwaway PostgreSQL, the service AND the Studio
```

v193's own record ended with *"the Studio does not call this service yet"*. This is that half: the first
proof in this repository that stands up **all three layers at once** — a real PostgreSQL, the real
`services/nexus-api`, and the real Studio — and then drives the Publish button in a real browser.

**It starts the Studio itself, and the order is part of the subject.** Every other harness probe requires a
Studio on :3210; this one cannot. The service binds a port the OS picks, and the Studio's route reads
`NEXUS_API_URL` at request time — so a Studio started first would point at the wrong address.

| # | assertion |
| --- | --- |
| 1 | a throwaway PostgreSQL, the service and the Studio all come up |
| 2 | the toolbar reports the service READY (it probes on mount) and the Studio's route names the right `apiBase` |
| 3 | pressing Publish reports a publication, and the project id is parsed from **the URL the service returned** |
| 4 | the publication is read back **through the service, independently of the browser** |
| 5 | the URL the Studio shows is the SERVICE's, not one the Studio assembled |
| 6 | a second press reports **version 2**, and the **database holds exactly one row** |
| 7 | the stored document's **name and node count** both match the Studio's, and it is a JSON object |
| 8 | teardown removes the container and both processes |

**One thing it deliberately does NOT claim.** The document comparison is by name and node count, not byte for
byte: `window.__nexus.snapshot()` is a frozen read-only summary that carries neither the canonical document
nor its id — which is also why the project id comes from the service's URL. Saying which two facts were
compared is the point; "the document matches" would be a claim about bytes this proof never saw.

## What the two proofs together cover

`publish-proof.mjs` grades the SERVICE alone (four rules, a restart, teardown). `studio-publish.mjs` grades
the PATH from a Studio document to a row. Neither covers auth, concurrency, listing, or unpublishing — none
of those exist yet, and the ROADMAP's M7 row lists them as open.

## Listing and unpublish (M7 v195 — amendment 195)

The two things v193's record listed as missing, added together because a publishing feature that cannot say
what is published and cannot take anything down is a one-way door.

**Service.** `GET /projects?limit=N` answers the newest N, metadata only — 100 entries must not mean 100
documents. `DELETE /projects/{id}` answers `{ removed }`, `false` for a project that has none, 200 either way
because the URL names a project and not a resource that must exist. The cap is **clamped** (asking for 10 000
gets 100) while a non-positive limit is **refused** (there is no honest reading of "fewer than one"), and the
answer carries `count` AND `limit` so "there are twenty" cannot be mistaken for "there are at least twenty".

**Studio.** The lane gained `list` and `unpublish`; the route's `list` action is the one action that names no
project, so it is answered before the `projectId` guard rather than being handed a sentinel id to satisfy it.
The toolbar's **Published** button opens a panel whose rows are the service's answer, re-fetched after every
verb — never hand-edited, so a row that is gone cannot linger.

**A proof bug this exposed.** `publish-proof.mjs` waited for postgres with `docker exec … pg_isready`, which
runs **inside the container** and says nothing about the **host** port mapping — and the host mapping is what
the service connects through. A `-p` that lost a race for the port passes the inside check and then leaves
the service hanging on a datasource it can never reach, which reads as *"the service is broken"*. The proof
now also polls a host-side TCP connection and fails with a sentence naming the difference. It was found
because the new sections could not be added until it was fixed — the symptom was a service that would not
start, and the cause was two layers away from where it appeared.

| layer | what it proves |
| --- | --- |
| `services/nexus-api/src/test` (21) | the cap reaches the repository as a `PageRequest` · a limit above the cap is clamped · a non-positive limit is refused BEFORE the repository is asked · unpublish deletes when it exists and answers `false` without touching the repository when it does not |
| `publish-proof.mjs` §6–§7 | against the REAL database: newest-first checked against the instants · the cap reported · entries carry no document · the taken-down row counted out of the DATABASE at 0 · a second DELETE answers `removed: false` |
| `studio-publish.mjs` (15/15) | in a REAL browser: the Published button renders the service's rows · the row for this project is there · "take down" removes it from the list AND from the service |

Bounds: no paging beyond the cap, no ownership (anyone can unpublish anything), no soft delete or history,
and the Studio's list shows at most 20 rows with no way to page.

## `GET /p/{id}` — the ARTIFACT PAGE (M7 v196 — amendment 196)

```bash
curl -i http://127.0.0.1:3210/p/<projectId>      # 200 + the document · 404 nothing here · 503 service down
```

The half M1 deferred. v193–v195 built the API: a publication is a row, and it can be read, listed and taken
down — but every one of those doors needs a CLIENT that already knows the id. A person with a browser had
nothing to open.

**A route HANDLER, not a page, and that is the point.** What it answers with is not a React tree: it is the
artifact, drawn by `renderPreviewHtml` — **the same function the Studio's local Preview and its HTML export
use**. "What you published is what you get" is only true if the published page and the preview are the same
code; a second renderer would be a second answer to the same question, and the two would drift.

**Three answers, and the status codes carry the difference.**

| answer | when | why not the other |
| --- | --- | --- |
| `200` + the artifact | the service holds a publication | — |
| `404` "Nothing published here" | the service answered 404 | it may never have been published, or it may have been taken down |
| `503` "The publication service is not answering" | the service is unreachable or answered unusably | **not a 404**: "nothing is published here" and "the thing that knows what is published is not running" are different facts, and a reader given the wrong one looks for the problem in the wrong place |

**The 404 is reported STRUCTURALLY.** The route first decided 404-vs-503 by testing whether the lane's `reason`
started with `"nothing is published"` — which would have silently started answering 503 the day someone
reworded that sentence. `readPublication` now reports `notFound: true` and the route reads that. A route that
pattern-matches a sentence is a route that breaks when the sentence changes.

**A document that cannot be drawn gets its own page, not an empty stage.** A publication whose document is not
an object, or whose `activePageId` names no page it holds, answers "Artifact unavailable" — an empty stage
would look like an artifact that happens to be blank rather than a broken record.

| layer | what it proves |
| --- | --- |
| `src/lib/artifact.test.ts` (5) | the document is drawn by the renderer's own shell · a non-object document and a document naming no page both get UNAVAILABLE and NOT an empty stage · the missing and unavailable pages say different things and both escape caller-supplied text |
| `studio-publish.mjs` (§8, 21/21) | in a REAL browser: the probe draws a rectangle first, publishes, fetches `/p/{id}` (200 + the stage), OPENS it in a browser and checks the stage renders with content, and checks an unpublished id answers 404 with its own page rather than the service-down page |

Bounds: the artifact is the document and nothing else — no author, no publish date, no version, no
navigation, no styling controls. A reader gets the drawing, not a page ABOUT the drawing. No auth: anyone who
knows an id can open it. The page uses the preview renderer's fixed styling rather than making the document's
own `tokens` themeable by the reader.

## The leak sweep: a throwaway database a previous run left running (M7 v222 — amendment 222)

`studio-publish.mjs` starts its throwaway PostgreSQL with `docker run -d --rm` and removes it in a `finally`. That
covers every exit the proof can see — a failed assertion included — but it cannot cover a HARD KILL, and `--rm`
only removes a container that STOPS. A run killed during teardown therefore leaves a container RUNNING forever,
holding a port and a PostgreSQL instance. Measured 2026-10-10: `nexus-publish-e2e-db-1791461501643-9348` had been
**Up 2 days**, from a run killed during teardown.

```
npm run verify:leak-sweep     # lists nexus-publish-e2e-db-* and retires any it owns
```

The fix is `tools/harness/leakSweep.mjs` — a name-based sweep the proof calls at its START, before it takes a
port. The container name carries the creating pid, so the rule is by OWNER: a container whose owner is GONE is
retired (`owner-gone`); one whose owner is still ALIVE belongs to a concurrent run and is left alone; age is a
second gate (`MAX_AGE_MS = 6h`) for a recycled pid (`stale`). A name the pattern does not understand is left
alone rather than guessed at.

| § | what it proves |
| --- | --- |
| 1 | the decision table over 9 synthetic listings — owner-gone / stale are the only two reasons, a live owner is never swept, the age bound is exclusive, foreign and unmatched names are left alone |
| 2 | purity — the listing is untouched and two identical calls agree |
| 3 | the wiring — the proof imports and calls the sweep BEFORE it takes a port and starts the database |
| 4 | a failed listing is reported and NOT fatal: no removal attempted, the caller decides |
| 5 | end-to-end against a REAL staged orphan — the proof creates the exact shape of the 2-day corpse and the sweep retires it as `owner-gone`, and docker no longer lists it |
| 6 | the decision module holds no capability — no `child_process`, no `process.exit` |

Bounds: the sweep only sees containers it named via the prefix filter, removes by NAME, and never sweeps a
container with a live owner. On this box the run also found and retired a leftover
`nexus-publish-e2e-db-1791649277835-999999999` (owner-gone, 1s old) — the leak, observed and cleared.

## A publication can be REMIXED (M7 v233 — amendment 233)

v196's record ends with the bound this increment closes: *"the Studio never reads a publication back in its
own UI."* `readPublished` had existed since v194 with ZERO consumers. Remix is the community's first
cross-user primitive — it reads someone else's published document back into the Studio as a NEW project.

**A remix is a FORK, not a load.** `doc.id` IS the publish service's projectId, so a remix that kept the
source's id would re-publish OVER the source's record. `forkDocument(doc, name?)` (new, in the canonical
model) gives the document a fresh DOCUMENT id — `id`, `rootId` and the root's `nodes` key move together —
while the node graph is preserved (node ids are document-scoped, so reusing them collides with nothing).
`apps/studio/src/lib/remixLane.ts` adds a PURE `extractRemixDocument(answer)` that returns the document or
NAMES the field that makes it unusable; a service that is DOWN and a publication with NO document are
reported as different facts. The Published panel gains a `remix` control per row, and the store's new
`remixDocument(doc, source)` forks before it loads.

`remix-proof.mjs` grades five sections, ALL PASSED: §1 the validator (well-formed passes; service-down ≠
no-document; 4 malformed fields each refused by name); §2 the lane over a STUBBED transport (a
`{action:"read"}` request, the document passed through, a down service and a throwing transport both answer
`ok:false`); §3 the fork (fresh document id, same graph, source unmutated); §4 the wiring (a remix control
per row; the store forks before load); §5 the §60 dependency audit (the lane holds no service address and no
server import; the model import is type-only). Measured: design-model 34 → 40, Studio 484 → 492 (32 files),
both `tsc` 0. Bounds: a remix is a plain copy under a new id — no lineage is recorded back to the source, no
attribution, and remixing needs no account (M7 still has no auth, accounts or ownership).
