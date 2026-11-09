package dev.nexus.gateway;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * The door's per-client rate check, in front of every route.
 *
 * <p>Where the counter lives is a choice, not an accident (SC-12):
 *
 * <ul>
 *   <li>{@code memory} (default) — {@link MemoryRateLimitBackend}, a token bucket per instance. The door
 *       answers without a second process; two gateways allow twice the configured rate.
 *   <li>{@code redis} — {@link RedisRateLimitBackend}, one atomic bucket shared by every instance. The
 *       configured rate becomes the rate of the cluster.
 * </ul>
 *
 * <p><b>Fail-open, deliberately.</b> A rate limit is a bound, not an authentication decision. If the shared
 * backend cannot answer — Redis down, network blackholed, command timeout — refusing every request would turn
 * a degraded limiter into a full outage: the door would be closed by the component whose only job is to slow
 * traffic down. The failure is logged (throttled, so an outage cannot flood the log) and the request proceeds
 * UNTHROTTLED. The honest statement during that window is "the gateway is up and unthrottled", and an
 * operator reading the log learns exactly that.
 *
 * <p>The client key is {@code X-Forwarded-For}'s first entry when present, else the socket's peer address.
 * That is only as trustworthy as what sits in front of this gateway: a client that can reach it directly can
 * claim any address and get its own bucket. Behind a trusted proxy the header is the client; without one it
 * is a courtesy. The alternative — keying by peer address only — would put every client behind a load
 * balancer in ONE bucket, which is worse.
 */
final class RateLimitFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    /** Ordered before routing and before {@code clientAddressHeaders()}, so a refused call costs nothing. */
    static final int ORDER = Ordered.HIGHEST_PRECEDENCE + 10;

    private static final long BACKEND_WARNING_INTERVAL_MILLIS = 10_000L;

    private final boolean enabled;
    private final RateLimitBackend backend;
    private final AtomicLong lastBackendWarningAt = new AtomicLong(0);

    RateLimitFilter(boolean enabled, RateLimitBackend backend) {
        this.enabled = enabled;
        this.backend = backend;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        if (!enabled) {
            return chain.filter(exchange);
        }
        String key = clientKey(exchange);
        return backend.tryAcquire(key)
                .doOnError(this::warnBackendFailure)
                // Fail-open: see the class comment. This is why the limiter is not a hard Redis dependency.
                .onErrorResume(error -> Mono.just(true))
                // A backend that completes empty has no reason to refuse; treating "no answer" as "refused"
                // would block traffic on a backend that is merely confused.
                .defaultIfEmpty(true)
                .flatMap(allowed -> Boolean.TRUE.equals(allowed) ? chain.filter(exchange) : refuse(exchange));
    }

    private Mono<Void> refuse(ServerWebExchange exchange) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        // One second is the honest retry hint for a bucket that refills continuously: by then at least
        // floor(refillPerSecond) tokens exist (provided the rate is at least 1/s).
        response.getHeaders().set("Retry-After", "1");
        byte[] body = "{\"error\":\"rate_limited\",\"note\":\"per-client bucket shared by the gateway deployment; Retry-After is seconds\"}"
                .getBytes(StandardCharsets.UTF_8);
        DataBuffer buffer = response.bufferFactory().wrap(body);
        return response.writeWith(Mono.just(buffer));
    }

    private void warnBackendFailure(Throwable error) {
        long now = System.currentTimeMillis();
        long last = lastBackendWarningAt.get();
        if (now - last >= BACKEND_WARNING_INTERVAL_MILLIS && lastBackendWarningAt.compareAndSet(last, now)) {
            log.warn(
                    "gateway rate limit backend '{}' failed; request allowed unthrottled (fail-open): {}",
                    backend.describe(),
                    error.toString());
        }
    }

    @Override
    public int getOrder() {
        return ORDER;
    }

    static String clientKey(ServerWebExchange exchange) {
        String forwardedFor = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            int comma = forwardedFor.indexOf(',');
            String first = comma < 0 ? forwardedFor : forwardedFor.substring(0, comma);
            if (!first.isBlank()) {
                return first.trim();
            }
        }
        var remote = exchange.getRequest().getRemoteAddress();
        return remote == null || remote.getAddress() == null
                ? "unknown"
                : remote.getAddress().getHostAddress();
    }
}
