package dev.nexus.gateway;

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

    RedisRateLimitBackend(
            ReactiveStringRedisTemplate redis, double refillPerSecond, int burst, String keyPrefix) {
        this.redis = redis;
        this.refillPerSecond = Math.max(0, refillPerSecond);
        this.burst = Math.max(1, burst);
        this.keyPrefix = keyPrefix.endsWith(":") ? keyPrefix : keyPrefix + ":";
        this.ttlMillis = ttlMillis(this.burst, this.refillPerSecond);
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
                .map(result -> result != null && result == 1L);
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
