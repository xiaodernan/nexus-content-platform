package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import org.junit.jupiter.api.Test;

/**
 * §SC-51 — the DEFAULT rate-limit backend, graded without sleeping or a Spring context.
 *
 * <p>Before this file the memory bucket's refill math was untestable: it read {@code System.nanoTime()}
 * directly, so the only way to watch a token come back was to sleep, and nobody did. The Redis variant has
 * had mock-graded tests all along; the default one did not. The 4-arg constructor injects a nanosecond clock
 * so every branch — the nanos→seconds conversion, the cap, the empty bucket, a backwards clock — is nailed
 * exactly. The 3-arg production constructor still uses the monotonic wall clock, so nothing about runtime
 * behaviour changes here.
 *
 * <p>Every assertion is about an observable verdict, not about a private field. A wrong divisor, a missing
 * {@code Math.min}, a dropped {@code synchronized}: each turns at least one of these red.
 */
class MemoryRateLimitBackendTest {

    /** A hand-cranked monotonic clock, in nanoseconds, shared by every bucket the backend creates. */
    private static final class Clock implements LongSupplier {
        private final AtomicLong nanos = new AtomicLong(1_000_000_000L);

        @Override
        public long getAsLong() {
            return nanos.get();
        }

        void advanceMillis(long ms) {
            nanos.addAndGet(ms * 1_000_000L);
        }

        void jumpTo(long value) {
            nanos.set(value);
        }
    }

    private static boolean allowed(MemoryRateLimitBackend backend, String client) {
        return Boolean.TRUE.equals(backend.tryAcquire(client).block());
    }

    @Test
    void aFullBucketAllowsExactlyBurstRequestsThenRefuses() {
        Clock clock = new Clock();
        MemoryRateLimitBackend backend = new MemoryRateLimitBackend(0, 2, 16, clock);

        assertThat(allowed(backend, "c")).isTrue();
        assertThat(allowed(backend, "c")).isTrue();
        // A third with no elapsed time and no refill must be refused — the cap is the burst, not infinity.
        assertThat(allowed(backend, "c")).isFalse();
    }

    @Test
    void elapsedTimeRefillsAtTheStatedRate() {
        Clock clock = new Clock();
        // 10 tokens/second = 1 token every 100 ms. The nanos→seconds conversion is under test here: a
        // divisor typo (1_000_000 instead of 1_000_000_000) would refill 1000x too fast and fail this.
        MemoryRateLimitBackend backend = new MemoryRateLimitBackend(10, 2, 16, clock);

        assertThat(allowed(backend, "c")).isTrue();
        assertThat(allowed(backend, "c")).isTrue();
        assertThat(allowed(backend, "c")).isFalse(); // empty

        clock.advanceMillis(100);
        assertThat(allowed(backend, "c")).isTrue(); // exactly one token came back
        assertThat(allowed(backend, "c")).isFalse(); // and no more
    }

    @Test
    void aLongWaitRefillsNoMoreThanTheCapacity() {
        Clock clock = new Clock();
        MemoryRateLimitBackend backend = new MemoryRateLimitBackend(10, 3, 16, clock);

        assertThat(allowed(backend, "c")).isTrue();
        assertThat(allowed(backend, "c")).isTrue();
        assertThat(allowed(backend, "c")).isTrue(); // drained
        assertThat(allowed(backend, "c")).isFalse();

        // 10 seconds at 10/s would be 100 tokens — but the bucket holds 3, never 100.
        clock.advanceMillis(10_000);
        assertThat(allowed(backend, "c")).isTrue();
        assertThat(allowed(backend, "c")).isTrue();
        assertThat(allowed(backend, "c")).isTrue();
        assertThat(allowed(backend, "c")).isFalse(); // Math.min(capacity, …) held the line
    }

