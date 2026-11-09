package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

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
                new RedisRateLimitBackend(redisReturning(1L), 100, 200, "nexus:gateway:rate:");

        assertThat(backend.tryAcquire("10.0.0.7").block()).isTrue();
    }

    @Test
    void aScriptVerdictOfZeroRefusesTheRequest() {
        RedisRateLimitBackend backend =
                new RedisRateLimitBackend(redisReturning(0L), 100, 200, "nexus:gateway:rate:");

        assertThat(backend.tryAcquire("10.0.0.7").block()).isFalse();
    }

    /** The bucket key is the prefix plus the client; the script gets burst, rate and TTL as strings. */
    @Test
    void theKeyAndTheArgumentsAreWhatTheScriptExpects() {
        ReactiveStringRedisTemplate template = redisReturning(1L);
        RedisRateLimitBackend backend = new RedisRateLimitBackend(template, 2, 5, "test:rate");

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
}
