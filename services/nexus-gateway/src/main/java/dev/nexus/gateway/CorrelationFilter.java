package dev.nexus.gateway;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * A correlation id on every request, so a call the Studio makes can be followed across the gateway and the
 * backends (SC-14).
 *
 * <p>A microservice call is one logical request spread over the door and one or more backends; without a
 * shared id, a failure the backend logs and a 503 the Studio sees cannot be tied together. This filter gives
 * every request an {@code X-Request-Id}: the caller's own id is honoured (a Studio that already has one
 * propagates it), and a caller that does not get a generated UUID. The id is stamped on the request the
 * backend receives and echoed on the response the caller gets back, so either side can quote it.
 *
 * <p>Provider-free: the id is a UUID this door mints; there is no tracing vendor, no sampler, no outbound
 * call. The contract with the backends is only the header name, which {@code nexus-api} reads to label its
 * own logs — exactly the kind of cross-end message §60 says must live in {@code packages/schemas}, but a
 * header name is a string both sides already agree on, so this filter sets it and the backends read it.
 *
 * <p>Runs AFTER auth (+5) and the rate limiter (+10) and BEFORE routing: a request that is refused never
 * needs a correlation id, and an id generated for a refused call would be noise in the backend's logs.
 */
final class CorrelationFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(CorrelationFilter.class);

    /** After auth (+5) and rate limit (+10), before routing. */
    static final int ORDER = Ordered.HIGHEST_PRECEDENCE + 20;

    static final String REQUEST_ID_HEADER = "X-Request-Id";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String incoming = exchange.getRequest().getHeaders().getFirst(REQUEST_ID_HEADER);
        String requestId =
                (incoming != null && !incoming.isBlank()) ? incoming.trim() : UUID.randomUUID().toString();

        ServerWebExchange mutated = exchange.mutate()
                .request(exchange.getRequest().mutate().header(REQUEST_ID_HEADER, requestId).build())
                .build();
        // Echo on the response so the caller can quote the very id the backend saw.
        mutated.getResponse().getHeaders().set(REQUEST_ID_HEADER, requestId);

        if (log.isTraceEnabled()) {
            log.trace("gateway correlation: {} {} -> {}", requestId, exchange.getRequest().getMethod(),
                    exchange.getRequest().getURI().getRawPath());
        }
        return chain.filter(mutated);
    }

    @Override
    public int getOrder() {
        return ORDER;
    }

    /** Exposed for tests that assert on the response header name without re-declaring the literal. */
    static String requestIdHeader() {
        return REQUEST_ID_HEADER;
    }

    /** Whether a value is a plausible id — used by tests, kept here so the rule lives with the filter. */
    static boolean isValidId(String value) {
        return value != null && !value.isBlank() && value.length() <= 256;
    }

    /** Helper so tests can build the header map the same way the filter does. */
    static HttpHeaders withRequestId(HttpHeaders headers, String id) {
        HttpHeaders copy = new HttpHeaders();
        copy.putAll(headers);
        copy.set(REQUEST_ID_HEADER, id);
        return copy;
    }
}