    @Test
    void lessThanOneTokenOfElapsedTimeStillRefuses() {
        Clock clock = new Clock();
        MemoryRateLimitBackend backend = new MemoryRateLimitBackend(10, 1, 16, clock);

        assertThat(allowed(backend, "c")).isTrue();
        assertThat(allowed(backend, "c")).isFalse();
        clock.advanceMillis(99); // 0.99 tokens — not yet one
        assertThat(allowed(backend, "c")).isFalse();
        clock.advanceMillis(1); // the 100th ms completes one token
        assertThat(allowed(backend, "c")).isTrue();
    }

    @Test
    void aClockThatGoesBackwardsNeitherMintsNorClawsBackTokens() {
        Clock clock = new Clock();
        MemoryRateLimitBackend backend = new MemoryRateLimitBackend(10, 2, 16, clock);

        assertThat(allowed(backend, "c")).isTrue();
        assertThat(allowed(backend, "c")).isTrue(); // drained
        clock.jumpTo(1L); // a backwards step (non-monotonic source) must not subtract tokens
        assertThat(allowed(backend, "c")).isFalse(); // still empty, not negative, not topped up
        clock.jumpTo(1_000_000_000L); // back to the original instant: no net elapsed to refill
        assertThat(allowed(backend, "c")).isFalse();
        clock.advanceMillis(100);
        assertThat(allowed(backend, "c")).isTrue(); // normal refill resumes afterwards
    }

    @Test
    void eachClientHasItsOwnBucket() {
        Clock clock = new Clock();
        MemoryRateLimitBackend backend = new MemoryRateLimitBackend(0, 1, 16, clock);

        assertThat(allowed(backend, "a")).isTrue();
        assertThat(allowed(backend, "a")).isFalse(); // a is drained
        assertThat(allowed(backend, "b")).isTrue(); // b has its own full bucket
    }

    @Test
    void aZeroRefillRateNeverReturnsTokens() {
        Clock clock = new Clock();
        MemoryRateLimitBackend backend = new MemoryRateLimitBackend(0, 1, 16, clock);

        assertThat(allowed(backend, "c")).isTrue();
        clock.advanceMillis(60_000);
        assertThat(allowed(backend, "c")).isFalse(); // rate 0 is a pure burst ceiling, as configured
    }

    @Test
    void concurrentRequestsForOneClientNeverExceedTheBurst() throws Exception {
        Clock clock = new Clock();
        int burst = 5;
        int contenders = 40;
        MemoryRateLimitBackend backend = new MemoryRateLimitBackend(0, burst, 16, clock);
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Callable<Boolean>> calls = new ArrayList<>();
            for (int i = 0; i < contenders; i++) {
                calls.add(() -> allowed(backend, "same"));
            }
            AtomicInteger passed = new AtomicInteger();
            for (Future<Boolean> result : pool.invokeAll(calls)) {
                if (result.get()) passed.incrementAndGet();
            }
            // Without the synchronized guard, a torn read-modify-write of `tokens` lets more than `burst`
            // requests through. This is the graded proof that dropping the lock (or trusting the removed
            // AtomicLong to protect a non-atomic double) turns red.
            assertThat(passed.get()).isEqualTo(burst);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void describeNamesTheBackendTheOperatorIsActuallyGetting() {
        MemoryRateLimitBackend backend = new MemoryRateLimitBackend(100, 200, 16, new Clock());
        assertThat(backend.describe()).isEqualTo("memory");
    }

    @Test
    void aTinyClientCeilingStillAnswersEveryKeyWithoutThrowing() {
        Clock clock = new Clock();
        // maxClients is a Caffeine bound on distinct keys, not a refusal. Eviction may drop a bucket, but
        // the door must keep answering (a re-created bucket simply starts full — a stated, honest trade).
        MemoryRateLimitBackend backend = new MemoryRateLimitBackend(0, 1, 1, clock);
        for (int i = 0; i < 200; i++) {
            assertThat(allowed(backend, "client-" + i)).isTrue();
        }
    }
}
