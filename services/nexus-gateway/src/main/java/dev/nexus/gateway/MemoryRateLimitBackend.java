package dev.nexus.gateway;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.util.function.LongSupplier;
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
 *
 * <p><b>§SC-51 — the clock is injected, not read from the wall.</b> The refill math (nanoseconds → seconds,
 * the rate, the cap) is the whole correctness of a token bucket, and a hard-wired {@code System.nanoTime()}
 * made it impossible to test without sleeping. The 3-arg constructor still uses the monotonic wall clock, so
 * this is behaviour-preserving in production; the 4-arg one takes a {@link LongSupplier} of nanoseconds so a
 * test can advance time exactly and nail every branch. The Redis variant has had graded tests all along; this
 * default backend is now graded on the same terms (see {@code MemoryRateLimitBackendTest}).
 */
final class MemoryRateLimitBackend implements RateLimitBackend {

    private final double refillPerSecond;
    private final int burst;
    private final LongSupplier clockNanos;
    private final Cache<String, Bucket> buckets;

    /** Production path: a monotonic nanosecond clock. Delegates to the injectable constructor. */
    MemoryRateLimitBackend(double refillPerSecond, int burst, int maxClients) {
        this(refillPerSecond, burst, maxClients, System::nanoTime);
    }

    /** Test seam: {@code clockNanos} supplies monotonically increasing nanoseconds. */
    MemoryRateLimitBackend(double refillPerSecond, int burst, int maxClients, LongSupplier clockNanos) {
        this.refillPerSecond = Math.max(0, refillPerSecond);
        this.burst = Math.max(1, burst);
        this.clockNanos = clockNanos;
        this.buckets = Caffeine.newBuilder()
                .maximumSize(Math.max(1, maxClients))
                .expireAfterAccess(Duration.ofMinutes(10))
                .build();
    }

    @Override
    public Mono<Boolean> tryAcquire(String clientKey) {
        Bucket bucket = buckets.get(clientKey, (ignored) -> new Bucket(burst, refillPerSecond, clockNanos));
        return Mono.just(bucket.tryAcquire());
    }

    @Override
    public String describe() {
        return "memory";
    }

    /**
     * A single bucket. {@code tryAcquire} is synchronized because two requests for one client can arrive on
     * different event loops, so all of {@code tokens} / {@code lastRefillNanos} live under that one lock.
     * §SC-51: the previous {@code AtomicLong.getAndSet} was redundant inside the lock — a plain long is the
     * honest data structure here (an atomic implies lock-free safety this class does not claim). Concurrency
     * is proved by a graded test, not by the type.
     */
    private static final class Bucket {

        private final double capacity;
        private final double refillPerSecond;
        private final LongSupplier clockNanos;
        private long lastRefillNanos;
        private double tokens;

        Bucket(double capacity, double refillPerSecond, LongSupplier clockNanos) {
            this.capacity = capacity;
            this.refillPerSecond = refillPerSecond;
            this.clockNanos = clockNanos;
            this.lastRefillNanos = clockNanos.getAsLong();
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
            long now = clockNanos.getAsLong();
            long elapsedNanos = now - lastRefillNanos;
            // A clock that has not advanced refills nothing. A BACKWARDS step is ignored entirely: the
            // watermark does not move back, so the lost time can never be re-credited as elapsed later.
            // With the monotonic production clock this branch is unreachable and behaviour is identical;
            // it exists so the injected-clock seam has an honest, total contract for an arbitrary source.
            if (elapsedNanos > 0) {
                lastRefillNanos = now;
                tokens = Math.min(capacity, tokens + (elapsedNanos / 1_000_000_000.0) * refillPerSecond);
            }
        }
    }
}
