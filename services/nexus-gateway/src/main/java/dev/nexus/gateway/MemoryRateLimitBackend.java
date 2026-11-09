package dev.nexus.gateway;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import reactor.core.publisher.Mono;

/**
 * A per-client token bucket held in this process.
 *
 * <p>Why Caffeine: the map of clients is attacker-controlled, so it needs a ceiling and an idle expiry. A
 * {@code ConcurrentHashMap} keyed by client address is an unbounded allocation growth bug wearing a hat.
 *
 * <p>The bound that is stated rather than hidden: a bucket is per INSTANCE, so two gateways allow twice the
 * configured rate. The shared variant is {@link RedisRateLimitBackend}, selected by configuration; this one
 * stays the default so the door needs no second process.
 */
final class MemoryRateLimitBackend implements RateLimitBackend {

    private final double refillPerSecond;
    private final int burst;
    private final Cache<String, Bucket> buckets;

    MemoryRateLimitBackend(double refillPerSecond, int burst, int maxClients) {
        this.refillPerSecond = Math.max(0, refillPerSecond);
        this.burst = Math.max(1, burst);
        this.buckets = Caffeine.newBuilder()
                .maximumSize(Math.max(1, maxClients))
                .expireAfterAccess(Duration.ofMinutes(10))
                .build();
    }

    @Override
    public Mono<Boolean> tryAcquire(String clientKey) {
        Bucket bucket = buckets.get(clientKey, (ignored) -> new Bucket(burst, refillPerSecond));
        return Mono.just(bucket.tryAcquire());
    }

    @Override
    public String describe() {
        return "memory";
    }

    /** A single bucket. Synchronized because two requests for one client can arrive on different event loops. */
    private static final class Bucket {

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
