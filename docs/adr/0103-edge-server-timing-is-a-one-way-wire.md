# 0103 — The edge gives its time on the wire (`Server-Timing`), not in the logs

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The gateway wrote one line per request to its log (v656) and an operator with a trace
id from a slow call could read it there and at nexus-api and at java-domain-service.
What the edge could not do was let a BROWSER tab, a CLI probe, or a browser dev-tools
panel distinguish "edge fast, downstream slow" from "edge slow" without going back and
searching the logs. The caller's view of the world had nothing to tell them which hop
spent the time.

`Server-Timing` is the W3C HTTP header intended for exactly this signal. It carries
a per-hop measurement and is what dev-tools' Network panel reads. It is a hint, not
a guarantee of service, and it is permitted on every response. Before v670 nothing on
this platform emitted it.

## Decision

The edge emits `Server-Timing: edge;dur=<milliseconds>` on every response. The value
starts when the edge registers the incoming request and is read at `beforeCommit` —
the last moment headers can still change. It reports the edge's own half of the
request time; it says nothing about downstream durations, which is a fact this ADR
chooses to NAME rather than hide.

Downstream time belongs to those services. The edge does not try to measure what it
does not own. The header's existence is bounded to the edge half; that is an honest
limit, not a hidden one.

## Why this, and not "one shared upstream timing header"

- A shared `Server-Timing` that aggregates downstream would require the gateway to
  understand every downstream body to calculate anything. A broken downstream would
  make the header's number meaningless.
- `ce` / `trailer` semantics differ; the direct `Server-Timing` on the response from
  the gateway is the hop that owns that edge number; nobody else's timing is in this
  header.
- The fallback path must ALSO carry the header. If it does not, an operator reading
  the failure log line at 03:00 has the upstream fact but no hop-time to compare it
  against the happy path. The fallback test pins the header on the 503 branch.

## What this does NOT claim

- It is not an SLA header. It is a measurement.
- It does not prove the edge is fast; it only proves the edge reports its own time.
- Downstream writers of `Server-Timing` are welcome if each writes its own key once
  per response; the edge does not audit that.

## Consequence

- `/api/echo` carries `Server-Timing: edge;dur=<n>` on both happy path and fallback.
- Operators reading dev-tools / curl output know which half of the request is slow.
- The Java topology proof prints the header on every probe it does (not just this one);
  the proof of v670 is `ServerTimingTests` and `NexusGatewayApplicationTests` (fallback
  clause), both green at this ref on this host.

## Open (not this ADR's to close)

- Downstream services emitting `Server-Timing` themselves; out of scope here.
