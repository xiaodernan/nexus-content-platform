package dev.nexus.gateway;

import java.time.Duration;
import java.util.List;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import reactor.core.publisher.Mono;

/**
 * One token bucket per client in Redis, shared by every gateway instance pointing at the same server.
 *
 * <p>The count is what the memory backend cannot give: two gateways with a local bucket allow twice the
 * configured rate, and a client that alternates between them is effectively unlimited. Here every instance
 * decrements the same bucket, so the configured rate is the rate of the CLUSTER.
 *
 * <p>Why Lua: read-modify-write across two keys is not atomic in a pipeline, and two instances racing a
 * GET/SET pair would hand out the same token twice. The script below is one atomic unit on the Redis server.
 *
 * <p>Why {@code TIME} from the server and not the JVM clock: instances are separate machines with separate
 * clocks. Refilling from a local clock makes a client's allowance depend on which instance it reaches, which
 * is exactly the problem this backend exists to solve.
 *
 * <p>Why an expiry: the map of clients belongs to the caller, so keys must disappear on their own. The TTL is
 * the time a full bucket takes to refill (plus a margin), after which the key's state is indistinguishable
 * from a fresh one; an idle client costs Redis nothing instead of leaking one key per address forever.
 *
 * <p><b>Why a self-owned timeout (SC-36).</b> Fail-open lives in {@link RateLimitFilter#onErrorResume}, which
 * can only fire if this backend eventually produces an ERROR. Lettuce has its own connect/command timeouts,
 * but those are a CLIENT detail this class does not control: a blackholed Redis, an exhausted connection pool
 * waiting for a slot, or a hung DNS lookup can all leave {@code redis.execute(...)} neither emitting nor
 * erroring. In that shape, {@code onErrorResume} never fires and the request hangs at the limiter — a degraded
 * limiter welding the door shut, the exact failure fail-open exists to prevent. So the bound lives HERE, in the
 * gateway's own decision: {@link #tryAcquire} applies {@code timeout(backendTimeout)}, turning "no answer" into
 * an error on a deadline the deployment owns, independent of how Lettuce happens to be configured. The error
 * then flows into the existing fail-open path unchanged.
 */
final class RedisRateLimitBackend implements RateLimitBackend {

    /**
     * KEYS[1] = bucket key; ARGV[1] = capacity (burst); ARGV[2] = refill per second; ARGV[3] = TTL millis.
     * Returns 1 when a token was taken, 0 when the bucket is empty. Uses Redis's own clock so every gateway
     * instance refills from the same timeline.
     */
    static final String LUA = """
            local clock = redis.call('TIME')
            local now = tonumber(clock[1]) + tonumber(clock[2]) / 1000000
            local capacity = tonumber(ARGV[1])
            local refill = tonumber(ARGV[2])
            local ttl = tonumber(ARGV[3])

            local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
            local tokens = tonumber(state[1])
            local stamp = tonumber(state[2])
            if tokens == nil then
              tokens = capacity
              stamp = now
            end

            local elapsed = now - stamp
            if elapsed < 0 then
              elapsed = 0
            end
            tokens = math.min(capacity, tokens + elapsed * refill)

            local allowed = 0
            if tokens >= 1 then
              tokens = tokens - 1
              allowed = 1
            end

            redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
            redis.call('PEXPIRE', KEYS[1], ttl)
            return allowed
            """;

    private static final RedisScript<Long> SCRIPT = new DefaultRedisScript<>(LUA, Long.class);

    private final ReactiveStringRedisTemplate redis;
    private final double refillPerSecond;
    private final int burst;
    private final long ttlMillis;
    private final String keyPrefix;
    private final Duration backendTimeout;

    RedisRateLimitBackend(
            ReactiveStringRedisTemplate redis,
            double refillPerSecond,
            int burst,
            String keyPrefix,
            Duration backendTimeout) {
        // Fail-closed on configuration, fail-open on runtime failure. A non-positive bound would either
        // throw on every request (zero) or disable the very guarantee this field exists to provide (negative
        // is rejected by Reactor too); refusing to start is clearer than a limiter that silently never waits.
        if (backendTimeout == null || backendTimeout.isZero() || backendTimeout.isNegative()) {
            throw new IllegalArgumentException("backendTimeout must be a positive duration, got " + backendTimeout);
        }
        this.redis = redis;
        this.refillPerSecond = Math.max(0, refillPerSecond);
        this.burst = Math.max(1, burst);
        this.keyPrefix = keyPrefix.endsWith(":") ? keyPrefix : keyPrefix + ":";
        this.ttlMillis = ttlMillis(this.burst, this.refillPerSecond);
        this.backendTimeout = backendTimeout;
    }

    @Override
    public Mono<Boolean> tryAcquire(String clientKey) {
        return redis.execute(
                        SCRIPT,
                        List.of(keyPrefix + clientKey),
                        List.of(
                                String.valueOf(burst),
                                String.valueOf(refillPerSecond),
                                String.valueOf(ttlMillis)))
                .next()
                .map(result -> result != null && result == 1L)
                // SC-36: the gateway's own deadline. If Redis never answers, this emits a TimeoutException
                // on the bound, which RateLimitFilter's onErrorResume turns into fail-open. Without it, a
                // never-answering backend hangs the request forever — see the class comment.
                .timeout(backendTimeout);
    }

    Duration backendTimeout() {
        return backendTimeout;
    }

    @Override
    public String describe() {
        return "redis";
    }

    /**
     * How long a bucket key lives. A rate of zero never refills, so the key gets a coarse ceiling instead of an
     * infinite one; otherwise the TTL is the time to refill a full bucket plus a second of margin.
     */
    static long ttlMillis(int burst, double refillPerSecond) {
        if (refillPerSecond <= 0) {
            return 3_600_000L;
        }
        return Math.max(1_000L, (long) Math.ceil(burst / refillPerSecond * 1000.0) + 1_000L);
    }

    String keyPrefix() {
        return keyPrefix;
    }
}
