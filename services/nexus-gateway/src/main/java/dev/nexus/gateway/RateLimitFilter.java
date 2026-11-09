package dev.nexus.gateway;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * A per-client token bucket, in front of every route.
 *
 * <p>Why this and not {@code RequestRateLimiter} + Redis: that filter makes Redis a hard dependency of EVERY
 * request through the door — when Redis is down, the door is down. This build's gateway must answer honestly
 * without a second process, and the bound is stated instead of hidden: a bucket is per INSTANCE, so two
 * gateways allow twice the configured rate. Shared limiting is a Redis slice, and it is owed.
 *
 * <p>Why Caffeine: the map of clients is attacker-controlled, so it needs a ceiling and an idle expiry. A
 * {@code ConcurrentHashMap} keyed by client address is an unbounded allocation growth bug wearing a hat.
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

    private final boolean enabled;
    private final double refillPerSecond;
    private final int burst;
    private final Cache<String, Bucket> buckets;

    RateLimitFilter(boolean enabled, double refillPerSecond, int burst, int maxClients) {
        this.enabled = enabled;
        this.refillPerSecond = Math.max(0, refillPerSecond);
        this.burst = Math.max(1, burst);
        this.buckets = Caffeine.newBuilder()
                .maximumSize(Math.max(1, maxClients))
                .expireAfterAccess(Duration.ofMinutes(10))
                .build();
        // A reading at startup, because "the limiter is on" is otherwise indistinguishable from "the limiter
        // was never wired" until somebody measures a 429 by hand.
        log.info(
                "gateway rate limit: enabled={} ratePerSecond={} burst={} maxClients={}",
                enabled,
                this.refillPerSecond,
                this.burst,
                maxClients);
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        if (!enabled) {
            return chain.filter(exchange);
        }
        String key = clientKey(exchange);
        Bucket bucket = buckets.get(key, (ignored) -> new Bucket(burst, refillPerSecond));
        if (bucket.tryAcquire()) {
            return chain.filter(exchange);
        }
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        // One second is the honest retry hint for a bucket that refills continuously: by then at least
        // floor(refillPerSecond) tokens exist (provided the rate is at least 1/s).
        response.getHeaders().set("Retry-After", "1");
        byte[] body = "{\"error\":\"rate_limited\",\"note\":\"per-client bucket on this gateway instance; Retry-After is seconds\"}"
                .getBytes(StandardCharsets.UTF_8);
        DataBuffer buffer = response.bufferFactory().wrap(body);
        return response.writeWith(Mono.just(buffer));
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

    /** A single bucket. Synchronized because two requests for one client can arrive on different event loops. */
    static final class Bucket {

        private final double capacity;
        private final double refillPerSecond;
        private final AtomicLong lastRefillNanos = new AtomicLong(System.nanoTime());
        private double tokens;

        Bucket(double capacity, double refillPerSecond) {
            this.capacity = capacity;
            this.refillPerSecond = refillPerSecond;
            this.tokens = capacity;
        }

        synchronized boolean tryAcquire() {
            refill();
            if (tokens >= 1.0) {
                tokens -= 1.0;
                return true;
            }
            return false;
        }

        private void refill() {
            long now = System.nanoTime();
            long previous = lastRefillNanos.getAndSet(now);
            double elapsedSeconds = (now - previous) / 1_000_000_000.0;
            if (elapsedSeconds > 0) {
                tokens = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);
            }
        }
    }
}
