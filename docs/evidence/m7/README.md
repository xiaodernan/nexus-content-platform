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

## A VISITOR can remix — the artifact page carries the link (M7 v234 — amendment 234)

v233 put remix in the Studio's own Published panel, a control only the PUBLISHER sees. That is not a
community primitive until the other half exists: someone who has only the ARTIFACT URL must be able to take
the work. The artifact page (`/p/{id}`) now injects a **remix bar** — an `<a href="/?remix=<id>">` before
`</body>`, the id encoded and the href escaped — while the drawing itself is untouched. `injectRemixBar` is
pure and total (a preview with no `</body>` is returned unchanged; no project id → no bar). The Studio reads
the intent with the pure `remixIdFromSearch` (a bare `?remix=` is `null`) in a mount effect declared AFTER
the persistence-hydrate effect, so an explicit remix wins over a stale local snapshot; it fetches through the
v233 lane, forks via `remixDocument`, then drops the query (`history.replaceState`) so a reload cannot
silently discard the visitor's edits.

`remix-proof.mjs` §5 grades this against the SHIPPED artifact module (type-stripped with its `./preview` and
`./paint` dependencies): the real `renderArtifactHtml` output carries an encoded remix link and the stage,
no project id means no bar, and a body-less string is returned unchanged. Studio 492 → 499 (32 files),
`tsc` 0, proof 6/6. Bounds: the bar is a fixed overlay with no author/date/attribution, and a remix leaves no
lineage back to its source — M7 still has no accounts, so the loop is open to anyone who can reach the
service.

## The account model lands — an unsigned local CLAIM, not a login (M7 v235 — amendment 235)

_Titled here by a later cycle: the v235 commit wrote its ledger entry (amendment 235) and its decision record
(`docs/decisions/0018-accounts-ownership-and-publication-identity.md`) but left the newest grant with no
corpus title, so the doc gate refused the whole run (`unrecordedNewest:235`). The record below is written from
that amendment's own text, not invented._

The bound every M7 grant since v194 carried — "no accounts; every publication is anonymous and anybody's to
take down; a remix records no lineage" — gets its canonical decision. **ADR 0018** weighs four options and
chooses **C: a local, unsigned identity that produces a CLAIM**, over OAuth (needs an IdP and a token store; a
half-wired one that never validates produces a badge), passwords (a security surface this repo is not ready to
own, with ADR 0013 still Proposed), and doing nothing (which is the bound). The honesty is structural:
`apps/studio/src/lib/accounts.ts` contains **no password, no token, no session, no signature and no
cryptography**, and its suite asserts that by reading its own source.

The pure core: `normalizeHandle` returns a VERDICT (a handle is data a person typed, so the caller shows what
is wrong rather than catching an exception) — TRIM → LOWERCASE, 3–24 chars, `[a-z0-9_-]`, alphanumeric ends,
the pattern deliberately not length-aware so a 2-char handle is a LENGTH failure not a character one;
`createAccountId(handle, deviceSeed)` is deterministic FNV-1a per device and **refuses a whitespace-only
seed** (a first-draft defect the suite caught — `!deviceSeed` accepted `'   '`); `AccountRegistry` refuses a
second registration of any handle that normalizes to one it holds, lists in handle order, and hands out
COPIES. Every `AccountRecord` carries `assurance: 'unsigned-local'`, and `ownerClaim(account, at)` names
itself `kind: 'owner-claim'`, so a service can tell a claim from a verified identity without pattern-matching
prose; `isOwnerClaim` refuses every near-miss. The module reserves no names (a client-only reserved list is a
refusal nobody agreed to — recorded as a bound).

Measured: Studio 499 → 509 (32 → 33 files), `tsc` 0, `accounts.test.ts` 10/10. Bounds: a claim is forgeable
by anyone who can call the API (that is why `assurance` exists); the device seed is per-browser, so one human
on two devices gets two ids until the service merges them; **no publication carries a claim yet** —
`publishDocument`, `readPublication` and `DELETE /projects/{id}` are unchanged, and the service-side work (an
owner field, an owner-checked unpublish, a remix that records lineage) is the next increment.

