# CI Operations Runbook

Hosted Studio CI is the only hosted verdict this repo recognizes (master, both branches,
`xiaodernan/nexus-content-platform`). This file is the two hosted failure families this
project actually hit in Nov 2026, with the fix and the anti-fix for each. If Studio goes
red, start here before re-diagnosing from zero.

## 1) Arms-freshness - the receipt rots when a subject moves

Symptom (red row at 0.1s, everything else green):

```
verify:arms-freshness  docs/evidence/ci/arms-freshness-proof.mjs ... RED 0.1s
AssertionError: the arming tool's subjects changed since their last green run (<ts>): mainline ...
```

Subjects (SUBJECT_FILES in docs/evidence/ci/arms-receipt.mjs):

- `.github/workflows/ci.yml` (workflow)
- `.github/workflows/main-line.yml` (mainline)
- `docs/evidence/ci/ci-wiring-proof.mjs` (gate)
- `docs/evidence/ci/ci-wiring-arms.mjs` (arms)
- `tools/ci/proof-set.mjs` (runner)
- `docs/evidence/agents/sweep.mjs` (sweep)

Fix: any change to these six files must re-issue the receipt IN THE SAME PUSH:

```
node docs/evidence/ci/ci-wiring-arms.mjs   # full green run
git add docs/evidence/ci/arms-receipt.json
git commit ... && git push origin master main
```

A partial run (`--only`) must not be able to leave a valid receipt (by design: the proof
refuses it). Line endings are canonicalised before hashing (LF), so a Windows checkout
is not penalised; the receipt carries armNames the gate re-reads, not memory.

Do NOT: commit the subject change separately from the receipt (exactly the rot this gate
was built for - v540); do NOT edit SUBJECT_FILES or the gate to "make it pass"; do NOT
force-push to re-run the battery with the same stale bytes.

Not a fix: re-running the same push and hoping for a green (the bytes decide, not luck).

## 2) Container-bind - hosted pgvector port collision

Symptom (red row at job setup, `gates` job, ~15s in):

```
Initialize containers: pgvector/pgvector:pg16 ...
##[error]failed to set up container networking: driver failed programming external connectivity
##[error]on endpoint ...: failed to bind host port 0.0.0.0:55100/tcp: address already in use
```

Root cause: `main-line.yml` (2026-11-12 fix, e97007f) previously dual-bound
`55433:5432` and `55100:5432` to the same service. The runner already claims 55100.

Fix: `ports: - 55433:5432` only, and both `NEXUS_DATABASE_URL` refs point at
`localhost:55433/nexus` (the code default; apps/web/src/server/db/client.ts).

`verify:traffic`-family failures on the hosted plane (psql socket no such file / database
system is starting up, seen on c1e93c2 and e189c42) remain open for hosted action -
spring-cloud-proof tears its throwaway instance down before sibling proofs run; not
fixable from this host's checkout without editing shared bytes other lanes own.

## 3) Reading a red correctly

1. Open the failing run: `gh run view <id> --repo xiaodernan/nexus-content-platform --log-failed`.
2. Find the single failed row (everything else green + "118/119 green of a derived population").
3. Match the verbatim clause to this file. If it matches, the fix is named above.
4. If it does not match, record the exact clause in CURRENT-STATE.md; do not re-push blindly.
5. Never print, stage or commit plaintext provider credentials (NEXUS_OPENAI_API_KEY lives in
   gitignored files only; docs/.env-adjacent files are outside tracked content).

## 4) Receipt hygiene checklist (copy into any PR that touches subjects)

- [ ] `node docs/evidence/ci/ci-wiring-arms.mjs` full green on the exact pushed bytes
- [ ] `docs/evidence/ci/arms-receipt.json` staged alongside the subject change
- [ ] `npm run verify:arms-freshness` exit 0 locally
- [ ] `npm run verify:record-encoding` exit 0
