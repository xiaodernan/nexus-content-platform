# services/nexus-api

The NEXUS **system of record** (ADR 0011). Java 25 + Spring Boot + PostgreSQL.

M7 v193 is this service's first slice: **publish a project, read it back.** That is the whole of it.

## What it does

| method | path | answer |
| --- | --- | --- |
| `POST` | `/projects/{projectId}/publish` | `201` + a receipt when the id was new, `200` + a receipt when it already had a publication |
| `GET` | `/projects/{projectId}` | `200` + the publication (document included), or `404` when nothing was ever published |
| `GET` | `/projects?limit=N` | `200` + the newest N publications — metadata only, no documents |
| `DELETE` | `/projects/{projectId}` | `200` + `{ removed }` — `false` when there was nothing to take down |

A **receipt** names what was recorded — id, title, version, instant, URL — and deliberately does **not** echo
the document back: the caller just sent it, and a receipt that repeats a large payload grows with the
document. A **read** does carry the document, because that is what reading a publication is for.

The `url` is built from the request that asked (`ServletUriComponentsBuilder`), so it names an address that
actually serves the publication rather than a configured "public base" that could point at nothing.

## The rules, and why each exists

1. **A project id must be usable** — not blank, ≤200 chars, no control characters. A row keyed by a blank id
   is a row nothing can address.
2. **A title must be non-blank** (≤500 chars). A publication with no title is one the Studio would have to
   name itself, and a name the *server* invented is not a fact about the project.
3. **The document must be a JSON object.** Not "valid JSON" — `42` parses and is not a design document. This
   is the one place the service looks inside the payload, and it is a shape check, not an interpretation:
   the bytes are stored **verbatim** afterwards.
4. **Re-publishing the same id UPDATES the row and increments its version.** It never creates a second row,
   because "the publication of project X" must have exactly one answer.

The instant is **truncated to microseconds** before it is stored, because that is PostgreSQL's precision. The
proof caught the receipt reporting `…01.824829200Z` while the row read back as `…01.824829Z` — a receipt
claiming precision the database had already dropped.

## Running it

```bash
# unit tests — no database, no Spring context
npm run verify:api-tests

# the real thing: builds the jar, starts a throwaway PostgreSQL, publishes, restarts, reads back
npm run verify:publish
```

The service is configured by **environment** (`NEXUS_DB_URL`, `NEXUS_DB_USER`, `NEXUS_DB_PASSWORD`,
`NEXUS_API_PORT`, `NEXUS_PORT_FILE`). The proof passes the same values as **command-line arguments**
instead — see the note below.

## Bounds, stated (§60)

- **No auth, no accounts, no ownership.** Anyone who can reach the service can publish any project id.
  M7's profiles/likes/comments/follow/remix are later slices; this one is one aggregate and two endpoints.
- **Listing is capped, not paged.** `GET /projects` answers at most 100 (20 by default) newest-first, and the
  answer reports the cap it applied. A caller that wants the 5000th publication is asking a question this
  service does not answer yet.
- **`ddl-auto: update`, no migrations.** The schema is one table and this service is the only writer. A
  migration tool is the honest answer once a second writer or a destructive change exists.
- **The URL is this server's.** No CDN, no rewrite rule, no custom domain. "Hosted publish" here means a row
  on this service and an address that serves it.
- **The document is stored, not understood.** No validation beyond "is a JSON object", no migration, no
  projection, no versioning of the document's own shape. A row read back is the bytes that were published.
- **A publication is replaced, not versioned.** Re-publishing bumps a counter; the previous document is
  gone. History is a later slice.
- **Unpublish is hard.** A taken-down publication is gone; there is no soft delete and no record that it
  existed.

## A note on how the proof configures this service

The proof passes `--server.port=…` and `--spring.datasource.url=…` as **command-line arguments**, not as
environment variables. That is not style: on this host, an environment variable named `SERVER_PORT` is
injected into child processes and outranks a `${…}` placeholder in `application.yml`, so the service bound a
constant port held by another program and failed to start. Measured with `--debug`. Command-line arguments
outrank environment properties in Spring Boot, so they are what a proof must use — a proof should not be at
the mercy of the ambient environment.
