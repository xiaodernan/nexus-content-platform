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
 * §SC-31 — the hop ANNOUNCES the request it served, so the trace id it was given can be read at 03:00.
 *
 * <p><b>Why this class exists at all.</b> The gateway mints a W3C {@code traceparent} (see
 * {@code TraceContextFilter}) and propagates it, but a header alone proves nothing about the id being
 * readable anywhere a human looks. The correlation id in the log pattern is only useful when the line
 * that carries it is actually written: gateway answered a request, recorded metrics, and left nothing
 * in its log. An operator holding a slow trace id found it at the backends and nowhere at this door.
 *
 * <p><b>Why this class has to fetch the ids itself.</b> On servlet services the server observation opens
 * a scope on the request thread, the scope writes the MDC, the pattern prints it. WebFlux never opens a
 * thread-scoped span: the observation lives in the Reactor context and the Reactor thread that writes
 * the line has nothing in its MDC. Measured at java-gateway (2026-11-11): the wire carried
 * {@code traceparent} correctly while the log printed {@code [nexus-gateway,,]}.
 *
 * <p><b>Why the ids are BORROWED, not invented.</b> Spring puts the exchange's
 * {@link ServerRequestObservationContext} into the exchange attributes, and the tracing handler stores
 * the span it started on that context. This class reads THAT span and puts its ids into the MDC for
 * exactly the duration of one log line, then restores whatever was there. A class that minted an id, or
 * copied one out of a header, would prove nothing.
 *
 * <p><b>Two lines, not one.</b> The received line is written before the call continues; the answered line
 * carries the status and the elapsed time. On the answered line an empty id is this door saying it no
 * longer holds the context — that is honest, not a bug. The first line is what the proof reads.
 *
 * <p><b>Order.</b> {@link Ordered#HIGHEST_PRECEDENCE}: this must be the outermost gateway filter, or a
 * filter that short-circuits (fallback handler, rate limiter) answers a request this log never saw.
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
     * {@link TracingObservationHandler.TracingContext} on the observation's context and the span lives in it.
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
