package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import reactor.core.publisher.Flux;

/**
 * The shared backend, graded without a Redis server: the template is a mock, so these tests are about what
 * the backend asks Redis to do (key, arguments, script verdict) and not about Redis itself. The live proof
 * that two gateway instances share one counter is a separate, real-Redis run.
 */
class RedisRateLimitBackendTest {

    private static final Duration BOUND = Duration.ofMillis(500);

    private static ReactiveStringRedisTemplate redisReturning(long verdict) {
        ReactiveStringRedisTemplate template = mock(ReactiveStringRedisTemplate.class);
        doReturn(Flux.just(verdict))
                .when(template)
                .execute(any(), anyList(), anyList());
        return template;
    }

    @Test
    void aScriptVerdictOfOneAllowsTheRequest() {
        RedisRateLimitBackend backend =
                new RedisRateLimitBackend(redisReturning(1L), 100, 200, "nexus:gateway:rate:", BOUND);

        assertThat(backend.tryAcquire("10.0.0.7").block()).isTrue();
    }

    @Test
    void aScriptVerdictOfZeroRefusesTheRequest() {
        RedisRateLimitBackend backend =
                new RedisRateLimitBackend(redisReturning(0L), 100, 200, "nexus:gateway:rate:", BOUND);

        assertThat(backend.tryAcquire("10.0.0.7").block()).isFalse();
    }

    /** The bucket key is the prefix plus the client; the script gets burst, rate and TTL as strings. */
    @Test
    void theKeyAndTheArgumentsAreWhatTheScriptExpects() {
        ReactiveStringRedisTemplate template = redisReturning(1L);
        RedisRateLimitBackend backend = new RedisRateLimitBackend(template, 2, 5, "test:rate", BOUND);

        backend.tryAcquire("10.0.0.7").block();

        // Prefix without a trailing colon is normalised, never concatenated raw into another key.
        verify(template)
                .execute(any(), eq(List.of("test:rate:10.0.0.7")), eq(List.of("5", "2.0", "3500")));
    }

    @Test
    void ttlIsTheTimeAFullBucketNeedsToRefillPlusOneSecond() {
        // 5 tokens at 2 tokens/second = 2.5 s, plus a 1 s margin.
        assertThat(RedisRateLimitBackend.ttlMillis(5, 2)).isEqualTo(3500L);
        // 200 tokens at 100/s = 2 s.
        assertThat(RedisRateLimitBackend.ttlMillis(200, 100)).isEqualTo(3000L);
    }

    /** Rate 0 never refills; the key still must expire rather than live forever. */
    @Test
    void aZeroRateGetsACoarseCeilingInsteadOfAnImmortalKey() {
        assertThat(RedisRateLimitBackend.ttlMillis(200, 0)).isEqualTo(3_600_000L);
    }

    /**
     * SC-36 — the命门: fail-open only fires on an ERROR. A backend that neither emits nor errors (blackhole,
     * exhausted pool, hung DNS — all {@code Flux.never()} here) must still be turned into an error ON OUR
     * DEADLINE, not hang forever. The probe measured the pre-change code hanging until the caller's own block
     * timeout; here the backend itself must emit the terminal signal within a loose multiple of the bound.
     */
    @Test
    void aBackendThatNeverAnswersErrorsOnOurBoundNotForever() {
        ReactiveStringRedisTemplate never = mock(ReactiveStringRedisTemplate.class);
        doReturn(Flux.never()).when(never).execute(any(), anyList(), anyList());
        RedisRateLimitBackend backend = new RedisRateLimitBackend(never, 100, 200, "test:", Duration.ofMillis(120));

        long started = System.nanoTime();
        assertThatThrownBy(() -> backend.tryAcquire("10.0.0.1").block(Duration.ofSeconds(3)))
                .as("a never-answering backend must produce an error the fail-open path can consume")
                .hasCauseInstanceOf(java.util.concurrent.TimeoutException.class);
        long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
        // Loose upper bound: only catches "no self-owned bound" (would hit the 3s block timeout), and never
        // pins the exact 120ms (scheduler jitter is a machine function, not a contract).
        assertThat(elapsedMs)
                .as("the error must arrive on our deadline, not the caller's 3s escape hatch")
                .isLessThan(2_000L);
    }

    /** The bound is the deployment's knob, not a hard-coded literal — this is what the yml env var wires to. */
    @Test
    void theBoundIsTheConfiguredValueNotAHardcodedLiteral() {
        ReactiveStringRedisTemplate never = mock(ReactiveStringRedisTemplate.class);
        doReturn(Flux.never()).when(never).execute(any(), anyList(), anyList());
        RedisRateLimitBackend backend = new RedisRateLimitBackend(never, 100, 200, "test:", Duration.ofMillis(77));

        assertThat(backend.backendTimeout()).isEqualTo(Duration.ofMillis(77));
    }

    /** Fail CLOSED on configuration: a non-positive bound would disable the guarantee, so refuse to build. */
    @Test
    void aNonPositiveBoundIsRejectedAtConstruction() {
        ReactiveStringRedisTemplate template = redisReturning(1L);
        assertThatThrownBy(() -> new RedisRateLimitBackend(template, 100, 200, "test:", Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("positive");
        assertThatThrownBy(() -> new RedisRateLimitBackend(template, 100, 200, "test:", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("positive");
    }
}