## EXPLORE — the gallery of published work (M7 v241 — amendment 241)

The artifact page (`/p/{id}`) answers "what is THIS one" but needs the id. The service could LIST
publications since v195, and until v241 nothing but the Studio's own Published panel consumed it — a visitor
had no door showing what EXISTS. `/explore` is that door: a gallery where each publication is a card with a
**thumbnail drawn from the canonical model** (`docToSvg` → `svgToDataUri`, the SHIPPED renderer), its receipt
facts, and the two doors the community loop needs — `open` (`/p/{id}`) and `remix` (`/?remix={id}`).

`apps/studio/src/lib/explore.ts` is a PURE string renderer (`renderExploreHtml` / `renderExploreUnavailable`);
`app/explore/route.ts` is the Node-runtime handler that lists, reads each row for its document (the listing
carries none), draws, and renders. The id is encoded in both links, caller text is escaped, and `count` AND
`limit` are both shown so "24" is never read as "there are only 24". An empty listing is its own state, and a
DOWN service is a different page (503) from an empty gallery (200). The HTML escaper moved to a shared
`pageShell.ts` used by BOTH this page and `artifact.ts` — one rule, not two.

`explore-proof.mjs` grades four sections, ALL PASSED: §1 the gallery (one card per item; open + remix doors;
id encoded; text escaped; cap stated; empty and down are distinct pages), §2 the thumbnail is REAL (`docToSvg`
→ 251 B SVG → `svgToDataUri` → the data URI in the card), §3 the wiring (Node runtime; list → read each row →
draw → render; the Studio links `/explore`), §4 the §60 audit (the renderer is pure; the escaper is shared
with `artifact.ts`). Studio 509 → 516 (33 → 34 files), `tsc` 0. Bounds: one thumbnail per row from a SECOND
read (the listing has no documents), so the page costs `1 + N` calls and caps at 24; no paging, no search, no
sort but the service's newest-first, and no byline (M7 still has no accounts on a publication).

## The ACCOUNT FACE — the panel that finally sets the current-device account (M7 v259 — ADR 0016 amendment 259)

Amendment 252 gave this device a persisted `AccountRecord` and the publish lane learned to send it as an owner CLAIM — but nothing in the product could SET one (`setCurrentAccount` had no caller), so the claim could only ever be built for an account no user could create.

`apps/studio/src/lib/accountSession.ts` composes `accounts.ts`'s pure rules with `currentAccount.ts`'s storage boundary into four verbs — `register`, `rename`, `signOut`, `current` — with the clock, randomness and store injected. `register` REFUSES when an account is already set (`sign out first`) rather than silently replacing it; `rename` pins id/handle/`createdAt`/`assurance`; the device SEED is kept across `signOut`, so re-registering the same handle yields the SAME id. `AccountPanel.tsx` holds no storage logic — every verb is a session call and every refusal is shown verbatim — and renders `assurance: 'unsigned-local'` from the record, because ADR 0018 says a "signed in" badge would be a lie. `Toolbar.tsx` gains the account control (👤).

Measured: `accountSession.test.ts` **13/13**; `apps/studio` **817/817** (43 files); `tsc` exit 0. The suite had been committed **before** the module it imports, so HEAD did not typecheck and could not collect it — the grant is only real once `accountSession.ts` is in the tree, and it is. Bound: no DOM harness, so the wiring `Toolbar → AccountPanel → accountSession` is type-checked only; the exercised boundary is the storage one behind the session.


## v263 — the ACCOUNT you set is the CLAIM you publish (M7 v263 — ADR 0016 amendment 263)

