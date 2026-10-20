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

## v269 — the VISITOR's remix, in a REAL browser (M7 v269 — ADR 0016 amendment 269)

**The gap.** v234 gave the artifact page a remix bar so that someone who has only the URL can take the work, and the Studio reads that intent on mount. It had **never been driven in a real browser**: the remix proof grades the lane by running it and grades the WIRING by reading the shipped source — and a source can be perfectly correct while the mount effect does nothing. The panel path was proven end to end by v268; the **visitor's** path — the one that needs no account, no button and no published panel — had no run at all.

**The two things it had to get right.** The Studio reads `?remix=<id>` on mount, fetches the publication, forks it, and **drops the query** with `history.replaceState`. Both halves are load-bearing: a URL that kept its query would remix again on every reload (a remix nobody asked for twice), and a fork that did not happen would leave the visitor holding an empty Studio while the URL claimed otherwise. The harness therefore checks the query is **gone** and that the editor says so **in the Studio's own words** — `Remixed <id> — this is now your project` — before it publishes anything.

**One small product change fell out of it: the status became ADDRESSABLE.** The Studio's status line had no `data-` attribute, so a harness could only find it by guessing at the toolbar's text. The publish note has had `data-toolbar-publish-note` since v194; the status now has `data-toolbar-status` beside it — a piece of UI that a test must read should say where it is. Nothing about the Studio's behaviour changed.

**What the proof grades.** A second browser page opens `/?remix=<id>` and the intent is honoured with **no button pressed**; the query is **dropped** once honoured; the visitor **publishes their own NEW publication under a new id** (a remix must never overwrite its source, and the id comes from the URL the service returned); and the **SERVICE stored the lineage** for the visitor's remix too, so the community loop's front door produces a sourced publication and not just a fork in an editor.

**Bounds.** The visitor's remix is still only a **local fork**: the person edits it in their own Studio and publishing it is a separate, deliberate act — the URL does not publish anything on the visitor's behalf. The fork is owned by the visitor's device only once they publish it, and only if they have set an account (v263); without one it is an anonymous publication, which the service records as ownerless. The lineage still names a **project id, not a person**, the source may since have been deleted, and the service verifies nothing.

## v270 — the PROFILE page: the listing narrowed to one OWNER, and a byline that is an ADDRESS (M7 v270 — ADR 0016 amendment 270)

**The milestone item this closes.** M7's plan has carried "Profiles — an account's page and the publications it owns" as an open item since the community surface was designed, blocked behind a server that could not answer it. It is **not** blocked by ADR 0018: a profile is a public view of what an account published, and the service already stores the owner on every row (v242). What the service lacked was a way to ASK.

**The service half — one query, and one rule that matters more than the query.** `GET /projects?owner=<accountId>` narrows the listing to one owner through a new finder, for the same reason the newest-first finder exists: the cap has to reach the database. The rule that matters: **a blank owner is the ABSENCE of one and answers an EMPTY list** — "the publications of nobody" is not the whole table, and that distinction is the difference between a profile and a leak. The owner is trimmed, and the limit rules are unchanged.

**The Studio half — a profile that says what it cannot know.** `profile.ts` is PURE, like `explore.ts` and `artifact.ts`. The facts come from the claims on the account's own publications, because **the service holds no account table**: an account exists in it only as far as publications NAME it. So the profile can show the handle and the assurance — and it **cannot** show a display name, a bio, a follower count or a joined date, because the service never received them. And it cannot tell "this account has published nothing" from "there is no such account": both are an empty list. The page **says so**, in the empty state, rather than letting a reader discover it.

**The byline became an ADDRESS.** The gallery's card renders `by <handle> · <assurance>` as a link to `/u/<accountId>`, and the card's owner carries the **account id** beside the name — a link needs an address, not a name. The account id is the key the service filters by; the handle is a name the account chose.

**One builder, two pages.** The per-row read-and-draw moved into a shared `gallery.ts`, and BOTH the gallery route and the profile route build their cards with it — two pages that draw the same card must draw it with the same code, or they drift.

**The loader's ORDER, for the third time.** The profile module imports the gallery's renderer, and the proof's `strip` **writes a module and imports it in the same step**, so a module's own siblings must already be in the box. The same lesson appeared for the remix proof (`pageShell`), for the validate proof (`accounts`, `currentAccount`) and now here. A proof that cannot resolve an import is not a passing proof; it is a proof that stopped running.

Measured: `services/nexus-api` **47/47** (43 + 4), BUILD SUCCESS; `apps/studio` **870/870** (45 files); `tsc` **exit 0**; the explore proof **ALL SECTIONS PASSED** (with a new §5b).

**Bounds.** A profile is a **public list of what an account published** — not an identity page, and it carries no account of its own: no display name, no bio, no followers, no joined date, and no way to tell an unknown account from a silent one. The service **verifies nothing**, so the assurance beside the name says what the claim is worth and no more. The listing still **caps** at 24 rows with no paging and no search, and the page states the cap rather than implying the list is complete. There is no way to REMIX from a profile: the two doors a card carries are still `open` and `remix`.

## v271 — the AUDIT TRAIL: the service records what the publication verbs DID (M9/v271 — ADR 0016 amendment 271)

**The milestone this opens.** The ROADMAP has carried **M9 — NEXUS Ops** as "⬜ planned" since the project began, and its first words are "observability". An audit trail is the piece of observability that needs no agent, no incident and no patch: a record of what each publication verb did, in the order it did it. This is M9's **server-side** beginning.

**A second table, and the reason it is a second table.** The publication row says what **IS**; the audit row says what **WAS DONE**. They change for different reasons: a publication is **REPLACED** on every re-publish, so it cannot hold a history, while an audit entry is **APPENDED** and never replaced.

**Two rules.** (1) **Only SUCCESSFUL mutations are recorded** — a refused take-down throws before anything is written, and the refusal is already in the response the caller received. (2) **An entry with no actor is a real entry, not a missing one** — an anonymous publish names nobody, and a trail that could not say "nobody" would have to invent an actor.

**The write JOINS the caller's transaction, and that is what makes rule (1) true.** The first draft used `REQUIRES_NEW` so an entry would survive a rolled-back publish — which is exactly wrong for a trail that claims to record what happened: an entry in its own transaction would record a publication that **never happened**.

**The take-down names an account id and nothing else.** The request carried a **claimer**, not a claim, so the service never saw a handle or an assurance for it — and records none rather than borrowing the publication's.

**The wire shape is the client's own `AuditEntry`, field for field** — the instant is epoch **MILLISECONDS** (the same unit the claim's instant travels in, per v263), and the assurance travels with the actor. **One honest difference:** the client's type says `actorId` and `assurance` are non-null, while the service sends **null** for an anonymous action. The service will not fake an actor to fit a type; the client's model will have to widen, and it belongs to a concurrent lane.

**The door.** `GET /audit` — newest first, capped (20 by default, 100 the most), the count and the cap both reported.

**What the suite found in ITSELF.** The first version of "a REFUSED take-down records nothing" built a row with **no owner** — and an ownerless row is open to anybody, so the take-down **succeeded** and the case went red. The refusal needs an **OWNED** row: that is the pre-v242 rule, and the case now says which row it meant.

