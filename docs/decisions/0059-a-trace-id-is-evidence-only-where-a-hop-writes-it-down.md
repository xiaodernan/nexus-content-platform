# 0059 — A trace id is evidence only where a hop WRITES IT DOWN

- **Status:** Accepted
- **Date:** 2026-11-11
- **Slice:** CONVERGENCE v656 (Micrometer Tracing + W3C propagation across edge → api → Feign → domain)

## Context

The slice's sentence was short: *one trace id, read at every hop*. The obvious way to prove it is
the obvious way to implement it — put `micrometer-tracing-bridge-brave` on the classpath, keep
Spring Boot's `logging.pattern.correlation`, make a call, and read the id out of each service's log.
Boot prints `[app,traceId,spanId]` on every line; the hop logs are right there.

Measured, that plan produced this, on a run where §1–§10b were already green:

```
the edge printed no trace id at all — its log carries no [app,traceId,spanId] line.
Seen: {"the edge": [], "nexus-api": ["6af35f4d9b7fff19e6eff73eaba40261"], "the domain service": []}
```

Three separate facts were hiding behind that one red line, and none of them was "tracing is broken".

**1. An id in a log requires a LINE.** The bridge had put ids in the MDC on all three services. But
a logging pattern prints what is written, and the edge and the domain service wrote **one line per
process** ("listening on port …") and **none per request**. nexus-api wrote per-request lines only
when something FAILED (`DomainProjectReader`'s warnings), which is why the id the first run found
belonged to a breaker test from §12 rather than to the healthy call in §7. A hop that answers
requests silently cannot be found by an id, no matter how correct its tracing is.

**2. WebFlux never opens a thread-scoped span, so its MDC is empty.** After the hop log was added,
the edge printed:

```
[nexus-gateway,,] hop gateway received GET /api/domain/projects/abc
```

and this is the same request as seen by an upstream that echoes its headers:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-e2a406945c3e465d-01
```

The edge had taken the caller's trace, created a child span, and injected it into the request it
sent. **The wire was right and the log was empty**, because the observation lives in the Reactor
context and the Reactor thread that writes the line has nothing in its MDC to print.
`Tracer.currentSpan()` is null on that thread for exactly the same reason. The two servlet services
have the opposite behaviour: their observation opens a real scope on the request thread, so the
pattern fills itself.

**3. The span is not where it looks like it is.** The first fix read the exchange's
`ServerRequestObservationContext` and asked it for `Span.class`. It compiled, ran, and printed
empty ids again: the tracing handler stores the span inside a
`TracingObservationHandler.TracingContext` kept on the observation's context
(`getTracingContext` → `context.getOrDefault(TracingContext.class, …)`, read out of
`micrometer-tracing` 1.5.12 with `javap`). Asking for the wrong key returns null, and null looks
exactly like "this hop has no span".

## Decision

### 1. Every hop writes ONE line per request, and it is a product feature

`HopLogFilter` exists in all three traffic services — a servlet `OncePerRequestFilter` in `nexus-api`
and `java-domain-service`, a reactive `GlobalFilter` in `java-gateway`. It writes two lines:
`hop <service> received <METHOD> <path>` before the call continues, and
`hop <service> answered <METHOD> <path> -> <status> in <n> ms` when it completes.

This is not scaffolding for a proof. It is the line an operator greps at 03:00, and its absence was
the reason an id could be found at one hop and nowhere else. The cost is two INFO lines per request
and is stated in the class; the trade (lower `dev.nexus` to WARN and lose traceability with it) is
an operator's to make deliberately.

### 2. The edge BORROWS its ids from the exchange's observation — it does not invent them

`java-gateway`'s filter reads `ServerRequestObservationContext.findCurrent(exchange.getAttributes())`,
takes the `TracingObservationHandler.TracingContext` off it, and puts that span's `traceId`/`spanId`
into the MDC **for the duration of one log call**, restoring what was there afterwards.

That is not decoration and it is not a workaround for a missing feature: it is the same span the
edge puts on the wire (the `traceparent` above carries its span id). A class that minted an id, or
copied one out of the incoming header, would prove only that it can concatenate strings; this one
makes the edge's OWN span ids reach the edge's OWN log.

### 3. The proof MINTS the id it looks for

§10c of `docs/evidence/java/spring-cloud-proof.mjs` generates a trace id, sends it as a W3C
`traceparent` through the edge, and then requires **that exact id** to appear in all three hops'
logs, inside the correlation segment `[app,traceId,spanId]` — not merely somewhere in the text,
because the segment is what the pattern fills from the MDC and what an operator greps.

Minting it is what makes the question answerable. An id harvested from the logs could belong to a
different request, or to a failure from an earlier section — that is precisely how the first version
of the section "passed" at nexus-api. An id the CALLER chose cannot be produced by a hop that lost
it, and a hop that quietly started a new trace prints a different one.

The section also requires three DIFFERENT span ids under that one trace: one trace, three spans is
what a chain looks like; three identical span ids would be one hop writing three times.

### 4. Exactly three hops, and the format does not vary

The tracing bridge is on `java-gateway`, `nexus-api` and `java-domain-service` — the hops a request
crosses. The registry is discovery and the config server is boot-time configuration; neither sees a
project read, so neither carries the bridge, and a static leg asserts the set is exactly these three
so a new traffic service has to be written down (`apps/web/test/java-tracing-surface.test.ts`).

Every deployable, including the registry and the config server, prints the same correlation segment.
A process whose line shape differs from its neighbours' is a log you have to think about.

### 5. Propagation is W3C `traceparent`, and sampling is a knob

`management.tracing.propagation.type: W3C` on every hop and in the shared document: `traceparent` is
what a proxy, a mesh and an APM already understand, and a bespoke header would trace this repository
and nothing else. `probability: ${NEXUS_TRACING_SAMPLING:1.0}` because a sampled-out request is a
request with nothing to read — the proof needs 1.0, a deployment picks its own number.

### 6. The static half grades the wiring, the proof grades the arrival

`java-tracing-surface.test.ts` (23 legs) asserts: the bridge is in the three poms and only those
three, `feign-micrometer` is on `nexus-api` (or the trace stops at the call and the domain service
starts its own), every deployable prints `%X{traceId}`/`%X{spanId}`, the propagation type is W3C,
sampling is a knob, each hop has a `HopLogFilter` that logs and sees every request, and the edge's
filter reads the observation rather than the MDC. The proof asserts what no amount of reading can:
that a caller's id, once sent, arrives.

The four mutation arms that were run and restored: remove the correlation pattern from `nexus-api`
(statically red), remove the bridge from `java-domain-service` (statically red), remove
`feign-micrometer` (statically red), and the runtime arm — the first version of §10c itself, which
went red for the right reason and named the two silent hops.

## Consequences

**What is NOT here, stated so it is not read as more.** There is no collector and no exporter: spans
are created, given ids, propagated on the wire and printed, and then they end with the process. This
slice buys **log correlation** — the ability to follow one request through three services by grep —
not trace storage, latency histograms per span, or a service map. Those need a backend (OTLP or
Zipkin) and a decision about operating it, which is a bigger claim than this slice makes.

**What it cost, honestly.** Two nights of runs, one of them on a machine whose config server on 8888
was feeding a neighbour's Eureka (ADR 0057, amended in v658), and three "the fix worked" moments that
did not: the id was missing because no line was written, then because the wrong MDC was empty, then
because the span was under the wrong key. Each one is now a comment at the place it bit, because a
sentence in a decision record is not where the next person looks.

**What it changes for an operator.** One id is now readable at every hop in the correlation segment
of the hop log. `grep <traceId>` on three logs answers "what did this request do here" without a
tracing backend, and the same id is on the wire, so the day a backend is added the spans it collects
join the lines that already exist.

## Evidence

- `docs/evidence/java/spring-cloud-proof.mjs` §10c — mints a `traceparent`, requires the minted id
  in the correlation segment of the edge, `nexus-api` and the domain service, and requires three
  distinct span ids.
- `apps/web/test/java-tracing-surface.test.ts` — 23 static legs (bridge, pattern, W3C, sampling,
  hop log, edge observation), run in the ordinary suite.
- Measured transcripts of the three wrong turns: `docs/CURRENT-STATE.md` (cont. 11 appendix).