**The gap, measured on the shipped bytes.** Amendment 252 gave this device a persisted account and 253 taught the publish lane to carry an owner claim — but nothing in the product ever supplied one. `Toolbar.tsx` called `publishProject(doc.id, doc.name, doc)` with no owner and `unpublish(projectId)` with no claimer. The plumbing existed end to end and was fed nothing. Three consequences: every publication the Studio made was **OWNERLESS**, so the byline that v245/v246 put on `/explore` and `/p/{id}` could never appear for a Studio's own work; anyone could take anyone's publication down; and the account face v259 landed — a panel that set a local identity and changed nothing about what you publish as.

**The fix — the rule lives in ONE place.** `publishLane.ts` gains a `ClaimSource` seam (injected, per ADR 0002) and `claimOf(source?)`, which reads the same `currentAccount` record the account panel writes. `publishProject` attaches `owner ?? claimOf(source)` and `unpublish` attaches `claimer ?? claimOf(source)?.accountId`; an explicitly named claim still wins. The Toolbar's two calls are **unchanged** — the rule is no longer something a caller has to remember.

**The consequence, measured over the REAL service.** A new §10 in `publish-proof.mjs` drives the whole chain against a throwaway PostgreSQL and the built jar: a publish carrying a claim is **OWNED** (receipt and listing both name the account, the handle and the assurance); a take-down by another account is **403 `not-the-owner`**; a take-down naming nobody is 403 too; the **owner's** take-down is 200; a re-publish under a different account is **403 `owner-taken`** while the same account's re-publish is 200 at version 2; and a publish naming nobody stays ownerless and open to anybody — the pre-v242 rule, re-measured rather than assumed.

**The defect the wiring exposed.** The claim's **INSTANT** had never been exercised, because nothing had ever sent a claim. The client states `claimedAt` as epoch **MILLISECONDS**; the service's `OwnerClaim` declared it an `Instant` while its own docstring said it mirrored the client's shape — and Jackson reads a bare JSON number as epoch **SECONDS**. The Studio's `1700000000000` (2023-11-14) was therefore deserialized as **`+55840-11-08T22:13:20Z`** and stored that way: a fact the system of record held about when a claim was made, wrong by **53,817 years**, silently, because the unit was a comment nobody had checked against the wire. The service now reads the client's unit and writes it back in the same unit, so **the claim that comes back is the claim that went in** — measured before: `+55840-11-08T22:13:20Z`; measured after: `1700000000000`.

A range guard for the instant was drafted and then **removed**: every `long` of milliseconds is inside `Instant`'s range, so the guard could never fire — a rule that cannot fire is a comment, not a check. The service does not compare the claimed instant against its own clock, because it records claims and verifies nothing.

**The panel.** The Published row names its owner and says **"yours"** when that owner is this device's account; a row that names nobody says "by nobody". The lane's listing entry now carries the owner, which the service has always sent and the lane used to drop.

Measured: `apps/studio` **801/801** (43 files); `publishClaim.test.ts` **7/7**; `services/nexus-api` **43/43** (41 + 2), BUILD SUCCESS; the publish proof **exit 0**. Bound: the service still verifies nothing, a claim is forgeable by anyone who can call the API, a device with no account publishes anonymously, and the account is per-browser — so one human on two devices is two accounts and two owners.

## v264 — the ACCOUNT FACE is driven in a REAL browser (M7 v264 — ADR 0016 amendment 264)

**The bound this closes, quoted.** Amendment 259's own record ended: *"The panel is type-checked only — this repository has no DOM test, so the wiring `Toolbar → AccountPanel → accountSession` is not exercised by a browser harness."* The 13 unit cases grade the session and the store; nothing graded the three of them **together**.

**The harness.** `tools/harness/studio-account.mjs` drives the REAL bundle in a REAL Chrome over the CDP pipe (ADR 0017) against the REAL dev server, and adds `npm run verify:account` — the fourth surface harness, beside `verify:scene`, `verify:assets` and `verify:world`. It owns two localStorage keys and clears them itself, so a run starts from a known state and says so rather than assuming a fresh profile.

