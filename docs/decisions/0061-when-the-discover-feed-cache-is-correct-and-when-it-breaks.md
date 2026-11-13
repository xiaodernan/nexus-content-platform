# 0061 — When the Discover feed cache is correct, and when it breaks

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

`/api/discover` answers one question thousands of times: *"what are the platform's newest / most
liked public publications?"*. Each call computes three correlated COUNT subqueries against the public
`published_projects` table (likes, comments, remixes), plus a filter over `moderation <> 'rejected'`
and visibility and a sort window (the trending cap ADR-0094 fixed). The database was already one find
statement + a few subqueries, all indexed. The page the user sees refreshes on every navigation.

A naive 15-second unkeyed cache would lie: a rejection by a moderator would not show for 15 seconds
on other instances; a publisher's own page would show their own outdated state. This ADR names the
bounded configuration, what was cached, where it goes stale, and why the invalidation hops exist.

## Decision

### 1. Only the anonymous call is cached

`currentUserOrNull() === null` gates the cache entry; every personalized path ("following", "mine",
any viewer-following state) computes fresh per request as before. This single rule protects the
likes/unlikes of your own publications from staleness.

### 2. Key is `(sort)`; value is the complete `DiscoverResult`

There is exactly one value per sort (`new`, `popular`, `following` — the personalized ones compute
per-user, so they are never cached at all). Eight entries, FIFO insertion order defines the LRU rule
(`TtlLru`).

### 3. TTL is 15,000 ms — explicitly chosen, not a typo for 15_000_000

At one-second TTL this cache is a no-op (the route parses `JSON.parse`, takes the same path through
`discover()` and lands on identical results dozens of times per second — nothing saved). At ten-minute
TTL, a rejected publication could
live on every anonymous instance for ten minutes after a moderator overruled. Fifteen seconds is where
"money saved per call × real user perceptions" intersects "the window where content is untrue to a
moderator's verdict". It is also a number a human can remember — the route comment and the test say it.

### 4. Two write paths invalidate; no others exist

- `publish.ts` — the publication commit fires `invalidateDiscoverRoute()`.
- `moderation.ts` — the human moderation verdict fires the same call on the `resolveCase` write.

Every other mutation to the public feed (a new public submission, a visibility flip to private, a
project deletion, a like, a comment, a remix) either (a) can be observed within 15 seconds, or (b)
calls one of the two, or (c) is not a mutation the route can observe. The `reject` trigger is the
critical one: a rejected publication that IS on public instances BEFORE the 15s window expires is
allowed to linger for at most 14 extra seconds — and that is *published*, not leaked; the reject call
drains the route instantly for every subsequent visitor.

### 5. The cache is a process-local optimization

If multiple processes are serving behind a load balancer with `NEXUS_REDIS_URL` configured, the
driver (`server/realtime/bus.ts`) fans out through Redis Pub/Sub — which observies the same
`buildDiscoverAnonymousInvalidate` call at each wall clock tick — but `cachedDiscoverAnonymous`
itself does **not** span the cloud: each process holds its own copy, refreshing the same public
truth. This matches the pattern used elsewhere in this repo (Redis as the fan-out substrate, local
caches for recomputation avoidance — see `realtime/redisBus.ts` for the fan-out side).

## Bounds and trade-offs

- **The 15s max staleness is not a bug it can hide**: a publication can be visible for up to 15
  seconds after a moderator rejected it (or a publisher unpublished it). That window is bounded,
  documented here and in the route comment, and widened only by the author explicitly changing
  `DISCOVER_ROUTE_TTL_MS`.
- **The cache cannot leak across viewers**: only anonymous requests read it.
- **The cache does not make the following/trending publications any cheaper**: those calls recompute
  every time, with the same indexed queries they always used.
- **Cache eviction is insertion-ordered LRU, not LFU** — the most-hit sort is `new` (the default
  sort), and a 16-mode route calling eight sorts cannot out-LRU the modulo on the same neighbors
  run. This is deliberate: there are only 3 non-personalized sort values, so the eviction rule has
  at most 8 live keys in any honest usage.
- **Cache hit rate is not published as a metric yet**: the metric vocabulary would
  introduce new cardinalities against a store we already treat as devil's advocate for content
  moderation; adding `nexus_discover_cache_hits_total{outcome}` is tracked as the next increment.

## Alternatives rejected

- **Cache the raw DB query results** (in an intermediary between domain and route). Rejected: cache
  belongs at the route boundary where the shape of the payload is already known; lower-level caching
  would duplicate the same transaction elsewhere in the codebase.
- **Invalidate on every mutation** (every `likePublication`, `remixProject`, etc.). Rejected: too many
  entry points, too likely to be missed; the moderator-verdict invalidation is the only one that
  needs zero-bounded delay because it has the strongest meaning.
- **Push invalidation through Redis pub/sub instead of clearing local**: over-engineered. Same effect
  (clears on all replicas) but ties the cache's correctness to Redis's health; the plain
  `Map.set`/`clear` is the highest-integrity option when the same message travels on the same channel
  the notifications already use.

## References

- `apps/web/src/server/cache/ttlLru.ts` — the primitive
- `apps/web/src/app/api/discover/route.ts` — the call-site
- `apps/web/src/server/cache/discoverRouteCache.ts` — the module
- `apps/web/src/server/domain/publish.ts` and `apps/web/src/server/domain/moderation.ts` — the two
  invalidation sites
- ADR 0094 — the trending-cap fix that this cache lets read at the same rate as before
- ADR 0058–0060 — the broader Spring Cloud estate this page precedes
