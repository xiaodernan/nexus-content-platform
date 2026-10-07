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