**What it grades.** §1 the account control is on the toolbar and the panel opens (the wiring itself). §2 registering writes a **real record** into this origin's storage — id, handle, display name, instant, assurance — and the panel shows the handle and the assurance. §3 the page carries **NO "signed in" badge** (ADR 0018: one would be a lie in this build). §4 while an account is set the panel offers **NO create control**: one account per device is **structural** here, not a message, so the session's `sign out first` refusal is unreachable *through the panel* (the unit suite still grades it). §5 a rename changes the **display name only** — the id, the handle and the instant are pinned. §6 signing out forgets the **name** and keeps the **device seed**. §7 re-registering the same handle on the same device yields the **SAME id**. §8 no console errors.

Measured: **14/14 assertions passed**, 0 console errors, against the real dev server on port 3210.

**The three failures the harness found in ITSELF.** `countOf` passed an arrow function to `evaluate` instead of calling it, so the door's own count came back as `{}`; the device seed was read through a JSON parser that could not parse a plain string; and the re-register step tried to create an account with an empty handle, which the session **correctly refused** — the harness was wrong, not the product. A harness that grades nothing is worse than no harness, because it reads as coverage.

**Bounds.** The harness proves the CLIENT half only: that the panel writes the record, shows the handle and the assurance, keeps the device seed, and offers no second account. It does **not** prove the claim reaches the service — that is the publish proof's §10 (amendment 263), over the real service and a real database. It needs a Chrome and a running `next dev`, and it asserts on the DOM's own words, so a panel that reworded itself fails the harness rather than passing it silently. There is still **no verification**: the record says `unsigned-local` and the service records claims without checking them.

## v265 — the BYLINE reaches the page (M7 v265 — ADR 0016 amendment 265)

**The gap, found by looking for what was NOT tested.** The explore renderer had byline cases, so the byline was **renderable**. What had no test at all was the step that FEEDS it: the route turned the service's listing row into a card, and that mapping lived in `app/explore/route.ts`, where nothing could assert it. A renderer that can draw a byline and a page that never receives one look identical from the outside. This is not hypothetical — v263 found the **publish lane** already dropping the listing's owner on its way to a page, and the same shape of drop was one line away here.

**The fix — the mapping is the pure half's job, and there is exactly ONE.** `explore.ts` gains `toExploreItem(row, read, thumbnail)`: the whole service-answer → card mapping, with the owner's reduction stated where it happens (the service sends the WHOLE claim — account id, handle, assurance, instant — and the card shows two of those fields), the lineage read moved out of the route and into the same function, and the "why there is no thumbnail" note kept. The route is now a thin caller.

**Two guards that NARROW.** A **malformed** owner is shown as **NO owner**, never as `by undefined` — a card that says "by undefined" is worse than a card that says nothing, and both are true. A document with no `_lineage` yields no source, because the lineage reader (v262) already answers `null` for every shape that is not a lineage.

**The route can no longer grow a second mapping.** The explore proof's §3 asserts that the route calls `toExploreItem(row, read, thumbnail)` **and** that it does not map the owner itself — a second mapping is a second chance to drop it.

**A new §5 grades the whole path**: the service's own answer shape in, the page's HTML out. An owned row shows `by ada · unsigned-local`; an unowned row shows no byline; a malformed owner shows none rather than a broken one; a remix still names its source. The proof's module loader had to learn the new sibling import (`./lineage` is now stripped into the box beside it) — a missing sibling would have been an unresolved import rather than a graded failure.

Measured: `apps/studio` **851/851** (44 files); `explore.test.ts` + `lineage.test.ts` **31/31**; `tsc` **exit 0**; the explore proof **exit 0**.