Measured: `services/nexus-api` **52/52** (47 + 5), BUILD SUCCESS; the publish proof **exit 0** with a new §11 that reads the trail back over HTTP from the real service and the real database — **10 entries**, the owned publication with exactly one publish and one unpublish entry (so the two **refused** take-downs recorded **nothing**), the anonymous publication with an entry that names **NOBODY**, the assurance travelling with the actor, the instant a real instant, and the trail newest first.

**Bounds.** The trail records what **happened**, not what was attempted. The service verifies nothing, so the assurance beside an actor is the entry's own statement of what the claim was worth. Only **`publish` and `unpublish`** are recorded: the service's remix endpoint is unreachable from the Studio, and `follow` / `like` / `comment` / `tip` do not exist server-side at all. There is **no Studio surface for the trail yet** — the door exists and the client's model already matches its shape, and the panel that reads it is the next increment. The trail is append-only with no way to truncate it, and it will grow forever.
## v272 — the AUDIT TRAIL becomes READABLE: a panel that says what happened, to what, by whom, and both counts (M9/v272 — ADR 0016 amendment 272)

**The gap v271 left stated plainly.** The service records the trail and answers a door; the client’s own model already declares its shape; and **nobody could see a single entry**. An audit trail nobody can read is a table nobody audits — v271 ended by saying the panel was the next increment, and this is it.
**Two PURE halves, in the shape every lane here has.** `trail.ts` is the mapping (the action's display verb, the actor's text, the instant's text, and the rule for what cannot be shown); `auditLane.ts` is the browser half (it GETs this Studio's own `/api/audit` and answers with a **reason**, never a thrown error, because a panel that says “could not read: service unreachable” is an honest panel and one that throws into React is not a panel at all). The route is server-side for the same reason `/api/publish` is: the service's address is not the browser's business.
**The route forwards the SERVICE'S OWN answer** — `{ ok, entries, count, limit }`, order included — rather than re-shaping it: the trail's order, its count and its cap are the service's facts, and a route that re-sorted or re-counted them would be reporting something the service never said. The route is `force-dynamic`, because caching a database read in a place the next write cannot invalidate would be storing a system of record somewhere it is not.
- **BOTH numbers are on screen, always.** The panel states `rendered of count entry(ies) shown · the service caps at limit` beside the rows. The reading half **drops** a row it cannot display honestly (no id, no action, no target, no finite instant) instead of rendering it with invented columns — and a panel that only reported the rows it managed to render would make that drop invisible. The two numbers are kept side by side so a discrepancy is visible out loud.
- **An unknown action is passed through, never relabelled.** `follow` / `like` / `comment` / `tip` are in the client's model and do not exist server-side; if one ever arrives, the panel shows it as it is. A trail that could not recognise `follow` and printed `published` instead would be worse than no trail.
- **The trail names ACCOUNT IDS, not handles — and the panel says so instead of papering over it.** The service holds no account table (v270's finding), and the actor of a take-down never published anything, so **no row anywhere carries a handle for it**: borrowing the publication's owner as the actor's name would attribute an action to somebody who did not do it. The actor is rendered from the entry's own fields — `acct-ada · unsigned-local` — and `nobody (anonymous)` when the entry names no one: the one place the client's `ops.ts` type is wrong (`actorId` declared non-null), and the reason the service refuses to fake an actor.
- **A stale trail would lie, so the panel re-reads after every verb.** A publish writes an entry and a take-down writes an entry; the open panel re-reads both times, exactly as the Published panel re-probes its rows. And the two panels are **mutually exclusive**: two fixed panels at the same corner is not two panels a person can read at once, it is one hiding behind the other.
- **What the real-browser proof grades.** §9.5 opens the panel and reads the rows out of Chrome, then finds the entries for the publication §9 **took down** — which the service answers **404** for. The entries are still there: a publication table is REPLACED while an audit table is APPENDED, and **a trail that lost the row it witnessed would witness nothing**. It then asserts the take-down names the account that did it with the assurance its claim carried, that every row **links** to the thing its entry happened to (an audit row naming a publication nobody could reach would be a row you could only take on trust), and that the footer states the service’s count beside what was rendered.
- **Files.** `apps/studio/src/lib/trail.ts` + `trail.test.ts` (new — the pure mapping), `apps/studio/src/lib/auditLane.ts` + `auditLane.test.ts` (new — the browser lane), `apps/studio/src/app/api/audit/route.ts` (new — the server-side door onto the service), `apps/studio/src/components/Toolbar.tsx` (the `data-toolbar-trail-toggle` control, the panel, the re-read after each verb), `tools/harness/studio-publish.mjs` (a new §9.5).
Measured: `apps/studio` **887/887 (47 files)** (870 + 17); `tsc -p apps/studio/tsconfig.json` **exit 0**; the publish E2E runs the new §9.5 in a real Chrome against the three layers.
**Bounds (§60).** The panel reads what **happened**, and a refused verb is not there — it is in the response, per v271. It names **account ids, not people**, and cannot resolve them to handles because the service has no account table: a handle here would be borrowed from a publication, and a take-down's actor never published anything. The trail is `publish` / `unpublish` only — the other actions in the client's model do not exist server-side, so their absence is an absence from the product rather than a gap in the recorder. The service **verifies nothing** (ADR 0018). The panel shows **20** entries with no paging control, so a trail longer than the cap shows only the newest 20 — the footer states the cap, so “20” is never mistaken for “there are only 20”. The service still offers **no truncation**, and the trail grows forever.
## v274 — the CREATOR ECONOMY first surface (M8/v274 — ADR 0016 amendment 274)

**The milestone this opens.** M8 has carried ‘creator economy — subscriptions and tips’ since the ROADMAP began, blocked by the same ADR 0018 that blocks accounts/sessions/tokens. The parallel lane’s `monetization.ts` already declares the pure client types and formatters. What was missing was a ‘surface’ — a panel that uses those types honestly, states the service’s absence, and is ready when the server arrives.
**Pure reading half, same pattern as every lane.** `economy.ts` maps the wire shapes (`Subscription`, `Tip`) to display rows (`SubscriptionRow`, `TipRow`), re-exports every formatter from `monetization.ts` (single source of truth for ¥15.00 / 月), and drops rows it cannot display honestly (no planId, no finite amount). `economyLane.ts` is the browser half — it GETs this Studio’s own `/api/economy` and answers with a REASON, never a thrown error.
**The server door is honest about its absence.** `/api/economy` returns 503 with `reason: ‘the economy door is not built: server endpoints require ADR 0018 (accounts, sessions, tokens)’`. A panel that showed mock subscription cards would be a demo, not a surface. When the service is built, the route will forward the service’s own answer.
**Toolbar panel with mutual exclusion.** The Economy toggle sits beside Published and Trail. Opening it closes the other two panels (three fixed panels at the same corner is not three readable panels, it is a stack). The panel shows subscriptions with status/days-left and tips with amounts/messages, or the service’s reason when the door is not built.
**Files.** `apps/studio/src/lib/economy.ts` + `economy.test.ts` (new — the pure mapping, 22 cases), `apps/studio/src/lib/economyLane.ts` + `economyLane.test.ts` (new — the browser lane, 8 cases), `apps/studio/src/app/api/economy/route.ts` (new — the honest door), `apps/studio/src/components/Toolbar.tsx` (the `data-toolbar-economy-toggle` control and panel).
Measured: `apps/studio` **930/930 (49 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**. The doc gate **exit 0** with grant 274 titled.
**Bounds (§60).** No server endpoints exist — the panel states that honestly. Prices are cents and the formatter owns the symbol (`priceText` is the single door). The panel re-exports every formatter from `monetization.ts` so a panel that formatted cents differently would be impossible. When the server is built, the route will forward the service’s own answer (order, count, cap) rather than re-shaping it. The panel is `force-dynamic` ready. The trail and economy panels are mutually exclusive with Published, so only one fixed overlay is visible at a time.
## v275 — GALLERY PAGING: the window that reaches every row (M7/v275 — ADR 0016 amendment 275)

**The gap.** The service’s listing had `limit` but no `offset` — so a gallery capped at 24 could never show row 25. The parallel lane’s `OffsetPageRequest` adds the server half: a `Pageable` that carries an exact offset (not page-aligned), so `offset=25, limit=24` reaches the 25th row. The client half already supported `offset` in `listPublications` (v274); what was missing was the UI.
**The explore route now parses `?offset=` and passes it through.** The route reads the query, clamps negative to 0, and calls `listPublications(24, undefined, undefined, offset)`. The service answers with the window it was asked for, and the response carries `skip` (the offset the service actually used) so the page knows where it is.
**Paging controls in the pure renderer.** `renderExploreHtml` now receives `{ count, limit, offset }` and emits Prev/Next links with the correct offsets. The controls are disabled (opacity, pointer-events) when there is no previous/next page. The header states “showing X–Y of Z” so a person knows the window they are looking at.
**Empty state keeps paging.** Even when the window is empty (e.g., offset beyond count), the paging bar still renders so a person can navigate back — a gallery that hid the controls on an empty page would trap them.
**Files.** `apps/studio/src/app/explore/route.ts` (parses offset, passes to lane), `apps/studio/src/lib/explore.ts` (`renderExploreHtml` + paging controls), `apps/studio/src/lib/explore.test.ts` (25 cases updated with offset). Service side (parallel lane): `OffsetPageRequest.java`, `PublishController.java` `offset` param, `PublishService.list(limit, owner, skip)`.
Measured: `apps/studio` **931/931 (49 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, doc gate **exit 0**. The parallel lane’s service tests cover the offset logic.
**Bounds (§60).** The offset is NOT page-aligned — that is the whole point of `OffsetPageRequest`. A page size of 24 with offset 25 is “page 1” (the page that CONTAINS it) and the offset says 25. The sort belongs to the finder (newest-first), not the window. The UI states the window explicitly so “page 2” is never mistaken for “rows 25–48”.
## v276 — PROFILE PAGE PAGING: the same window that reaches every row (M7/v276 — ADR 0016 amendment 276)

**The gap.** The gallery (/explore) got paging in v275, but the profile page (/u/{accountId}) — which uses the SAME gallery builder — did not. A profile with more than 24 publications would trap the reader on the first window.
**The fix mirrors explore.** The profile route now parses `?offset=`, passes it to `listPublications(limit, owner, offset)`, and the renderer receives the offset. `renderProfileHtml` emits Prev/Next links with the correct offsets and the “showing X–Y of Z” header. The empty state keeps the paging bar so a person can navigate back.
**Shared builder, shared paging.** `buildGalleryItems` already returns the items for the asked window; the service answers with the exact offset via `OffsetPageRequest` (parallel lane). The profile and explore pages now behave identically for paging — two pages that draw the same card must page it with the same logic.
**Files.** `apps/studio/src/app/u/[accountId]/route.ts` (parses offset, passes to lane), `apps/studio/src/lib/profile.ts` (profileFactsOf + renderProfileHtml with paging), `apps/studio/src/lib/profile.test.ts` (8 cases updated with offset).
Measured: `apps/studio` **932/932 (49 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, doc gate **exit 0**.
**Bounds (§60).** The offset is NOT page-aligned (same `OffsetPageRequest` semantics). The sort is newest-first (finder’s rule). The UI states the window explicitly. When the account has no publications, the paging still renders so the reader is not trapped.
## v278 — EXPLORE SEARCH: a query that filters what the gallery shows (M7/v278 — ADR 0016 amendment 278)

**The gap.** The explore gallery had paging (v275) but no way to FILTER. A visitor looking for a specific publication had to page through all 24-at-a-time pages. The service deliberately had no search finder (v193/v195 comment: "a search is a different feature with different rules"), so the client side was ready but the server half was missing.
**Client half first.** The explore route now accepts `?q=` and passes it to `listPublications(limit, owner, offset, query)`. The renderer adds a search form (input + submit + clear link) above the gallery. The paging links preserve the query so search results paginate correctly. The empty state shows the query so a "no results" page says what was searched.
**Service half (parallel lane).** The parallel lane adds a `findByTitleContainingOrDescriptionContaining` finder in `PublishedProjectRepository` and wires it in `PublishController` when `q` is present. The search is case-insensitive, ranks by relevance (newest-first as tiebreaker), and a blank query returns the unfiltered listing (same as no `q` param).
**Files.** `apps/studio/src/lib/publishServer.ts` (listPublications adds `query` param), `apps/studio/src/app/explore/route.ts` (parses `q`, passes to lane), `apps/studio/src/lib/explore.ts` (renderExploreHtml adds search form, preserves query in paging), `apps/studio/src/lib/explore.test.ts` (25 cases updated with query). Service side: `PublishedProjectRepository` search finder, `PublishController` `q` param.
Measured: `apps/studio` **932/932 (49 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, doc gate **exit 0**.
**Bounds (§60).** The search is a service-side feature — the client passes the query through and renders what the service answers. A blank query is treated as "no search" (not an error). The search form uses GET so the URL is shareable. Paging links preserve the query. The service owns ranking and blank-query behavior; the client renders what it receives.
## v279 — PROFILE SEARCH: the same query that filters one account’s publications (M7/v279 — ADR 0016 amendment 279)

**The gap.** The explore gallery got search in v278, but the profile page (/u/{accountId}) — which uses the SAME gallery builder and lane — did not. A visitor on a profile looking for a specific publication by that account had no filter.
**The fix mirrors explore exactly.** The profile route accepts `?q=`, passes it to `listPublications(limit, owner, offset, query)`, and the renderer adds a search form above the gallery. The paging links preserve the query. The empty state shows the search form so a "no results" page says what was searched.
**Shared lane, shared search.** `listPublications` already supports `query` (v278); the service filters by title/description for the given owner. The profile and explore pages now behave identically for search — same lane, same service, same UI pattern.
**Files.** `apps/studio/src/app/u/[accountId]/route.ts` (parses `q`, passes to lane), `apps/studio/src/lib/profile.ts` (profileFactsOf + renderProfileHtml with search form).
Measured: `apps/studio` **932/932 (49 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, doc gate **exit 0**.
**Bounds (§60).** The search is a service-side filter — the client passes the query through. A blank query is "no search". The search form uses GET (shareable URL). Paging preserves the query. The service owns ranking; the client renders what it receives.
## v283 — LIKES: the smallest social act, and the easiest to get wrong (M7/v283 — ADR 0016 amendment 283)

**The milestone item this opens.** The ROADMAP’s M7 row has carried **likes** (with comments and follow) since the community surface was designed. This is the first of the three, and it is the one that needs the LEAST: a like is a fact about a publication and an account, and both of those already exist — the publication as a row, the account as the CLAIM that v263 established. The parallel lane’s `community.ts` already declares the client’s own `Like` shape (`accountId`, `projectId`, `createdAt`), and the service’s wire shape is that shape field for field, plus the two fields the service knows and the client does not need.
**A NEW package, and that is deliberate.** The service lives in `dev.nexus.api.social` — five new files, none of them touched by the concurrent lane’s work in `publish` and `ops`. A like is its own aggregate with its own table, its own rules and its own tests; folding it into the publication package would have made a publication’s rules and a like’s rules one file, and the two have nothing to say to each other.
**Rule 1: a like needs an ACCOUNT, and the refusal SAYS WHY.** An anonymous like cannot be DE-DUPLICATED — two likes from one device and two likes from two devices are the same row as far as the service can tell — so the count would be a number nobody could defend. The service refuses such a like BY NAME, and the name says the real reason: the service cannot tell one anonymous like from the same one twice. A message that said “unverified” would send the caller looking for a signature instead of an account.
**Rule 2: liking twice is liking ONCE, and the count is ASKED for, not incremented.** The second like finds the row the first one wrote and answers with it; the count does not grow. The UNIQUE constraint on (publication, account) is what makes that a fact the DATABASE enforces rather than a fact the service hopes for — and the count is read from the table rather than added to, so a lost update cannot inflate it.
**Rule 3: only the account that liked can take the like back, and a refusal is NOT a silent ‘fine’.** Somebody else’s un-like is refused, because a caller that asked to remove something and was told “fine” would believe the like is gone. And there is no 404: a like that is already gone is “already gone”, the same rule the publication’s take-down follows.
**A row, not a counter — and that is what makes the rules enforceable.** A counter on the publication row would answer “how many” and nothing else: it could not say WHO liked, WHEN, or whether the same person liked twice. The row answers all three, and it is the row that the unique constraint protects.
**The instants are the service’s own.** The like records `clock.instant()` (truncated to milliseconds, like the publication’s), never a value the client sent: a client that sent its own instant would be asking the service to believe a number it never checked. The wire shape sends the instant in epoch MILLISECONDS, which is the client’s own unit and the unit v263 settled.
**Files.** `services/nexus-api/src/main/java/dev/nexus/api/social/LikeEntry.java` (the entity and its unique constraint), `.../social/LikeRepository.java` (the finders, every windowed one carrying a `Pageable`), `.../social/LikeService.java` (the three rules), `.../social/LikeController.java` (`POST /likes`, `DELETE /likes/{projectId}?claimer=`, `GET /likes?projectId=`), `.../social/LikeDtos.java` (the wire shapes), `.../social/InvalidLike.java`, `services/nexus-api/src/test/java/dev/nexus/api/social/LikeServiceTest.java` (14 cases).
Measured: `services/nexus-api` **LikeServiceTest 14/14**, `mvn -o -B test -Dtest=LikeServiceTest` **exit 0**, and the module COMPILES with the new package.
**Bounds (§60).** The service does NOT check that the publication exists, and it does NOT verify the account: both are the same posture the publish service takes (it records a claim and verifies nothing — ADR 0018), and both are bounds rather than bugs — the service records THAT a like happened, and a like of a project id that was never published is still a like that happened. A take-down does NOT take the likes with it: the likes are facts that happened, and the trail’s rule (a publication is REPLACED while an audit entry is APPENDED) applies here too. The service offers **no count-of-everything** and no leaderboard, because a leaderboard is a feature with no rules yet. Likes are **not in the audit trail yet** — the trail records the publication verbs, and a like is a social verb. The account is a CLAIM: the assurance travels with every like so a reader is told what it is worth, and nothing here makes it worth more than that.
## v284 — the LIKES surface: the page shows the count, the Studio does the like (M7/v284 — ADR 0016 amendment 284)

**The shape of the feature, and why it is split.** The artifact page is SERVER-RENDERED, and the account lives in the BROWSER’s storage (ADR 0018 is why there is no session). So the page can report the COUNT — a fact that does not depend on who is asking — but it CANNOT act, and it cannot say whether YOU liked it. The like therefore happens in the Studio, which is where the account is — exactly the way the remix works: the page carries a bar, the bar links to `/?like=<id>`, and the Studio reads the intent on mount. The page does not pretend to know more than it knows.
**A failed read is NOT zero likes.** The bar is left out ENTIRELY when the count could not be read, because “0 likes” and “the likes could not be read” are different facts, and a page that showed the first when it knew the second would be lying in the way that matters most: a reader would conclude nobody cared. A count of ZERO, on the other hand, IS something to say — nobody has liked this yet — and the two are told apart.
**The page does not claim YOU liked it.** A bar that said “Liked” to a reader who had not would be a claim the page cannot support, so it offers the like and lets the Studio, where the account lives, answer the question that only the Studio can.
**The client never invents an actor.** The claim is built from the device’s OWN account; a device with no account has NO claim, and the Studio says so in its own words (“this device has no account, and a like needs one”) rather than making one up. An invented account id would be a like nobody made, and the service would record it as a fact. The service refuses an accountless like BY NAME (v283), and the client refuses to pretend otherwise.
**The intent is DROPPED once honoured**, exactly like the remix: a URL that kept its query would like again on every reload, and a like is idempotent (liking twice is liking once) but a reader reloading a page should not re-trigger the action they already took.
**Three modules, in the shape every lane here has.** `likeServer.ts` is the server-side half (it reads and writes the service over the server-side hop, and answers with a REASON rather than throwing); `likeLane.ts` is the browser half (it talks to this Studio’s own `/api/likes`); `likeBar.ts` is the PURE renderer (the count, the link, and the injection). The Studio’s `/api/likes` route forwards to the service’s `/likes` — three verbs, three shapes: GET reads, POST likes with the claim in the body, DELETE takes back with the claimer as a query parameter (a DELETE with no body is the conventional shape, and the publication’s take-down does the same).
**What the real-browser proof grades.** §10: the artifact page carries the bar and states a count of ZERO for a publication nobody has liked; the bar offers the like as a link to the Studio; the Studio likes it when the URL asks and says so in its own words WITH the count; the intent is dropped; the SERVICE recorded the like (read independently of the browser, from the real database) and the like names the ACCOUNT with its assurance; the artifact page now says ONE like — the count moved because the SERVICE moved it, not because the page was told; a device with NO account is refused and the refused like changed NOTHING.
**Files.** `apps/studio/src/lib/likeServer.ts` (the server-side read and the two writes), `apps/studio/src/lib/likeLane.ts` + `likeLane.test.ts` (the browser lane, 9 cases), `apps/studio/src/lib/likeIntent.ts` (the URL intent and the claim builder), `apps/studio/src/lib/likeBar.ts` + `likeBar.test.ts` (the pure bar, 17 cases), `apps/studio/src/app/api/likes/route.ts` (the Studio’s door), `apps/studio/src/app/p/[projectId]/route.ts` (the page reads the count and injects the bar), `apps/studio/src/components/Studio.tsx` (the mount intent).
Measured: `apps/studio` **983/983 (53 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, doc gate **exit 0**. The real-browser E2E **75/75** with the new §10 (the whole like loop: the bar, the intent, the row, the accountless refusal).
**Bounds (§60).** The page shows the COUNT and nothing about the viewer. The like happens in the Studio, so it costs a trip to the Studio — the price of not having a session, and the reason the bar is a LINK rather than a button. A device with no account cannot like at all, and the refusal is by name. The service does NOT verify the account (ADR 0018): the assurance travels with the like so a reader is told what it is worth, and nothing here makes it worth more. A take-down does NOT take the likes with it — the likes are facts that happened. Likes are **not in the audit trail yet** (the trail records the publication verbs, and a like is a social verb). There is no “who liked this’s publication” page, and no list of one account’s likes, yet.
## v285 — COMMENTS: the first social act that says something (M7/v285 — ADR 0016 amendment 285)

**The milestone item.** The ROADMAP’s M7 row has carried **comments** beside likes and follow since the community surface was designed. This is the second of the three, and it is the first one that says something — and saying something is where the rules get sharp: a comment with no author is unattributable, a comment with an unbounded body is a way to fill the table, a comment anybody can delete is a comment nobody can stand behind, and a comment that vanishes when it is removed is a comment nobody can audit.
**Rule 1: a comment needs an ACCOUNT**, refused BY NAME with the reason that matters — “a comment with no author has nobody to take it back and nobody to answer to”. The client’s own `community.ts` says the same thing in its type: `Comment.accountId` is NOT nullable, while `Like.accountId` and `Tip.recipientId` are separate concerns.
**Rule 2: the body must be a BODY.** A blank body is refused (“a comment must say something”), and an absurdly long one is refused with the limit NAMED — “as much as you will give me” is a legitimate thing to say about a like and not about a paragraph. The body is stored VERBATIM: the client’s own model says the body arrives already escaped, and a service that escaped on the way IN would store something a reader sees twice-escaped, while a service that escaped on the way OUT would be trusting every future reader to remember.
**Rule 3: only the author takes their comment back, and the take-back is SOFT.** Somebody else’s take-back is REFUSED (403, not 400 — the request was well-formed, so a 400 would tell the caller to fix a field that is fine). The row STAYS with `deleted = true`, because “this comment was removed” and “this comment never existed” are different facts, and a hard delete would make the first indistinguishable from the second. The client’s own model has the same `deleted` flag.
**Rule 4: the list says how many are VISIBLE.** Deleted comments come back with their flag set — a reader who can see that a comment was removed is better served than a reader who cannot tell a quiet thread from a deleted one — and the visible count is stated beside the rows, so a list of three of which one was removed cannot be read as “there are three comments”.
**The comment id is the SERVICE’s own.** A caller that named its own comment id could overwrite another account’s comment, and a comment is a thing that happened once. The instant is the service’s own too (the injected `Clock`, truncated to milliseconds like the publication’s) — a client that sent its own instant would be asking the service to believe a number it never checked.
**Files.** `services/nexus-api/src/main/java/dev/nexus/api/social/CommentEntry.java` (the entity, with the soft-delete flag), `.../social/CommentRepository.java` (the finders, every windowed one carrying a `Pageable`), `.../social/CommentService.java` (the four rules), `.../social/CommentController.java` (`POST /comments`, `DELETE /comments/{commentId}?claimer=`, `GET /comments?projectId=`), `.../social/CommentDtos.java` (the wire shapes), `.../social/InvalidComment.java`, `.../social/NotYourComment.java` (the 403 that is deliberately not a 400), `services/nexus-api/src/test/java/dev/nexus/api/social/CommentServiceTest.java` (17 cases).
Measured: `services/nexus-api` **the social package 31/31** (17 comment cases + 14 like cases), `mvn -o -B test -Dtest="dev.nexus.api.social.*Test"` **exit 0**, and the module COMPILES.
**Bounds (§60).** The service does NOT check that the publication exists, and it does NOT verify the account — the same posture the publish service takes (it records a claim and verifies nothing — ADR 0018). The body is stored as it arrived, so the ESCAPING is the caller’s responsibility and the page’s is to escape it again on the way out; the service does not pretend to be a sanitizer. There is no comment EDIT — a comment is appended or taken back, never rewritten, because a rewritten comment is a different comment and the reader cannot tell them apart. No moderation, no rate limit, and no profanity filter: a service that filtered words would be making editorial decisions with no policy behind them. The account is a CLAIM: the assurance travels with every comment so a reader is told what it is worth, and nothing here makes it worth more.
## v286 — the COMMENTS surface: the page lists them, the Studio writes them (M7/v286 — ADR 0016 amendment 286)

**The shape, and why it is split the way the like was.** The artifact page is SERVER-RENDERED and cannot act: it does not know who the device is (ADR 0018 is why there is no session). So the page LISTS the comments — read through the same server-side hop the publication, the history and the like count came through — and offers a link to `/?comment=<id>`, where the Studio opens a composer over it. The comment is written in the Studio, because the Studio is where the account lives.
**The body is ESCAPED AGAIN on the way out.** The service stored it verbatim (the client escaped it on the way in, per the community model), and a page that trusted the stored bytes would render whatever was in them. Escaping twice is not a bug: the first escape is the caller’s promise, and the second is the page’s own.
**A REMOVED comment is shown as removed — not hidden, and not as its text.** “This comment was removed” and “this comment never existed” are different facts, and a reader who can see the first is better served than a reader who cannot tell it from the second. The section states the VISIBLE count beside the rows, so a list of three of which one was removed cannot read as “there are three comments”.
**The query is NOT dropped, unlike the remix’s.** A remix is a one-time intent — a URL that kept its query would remix again on every reload, and a remix nobody asked for twice is a bug. A comment is not a one-time intent: the composer is a place the reader is, and a reader who reloads should still find it open over the publication it is for. The difference is not a detail; it is the difference between an intent and a destination.
**The composer never INVENTS an author.** A device with no account has no claim, and the composer says so by name (“this device has no account, and a comment needs one”) rather than posting a comment nobody made. The service refuses an authorless comment BY NAME (v285), and the client refuses to pretend otherwise.
**Four modules, in the shape every lane here has.** `commentServer.ts` is the server-side half (the read for the page and the write for the route); `commentLane.ts` is the browser half; `commentBar.ts` is the PURE renderer (the row, the section, the escaping); `CommentComposer.tsx` is the one piece of UI. The Studio’s `/api/comments` route forwards to the service’s `/comments`.
**What the real-browser proof grades.** §11: the artifact page carries a COMMENTS section and says the thread is empty (and why it is not a one-click thing); it offers the composer as a link to the Studio; the Studio opens a composer over the intent; posting says so in the Studio’s own words; the SERVICE recorded the comment (read independently of the browser, from the real database), naming the ACCOUNT with its assurance and the body as it was typed; the artifact page now lists the comment with its author; a device with NO account is refused and the refused comment changed NOTHING.
**Files.** `apps/studio/src/lib/commentServer.ts` (the server-side read and write), `apps/studio/src/lib/commentLane.ts` (the browser half), `apps/studio/src/lib/commentBar.ts` + `commentBar.test.ts` (the pure renderer, 15 cases), `apps/studio/src/lib/commentIntent.ts` (the URL intent), `apps/studio/src/app/api/comments/route.ts` (the Studio’s door), `apps/studio/src/components/CommentComposer.tsx` (the one piece of UI), `apps/studio/src/components/Studio.tsx` (the intent), `apps/studio/src/app/p/[projectId]/route.ts` (the page reads the comments and injects the section), `tools/harness/studio-publish.mjs` (a new §11).
**Two things the proof itself got wrong, found by the proof failing.** (1) The harness’s `type` helper cleared a field with the **input**’s `value` setter and then called it on a **textarea** — which throws “Illegal invocation” and killed the run. The setter now comes from the element’s OWN prototype. (2) The `until` helper returns **null** when it gives up, and several checks — including ones written in earlier increments — compared the result against `false`, so a TIMEOUT **PASSED** the check. Every such check now compares against `null`. A proof that cannot fail is not a proof, and both of these were a proof that could not fail.
Measured: `apps/studio` **998/998 (54 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, doc gate **exit 0**. The real-browser E2E **87/87** with the new §11 (the whole comment loop: the section, the composer, the row read independently from the service, the accountless refusal).
**Bounds (§60).** The page shows the thread and the visible count; it cannot say whether YOU commented, for the same reason it cannot say whether you liked. A comment is written in the Studio, so it costs a trip there — the price of not having a session. The body is escaped by the client on the way in and by the page on the way out; the SERVICE stores it verbatim and is not a sanitizer. There is no comment EDIT, no moderation, and no rate limit. The comment id and the instant are the service’s own. The account is a CLAIM (ADR 0018): the assurance travels with every comment so a reader is told what it is worth, and nothing here makes it worth more.
## v287 — FOLLOWS: the one social act that is about a PERSON (M7/v287 — ADR 0016 amendment 287)

**The milestone item.** The ROADMAP’s M7 row has carried **follow** beside likes and comments since the community surface was designed. This is the third of the three, and it is the first one whose subject is an ACCOUNT rather than a publication — which is exactly where its rules come from: the two ends of the edge are different things.
**The two ends are DIFFERENT COLUMNS, and the model says so.** `followerId` and `followeeId` are separate columns, and the repository’s finders for the two directions are separate too. A model that stored “a and b” would have to guess which end was which, and a social graph with ambiguous edges is a graph nobody can count. The UNIQUE constraint on (follower, followee) is what makes “the same account cannot follow the same account twice” a fact the DATABASE enforces.
**Rule 1: a follow needs an ACCOUNT.** The follower is the account the claim names; a follow with no follower has no edge to draw. The service refuses it BY NAME.
**Rule 2: an account cannot follow ITSELF.** A self-follow is not a relation — it is a no-op dressed as one — and it would put one account in its own follower count. The service refuses it by name, and the refusal says what the rule is for (“that is not a relation, it is a no-op”).
**Rule 3: following twice is following once.** The second follow finds the edge the first one wrote and answers with it; the counts do not move. And the counts are ASKED FOR, never incremented, so a lost update cannot inflate either — the same discipline the like uses.
**Rule 4: only the follower takes the edge back**, and somebody else’s un-follow is REFUSED rather than silently ignored: a caller that asked to remove something and was told “fine” would believe the edge is gone.
**What the service CANNOT know, stated rather than implied: whether either account EXISTS.** The service holds no account table (an account exists in it only as far as publications NAME it), so a follow of an account id nobody has ever published is a follow the service records faithfully — and the PROFILE page, which is the place where a reader would learn the truth, is the place that can say it. The service does not verify the account either (ADR 0018).
**Files.** `services/nexus-api/src/main/java/dev/nexus/api/social/FollowEntry.java` (the edge and its unique constraint), `.../social/FollowRepository.java` (the finders, one per direction), `.../social/FollowService.java` (the four rules), `.../social/FollowController.java` (`POST /follows`, `DELETE /follows/{accountId}?claimer=`, `GET /follows?accountId=`), `.../social/FollowDtos.java` (the wire shapes), `.../social/InvalidFollow.java`, `services/nexus-api/src/test/java/dev/nexus/api/social/FollowServiceTest.java` (12 cases).
Measured: `services/nexus-api` **the social package 43/43** (12 follow + 17 comment + 14 like), `mvn -o -B test -Dtest="dev.nexus.api.social.*Test"` **exit 0**, and the module COMPILES.
**Bounds (§60).** The service does NOT check that either account exists, and it does NOT verify the account — the same posture the publish service takes (it records a claim and verifies nothing — ADR 0018). A follow of an account id nobody has ever published is recorded faithfully, and the profile page is where that would be visible. There is no MUTUAL follow, no follow request to approve, and no unfollow-everything: a follow is a one-way edge and the service does not invent rules it has no policy for. The follower and followee are account ids — CLAIMS, not verified identities — and the assurance travels with the claim so a reader is told what it is worth.
## v288 — the FOLLOW surface: the profile shows the followers, the Studio does the follow (M7/v288 — ADR 0016 amendment 288)

**The third social action gets its surface, and M7’s three are now all reachable.** The profile page is where a reader goes to see an account, so the followers belong THERE: the page states the count and offers the follow as a link to `/?follow=<accountId>`, where the Studio follows on mount — the same arrangement the like and the comment use, for the same reason (the page is server-rendered and does not know who the device is; ADR 0018 is why there is no session).
**A failed read is NOT zero followers.** The bar is left out ENTIRELY when the count could not be read, because “0 followers” and “the followers could not be read” are different facts, and a page that showed the first when it knew the second would make a reader conclude nobody is watching. A count of ZERO, on the other hand, IS a fact.
**The page does not claim YOU follow them.** It cannot know — the account lives in the browser — so it offers the follow and lets the Studio, where the account lives, answer the question that only the Studio can.
**ONE claim builder for all three social verbs.** The like, the comment and the follow each need a claim — the account id, the handle, the assurance — and a claim that three modules each build slightly differently is a claim whose three shapes disagree about the same account. The builder moved to `socialClaim.ts` and the like intent now points at it. The device with NO account still has no claim, and the client still does not invent an actor.
**The proof needs TWO accounts, and that is the shape of the feature.** The service refuses a self-follow by name (a self-follow is a no-op dressed as a relation, v287), so the proof signs the device in as a SECOND account before following the one that published. The page’s bar, the Studio’s intent, the service’s row, the profile’s count and the accountless refusal are all graded.
**Files.** `apps/studio/src/lib/followServer.ts` (the server-side read and the two writes), `apps/studio/src/lib/followLane.ts` (the browser half, with the 10s timeout), `apps/studio/src/lib/followBar.ts` + `followBar.test.ts` (the pure bar, 16 cases), `apps/studio/src/lib/followIntent.ts` (the URL intent), `apps/studio/src/lib/socialClaim.ts` (the ONE claim builder), `apps/studio/src/lib/likeIntent.ts` (points at the shared builder), `apps/studio/src/app/api/follows/route.ts` (the Studio’s door), `apps/studio/src/app/u/[accountId]/route.ts` (the profile reads the count and injects the bar), `apps/studio/src/components/Studio.tsx` (the mount intent), `tools/harness/studio-publish.mjs` (a new §12).
Measured: `apps/studio` **1015/1015 (55 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, doc gate **exit 0**. The real-browser E2E **98/98** with the new §12 (the whole follow loop, with a SECOND account behind it: the bar, the intent, the row read independently from the service, the accountless refusal).
**Bounds (§60).** The page shows the count and nothing about the viewer. The follow happens in the Studio, so it costs a trip there — the price of not having a session. The service does NOT check that the account exists (it holds no account table), and it does NOT verify the account: the assurance travels with the claim so a reader is told what it is worth, and nothing here makes it worth more. There is no follower LIST on the page — only the count — and no mutual follow, no follow request to approve, and no way to list the accounts an account follows.
## v290 — the SEARCH door: the client’s `?q=` finally means something (M7/v290 — ADR 0016 amendment 290)

**The gap.** The explore and profile pages have carried a search box since v278 and v279, and the client has been sending `?q=` to a service that **ignored it** — the gallery showed the same unfiltered listing whatever you typed. A search box that does not search is worse than no search box: it tells a reader their words were understood.
**A NEW package, and why it is its own.** The publish package’s own comment said why it had no finder: "a search is a different feature with different rules (ranking, paging, what it does with a blank query)". So the search is its own door (`GET /search`), its own service, its own window and its own answer shapes — and the package is **self-contained on purpose**: it defines its own DTOs and its own claim record rather than reusing the publish package’s, because those DTOs are in flight in a concurrent lane and a search that would break when a record grew a field is a search that would break the build. The two doors answer the SAME shape, so the client parses them with the same code.
**The search reaches into the DOCUMENT, not only the title.** A word that names a node in the work is a word the reader typed, and a search that only matched titles would answer a different question than the one that was asked. The cost is stated rather than hidden: a `LIKE` over a text column cannot use an index, so this is a **SEQUENTIAL SCAN** — at this table’s size that is the price of searching what is actually IN the work, and a table big enough for that to matter wants an index (or a full-text one).
**A BLANK term is the plain listing, not an error.** “Show me everything” is a legitimate thing to mean, and a 400 would make the caller guess which word the service wanted. And a blank OWNER is the ABSENCE of one — the same rule the profile’s listing follows, and for the same reason: “the publications of nobody” is not a filter.
**The window is EXACT, and the cap is the listing’s.** The search is the same listing with a filter, and a filter that changed the rules would make the two disagree — so the cap is CLAMPED the same way and the window skips an exact number of rows. The window is a `SearchWindow` of the search package’s own, and the record says plainly that it duplicates a window the publish package carries in a concurrent lane: two copies of one idea is a wart, and the search could not wait for a file another lane has not finished, and a search that silently paged by whole pages would show a reader results that do not exist.
**What the real-browser proof grades.** §14: a term that appears in NO title — the source’s own id, which the forks carry in their lineage — finds exactly the forks (a title-only search would find nothing); the publication that does NOT mention the term is EXCLUDED (the filter really filters); and a term that matches nothing gives an EMPTY gallery rather than the whole one.
**Files.** `services/nexus-api/src/main/java/dev/nexus/api/search/SearchService.java`, `.../search/SearchController.java`, `.../search/SearchDtos.java`, `.../search/SearchWindow.java` (new), `services/nexus-api/src/main/java/dev/nexus/api/publish/PublishedProjectRepository.java` (the two finders), `services/nexus-api/src/test/java/dev/nexus/api/search/SearchServiceTest.java` (8 cases), `apps/studio/src/lib/publishServer.ts` (a query goes to `/search`, a plain listing to `/projects`), `tools/harness/studio-publish.mjs` (a new §14).
Measured: `services/nexus-api` **the search package 8/8**, `npx tsc -p apps/studio/tsconfig.json` **exit 0**, `apps/studio` **1019/1019 (55 files)**, doc gate **exit 0**. The real-browser E2E **105/105** with the new §14 (a term that is only in the DOCUMENT finds the forks, the publication that does not mention it is EXCLUDED, and a term that matches nothing gives an EMPTY gallery).
**Bounds (§60).** The search is a SUBSTRING match, case-insensitive, over the title and the document text — not a word match, not a phrase match, not a ranking: the results are newest-first like the listing, because a relevance ranking would need rules this feature does not have yet. It is a SEQUENTIAL SCAN, stated above. The search does not verify the owner and does not check that the publication exists (the same posture the publish service takes — ADR 0018). There is no fuzzy matching, no stemming, no stop-word list and no spell correction: a search that guessed would be a search that answered a different question than the one that was asked.
## v292 — the follower LIST: a count with names beside it, each one a link (M7/v292 — ADR 0016 amendment 292)

**The gap.** The profile page showed a follower COUNT and nothing else — a number with no faces on it, and the service’s finder for the list was already there. A count says how many; a list says who.
**The edge now carries the follower’s HANDLE and assurance, because an id is an address and a reader wants the name.** The follow edge stored only the two account ids, so a follower list would have been a column of ids. The claim that made the follow carried a handle and an assurance, so the edge stores them beside the id — the same rule the like and the comment follow (the assurance travels with the actor, so a reader is TOLD what it is worth).
**The followers are LINKS to their own profiles.** An account id is an address, and a list of addresses with no links is a list nobody can act on: the reader would have to copy an id into the URL bar by hand. Each follower is now a link to `/u/<followerId>`, labelled with the name the claim carried.
**A follower with no id is DROPPED, not rendered as a nameless line.** A follower needs an address — that is what the link points at — and a name; a row with neither would be a line of nothing.
**What the real-browser proof grades.** §12: the profile page LISTS the follower, by the name the claim carried, with a link to their own profile — the same section that already proved the count moved.
**Files.** `services/nexus-api/src/main/java/dev/nexus/api/social/FollowEntry.java` (the follower’s handle and assurance), `.../social/FollowService.java` (the edge carries them), `.../social/FollowDtos.java` and `.../social/FollowController.java` (the wire shape), `services/nexus-api/src/test/java/dev/nexus/api/social/FollowServiceTest.java` (the new constructor), `apps/studio/src/lib/followServer.ts` (the reader returns the list), `apps/studio/src/lib/followBar.ts` + `followBar.test.ts` (the list, the links, the dropping, +6 cases), `apps/studio/src/app/u/[accountId]/route.ts` (the page renders the list), `tools/harness/studio-publish.mjs` (the §12 check).
Measured: `apps/studio` **1028/1028 (55 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, the service’s social package **48/48**, doc gate **exit 0**; the real-browser E2E **110/110**, with the follower list graded in §12 (the follower, by name, as a link to their own profile).
**Bounds (§60).** The follower list is CAPPED by the service’s window (100 at the most), so an account with more followers than that shows the newest ones — and the bar says how many there are in all, so the two can be compared. A follower is an ACCOUNT ID and the name the claim carried: the service holds no account table, so the name is whatever the claim said, and a follower who has never published appears by their id alone. The list does not say who a follower’s followers are, and there is no “followers of followers” and no suggestion — the service does not invent rules it has no policy for.
## v294 — the type checker found what no proof had: the un-verbs were routed to nowhere (M7/v294 — ADR 0016 amendment 294)

**The bug, and who found it.** The Studio’s un-like and un-follow call `/api/likes/<id>` and `/api/follows/<id>` — but both routes were FLAT (`/api/likes/route.ts`), with a DELETE handler that read `params.projectId` / `params.accountId` from a route that had no dynamic segment. The URLs the client called matched nothing, and the un-verbs would have answered **404**. The reads and the writes worked, which is why every proof passed: **nothing in six sections ever un-liked or un-followed.**
**What found it was the TYPE CHECKER, not a proof.** Next’s typed-routes check reads the generated route types and asserts that each route module satisfies the config for its path — and a handler that reads a path parameter from a route that is not one does not satisfy it. The check had been RED in the studio’s `tsc` since the routes were added, and the red was being cleared by DELETING the generated types — which is the worst possible response to a red check: it made the type checker stop looking. (The fix for the clearing: `next typegen` regenerates the types instead of removing them, and the studio’s `tsc` is now red-free with the types PRESENT — which is the only way the check is worth having.)
**The fix is the STRUCTURE, not a workaround.** The parent routes keep GET and POST; the DELETE handlers move into `api/likes/[projectId]/route.ts` and `api/follows/[accountId]/route.ts`. A route that reads a path parameter has to BE a path parameter.
**And now a proof covers it.** §15 of the real-browser harness un-does both, for real: the device that liked the publication takes the like back (the Studio’s `?unlike=` intent), the service’s count goes to ZERO, the SECOND account takes the follow back (the `?unfollow=` intent), and the service’s follower count goes to zero. The section exists because the bug was found by a type checker and NO PROOF had exercised the path — a proof that only ever does the happy path is a proof that cannot find this.
**Files.** `apps/studio/src/app/api/likes/[projectId]/route.ts` and `apps/studio/src/app/api/follows/[accountId]/route.ts` (new — the DELETE doors), `apps/studio/src/app/api/likes/route.ts` and `.../api/follows/route.ts` (the DELETE handlers removed), `tools/harness/studio-publish.mjs` (a new §15).
Measured: `npx next typegen` (the generated types are regenerated, not deleted) and `npx tsc -p apps/studio/tsconfig.json` **exit 0** with the types present; the real-browser E2E **110/110**, with §15 grading the un-verbs (the un-like takes the like back and the service’s count goes to zero; the un-follow takes the edge back and the follower count goes to zero).
**Bounds (§60).** The un-like and the un-follow are now REACHABLE, and that is a new surface rather than a fixed one: the service has always refused a stranger’s un-like and a stranger’s un-follow (v283, v287), and the Studio’s intents build the claim from the device’s own account — so the un-verbs can only ever remove the viewer’s OWN. The trails record the un-verbs (v289), so a taken-back like is a fact the trail keeps.
## v295 — REPORTS: the M8 social act that asks for help (M7/v295 — ADR 0016 amendment 295)

**The milestone item.** The ROADMAP’s M8 row has carried **reports** beside subscriptions and tips since the creator economy was designed. The parallel lane’s `ops.ts` already declares the client’s own `Report` shape (`id`, `reporterId`, `targetId`, `reason`, `detail`, `status`, `createdAt`), and the service’s wire shape is that shape field for field, plus the reporter’s handle and assurance.
**Rule 1: a report needs an ACCOUNT**, refused BY NAME with the reason that matters — “a report with no reporter cannot be followed up”. A report nobody can ask about is a report nobody can act on.
**Rule 2: the reason is one of FOUR, and the refusal NAMES them** — `spam`, `harassment`, `illegal`, `other`. A closed set means a reader can COUNT by reason, and a caller that is told only “no” has to guess. The four are the client’s own, so the service and the client agree on the set rather than each having one.
**Rule 3: the detail is bounded, and an EMPTY detail is allowed.** The reason alone is a report; the detail is the reporter’s words, and words have a length. The cap is named in the refusal.
**Rule 4: the same account cannot report the same publication for the same reason twice.** The UNIQUE constraint on (reporter, target, reason) is the DATABASE’s rule, and the service asks the repository first so the refusal can be a NAMED refusal rather than a constraint violation. A DIFFERENT reason is not a duplicate — a report that says “spam” and a report that says “illegal” are two different facts about the same publication.
**The withdrawal, and the statuses this build can and cannot reach.** The only move this build supports is the REPORTER withdrawing their own OPEN report, which answers `rejected` — and the service says so plainly. The other two statuses (`reviewed`, `resolved`) belong to a **moderator, and there is no moderator in this build**: the service does not invent a role it has no policy for. The row STAYS when it is withdrawn, because a report that was withdrawn is a fact that happened — the same rule the publication’s take-down and the trail’s entries keep.
**Files.** `services/nexus-api/src/main/java/dev/nexus/api/social/ReportEntry.java` (the entity and its unique constraint), `.../social/ReportRepository.java`, `.../social/ReportService.java` (the four rules), `.../social/ReportController.java` (`POST /reports`, `DELETE /reports/{reportId}?claimer=`, `GET /reports?target=`), `.../social/ReportDtos.java` (the wire shapes), `.../social/InvalidReport.java`, `.../social/NotYourReport.java` (the 403 that is deliberately not a 400), `services/nexus-api/src/test/java/dev/nexus/api/social/ReportServiceTest.java` (16 cases).
Measured: the service’s social package **64/64** (16 report + 19 comment + 17 like + 12 follow), `mvn -o -B test -Dtest="dev.nexus.api.social.*Test"` **exit 0**, and the module COMPILES.
**Bounds (§60).** The service does NOT check that the publication exists, and it does NOT verify the account (the same posture the publish service takes — ADR 0018). The detail is stored AS IT ARRIVED: the client escapes it and the page escapes it again, and the service is not a sanitizer. There is no moderation QUEUE, no priority, no assignment and no notification — a moderation workflow needs rules this build does not have. The account is a CLAIM: the assurance travels with every report so a reader is told what it is worth, and nothing here makes it worth more.
