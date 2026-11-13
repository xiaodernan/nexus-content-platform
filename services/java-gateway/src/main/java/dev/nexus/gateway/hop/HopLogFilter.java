package dev.nexus.gateway.hop;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.handler.TracingObservationHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.observation.ServerRequestObservationContext;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * v656 — the hop ANNOUNCES the request it served, so the trace id it was given can be read at 03:00.
 *
 * <p><b>Why this class exists at all.</b> A tracing bridge puts the correlation ids in the MDC and
 * the logging pattern prints them ({@code [app,traceId,spanId]}) — but only on lines that are
 * WRITTEN. The edge wrote no line per request: it answered, recorded a metric, and left nothing in
 * its log. An operator holding an id from a slow request then found it at nexus-api and at the
 * domain service and nowhere at the edge — not because the edge ignored the id, but because the edge
 * never printed anything to put it in.
 *
 * <p><b>Why this class has to fetch the ids itself (measured 2026-11-11).</b> On the two servlet
 * services the ids appear in the pattern for free: the server observation opens a SCOPE on the
 * request thread, the scope writes the MDC, the pattern reads it. That is not what happens here.
 * Measured on this service, with an upstream that echoes its headers back:
 * <pre>
 *   wire:  traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-e2a406945c3e465d-01
 *   log:   [nexus-gateway,,] hop gateway received GET /api/domain/projects/abc
 * </pre>
 * The edge took the incoming trace, created a child span ({@code e2a406945c3e465d}) and injected it
 * into the request it sent — the wire is right. The log is empty because WebFlux never opens a
 * thread-scoped span: the observation lives in the Reactor context, and the Reactor thread that
 * writes the line has nothing in its MDC to print. {@code Tracer.currentSpan()} is null on this
 * thread for the same reason, which is worth knowing before writing any other code here.
 *
 * <p><b>So the ids are BORROWED, not invented.</b> Spring puts the exchange's
 * {@link ServerRequestObservationContext} into the exchange attributes
 * ({@code HttpWebHandlerAdapter#handle}), and the tracing handler stores the span it started on that
 * context. This class reads THAT span — the same one the wire carries — and puts its ids into the
 * MDC for exactly the duration of one log call, then restores whatever was there. A class that
 * minted an id, or copied one out of a header, would prove nothing; this one proves the edge's own
 * span ids reach its own log.
 *
 * <p><b>Two lines, not one.</b> The received line is written before the call continues; the answered
 * line carries the status and the elapsed time, which is what an access log is for. On the answered
 * line the observation context may already be gone — an empty id there is this service saying it no
 * longer holds the context, not a bug. The proof reads the FIRST line for the id.
 *
 * <p><b>Order.</b> {@link Ordered#HIGHEST_PRECEDENCE}: this must be the outermost gateway filter, or
 * a filter that short-circuits (the fallback handler, a rate limiter) answers a request this log
 * never saw.
 *
 * <p>The same class exists in {@code nexus-api} and {@code java-domain-service} as a servlet filter,
 * where it does NOT fetch anything: there the scope is real and the pattern already carries the ids.
 * Three copies and not one shared module — three independently deployable services with three
 * separate Maven builds, and a shared jar between them would be a fourth thing to version.
 */
@Component
public class HopLogFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(HopLogFilter.class);

    /** The keys Spring Boot's `logging.pattern.correlation` reads (`%X{traceId:-}`). */
    private static final String TRACE_KEY = "traceId";

    private static final String SPAN_KEY = "spanId";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String method = request.getMethod().name();
        String path = request.getPath().value();
        long began = System.nanoTime();
        announce(exchange, "hop gateway received " + method + " " + path);
        return chain.filter(exchange).doFinally(ignored -> announce(
                exchange,
                "hop gateway answered " + method + " " + path
                        + " -> " + exchange.getResponse().getStatusCode()
                        + " in " + ((System.nanoTime() - began) / 1_000_000) + " ms"));
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    /**
     * Write one line with this exchange's span ids in the correlation segment.
     *
     * <p>The MDC is restored to what it was, not cleared: the borrow must not outlive the call, or a
     * later line on this thread would claim an id that is not its own.
     */
    private void announce(ServerWebExchange exchange, String message) {
        Span span = spanOf(exchange);
        if (span == null) {
            log.info(message);
            return;
        }
        String previousTrace = MDC.get(TRACE_KEY);
        String previousSpan = MDC.get(SPAN_KEY);
        MDC.put(TRACE_KEY, span.context().traceId());
        MDC.put(SPAN_KEY, span.context().spanId());
        try {
            log.info(message);
        } finally {
            restore(TRACE_KEY, previousTrace);
            restore(SPAN_KEY, previousSpan);
        }
    }

    /**
     * The span the server observation started for this exchange, or null when it has no tracing.
     *
     * <p>The span is not stored under {@code Span.class}: the tracing handler keeps a
     * {@link TracingObservationHandler.TracingContext} on the observation's context and the span
     * lives in it (measured by reading the class: {@code getTracingContext} does
     * {@code context.getOrDefault(TracingContext.class, …)}). Asking for {@code Span.class} returns
     * null and the line prints empty ids, which is exactly how the first version of this class
     * failed.
     */
    private static Span spanOf(ServerWebExchange exchange) {
        ServerRequestObservationContext context =
                ServerRequestObservationContext.findCurrent(exchange.getAttributes()).orElse(null);
        if (context == null) {
            return null;
        }
        TracingObservationHandler.TracingContext tracing =
                context.get(TracingObservationHandler.TracingContext.class);
        return (tracing == null) ? null : tracing.getSpan();
    }

    private static void restore(String key, String previous) {
        if (previous == null) {
            MDC.remove(key);
        } else {
            MDC.put(key, previous);
        }
    }
}