**Bounds.** This proves the CLIENT half of the byline: the service's answer becomes a card, and the card becomes a page that says who published it. It does not prove the service records an owner for a publication made in a browser — that is the publish proof's §10 (amendment 263). The artifact page's byline path was already in a testable module and is not changed here. The byline is a **claim**, not a verified identity: it says `unsigned-local` next to the name, and the service verifies nothing.

## v266 — the OWNERSHIP chain in a REAL browser (M7 v266 — ADR 0016 amendment 266)

**What this closes, and why it was still open.** The ownership story had been proven in three places and none of them was the product: the service recorded a claim (§10 of the publish proof, over a real database), the lane attached the device's claim (unit cases over the wire), and the page rendered a byline (the pure mapping, v265). **Nobody had driven the three together through a real browser.** Each half being proven is not the whole being proven — the whole is the seam between them, and the seam is where the owner was already dropped once (v263's lane).

**The chain, in the order a person walks it.** §3.5 the account panel opens on the toolbar, a handle is typed, and the record lands in the origin's storage with `assurance: 'unsigned-local'` — and the page carries **no "signed in" badge** (ADR 0018). The account is set **before** the publish, because a publication made with no account is ownerless, and an ownerless publication can show no byline, refuse no take-down and be taken over by anybody. §4.5 the SERVICE, read independently of the browser, carries the **owner** — account id, handle, assurance — and the claim's **instant** is the client's own millisecond value, not the same number read as seconds. §7.5 the public gallery (`/explore`, the Studio's own route) answers 200 and the card for THIS project carries `by <handle> · unsigned-local`. §9 the published list names the owner and says **"yours"**; the device **signs out** and presses "take down", and the service **REFUSES** — the rule in its own words, "a caller that is not that account may not take it down" — and the publication is **still there**; then the device **signs back in** and the owner takes their own publication down.

**What the first runs found in ITSELF.** Three of the harness's own assumptions were wrong, and all three are the kind that never get caught by a harness that never ran: the account record was read into a **block-scoped** `const`, so the later section that needed it threw `ReferenceError: record is not defined`; the refusal assertion looked for the service's error **code** (`not-the-owner`) while the Studio's route deliberately keeps only the service's **message** — so the rule reaches the user as prose, which is the more useful of the two; and the instant assertion compared the account's `createdAt` with the claim's `claimedAt` and called them one fact, when they are two different instants. The corrected assertion asks for the **unit** — a number, a real instant, within an hour of the browser's clock — which still catches the seconds-misread defect v263 measured.

**Bounds.** The service still **verifies nothing** and the byline says `unsigned-local` beside the name. The refusal is a refusal of a **take-down**, not an authentication: a caller that forged a claim naming the owner's account id could still take the publication down. "The owner" is "the account id this browser holds" and nothing more. There is no account roster and no switch, so the harness signs out and back in rather than switching.

## v267 — a REMIX records its LINEAGE (M7 v267 — ADR 0016 amendment 267)

**The gap, found by asking what a remix actually IS in this product.** The lineage had a **reading** half (v245/v246 read `_lineage.sourceProjectId` back; v262 gave it ONE guarded reader) and a **writing** half on the SERVICE (its `remix` endpoint writes `_lineage { sourceProjectId, remixedAt }` into the document JSON). But **the Studio never called the service's remix endpoint** — the route speaks `publish | read | unpublish | list`, and `publishServer.ts` has no remix function at all. The Studio's remix is a **FORK IN THE EDITOR**. So a publication made the way a person actually remixes carried **no source at all**, and the "remixed from" link v251 made clickable could never appear on it.

**The fix — ONE module owns both halves, and the key is part of the format.** `lineage.ts` gains `stampLineage(document, sourceProjectId, remixedAt)`: PURE, **OVERWRITING** any lineage the document carried, and **REFUSING** a blank source or a blank instant by throwing (a lineage that names nothing is a claim about a provenance that does not exist). The store's `remixDocument(doc, source, remixedAt)` stamps the fork, and **the caller names the instant** — the store owns no clock. The reserved key is now declared in the **canonical model** (`DesignDocument._lineage`), so it stopped being a convention three parties kept separately.

**Why the stamp OVERWRITES** — the subtle half. `forkDocument` SPREADS the document, so a copy inherits the lineage of the copy it was made from, and that inherited value names the **wrong** source. A remix of a remix must name its own; the copy it was made from keeps its own.

**Two proofs that were RED at HEAD**, found by running the remix lane's own gate. `npm run verify:remix` did not run, for two separate reasons: the module loader stripped `artifact.ts` but never `pageShell.ts`, which `artifact.ts` imports (an **unresolved import**, not a graded failure); and §6 asserted the lane's *whole* model import was `import type`, which was never true, because the lane calls `validateDocument` as a **value**. The assertion now says what is true. Separately, v263 gave `publishLane.ts` value imports of `accounts.ts` and `currentAccount.ts`, which broke the loaders of the remix proof AND the validate proof the same way — and the lesson is an **ORDER**: `strip` writes a module and **imports it in the same step**, so a module's own siblings must already be in the box. A proof that cannot resolve an import is not a passing proof; it is a proof that stopped running, and both of them had stopped running long before this grant.

Measured: `apps/studio` **857/857** (44 files); `@nexus/design-model` **51/51**; `tsc` **exit 0** in both — after the model's `dist` was rebuilt, because the studio's type check reads the package's built types while its suite reads the sources. `remix-proof` **ALL SECTIONS PASSED** (with a new §3b); `validate-proof` **ALL SECTIONS PASSED**.

**Bounds.** The service's own `remix` endpoint is still unreachable from the Studio, and that is deliberate: the Studio's remix is an editor fork, and the service's endpoint creates an **ownerless** row, which would contradict the ownership v263 established. The `_lineage` key is a **reservation on top of the canonical graph**, not a node — `validateDocument` still judges the graph alone. `remixedAt` is in the service's own ISO format and **nothing reads it** yet. The lineage names a **project id, not a person**: it does not check that the source still exists, that it was ever published, or that the remixer had any right to it.

## v268 — a REMIX's LINEAGE, end to end (M7 v268 — ADR 0016 amendment 268)

**What this closes.** v267 gave the remix a lineage: the fork is stamped with the reserved `_lineage`, the writing half joined the reading half in one module, and the key became part of the canonical model. What was still missing was the **whole path** — a person remixing a publication *in the real Studio*, the fork published, the service storing the lineage, and the public gallery naming the source. Half a story being proven is not the story being proven: the seam is where the owner was already dropped once (v263) and where the lineage was never written at all (v267).

**The chain, driven in the real product.** The published row offers a **remix control** — the community loop's second door. Clicking it forks the publication into a NEW project. Publishing the fork creates a **NEW publication under a NEW id**, read from the URL the service itself returned (`window.__nexus` deliberately exposes no document id, so the note is the authority and an id invented from the editor would be an id the harness made up). The **SERVICE**, read independently of the browser, holds the fork's document with `_lineage.sourceProjectId` naming the publication it was remixed from — and the fork is **OWNED by the same device**, so a remix is both sourced and signed. And the public gallery names the source **and links to it**, with the remix carrying its **own card** — the last clause matters, because a gallery showing somebody else's byline next to the assertion would pass the weaker check.

**Bounds.** This proves that a remix made the way a person makes one is sourced, owned and linkable. It does not prove that the source still exists, that the remixer had any right to it, or that the service verified anything — the service **records claims and verifies nothing** (ADR 0018), and the lineage is a **project id, not a person**. The service's own `remix` endpoint is still unreachable from the Studio, deliberately: it creates an **ownerless** row, which would contradict the ownership v263 established. The gallery still caps at 24 rows with no paging and no search.
