package dev.nexus.gateway.ratelimit;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.ratelimit.RateLimiter;
import org.springframework.cloud.gateway.filter.ratelimit.RedisRateLimiter;
import reactor.core.publisher.Mono;

/**
 * v657 — the edge already admits a request it could not count. This class makes that decision
 * VISIBLE.
 *
 * <p><b>What the library does, measured rather than assumed.</b> {@code RedisRateLimiter.isAllowed}
 * fails in three ways, and none of them is a refusal:
 *
 * <ul>
 *   <li>the Lua call errors asynchronously — {@code onErrorResume} logs "Error calling rate limiter
 *       lua" and answers {@code [1, -1]}, i.e. ALLOWED with remaining {@code -1};
 *   <li>the call throws synchronously — the catch block logs "Error determining if user allowed from
 *       redis" and returns {@code new Response(true, headers(config, -1))};
 *   <li>the configuration cannot be loaded — that throw happens BEFORE the library's own try block and
 *       escapes the method entirely.
 * </ul>
 *
 * <p>So the first version of this class was wrong about the world. It wrapped the delegate in
 * {@code onErrorResume} and expected to catch a failure; measured against a port nothing listens on,
 * the request came back 200 with NO marker and the degradation counter stayed at zero — because no
 * error ever reached it. The decision to admit is right (a counter outage must not become an API
 * outage) and the silence is the defect: traffic is served unguarded and only a header value of
 * {@code -1} and an ERROR line about Lua say so.
 *
 * <p><b>What this decorator therefore does.</b> Three things, all of them about visibility:
 *
 * <ol>
 *   <li>it RECOGNISES the library's "no count" answer — {@code allowed} with {@code X-RateLimit-Remaining}
 *       of {@code -1} — and replaces that header, which is a sentinel pretending to be a count, with
 *       {@code X-Nexus-RateLimit: unavailable};
 *   <li>it counts every such request in {@code nexus.edge.rate_limit.degraded}, per route;
 *   <li>it writes ONE WARN per route per {@code warn-interval}, naming the failure.
 * </ol>
 *
 * <p>It never changes an answer that HAS a count: a real 429 stays a 429 with its own numbers, and a
 * real admission keeps the count the counter produced. Nothing here invents a token count, and
 * nothing here reimplements the bucket — the same {@link RedisRateLimiter}, the same Lua script, the
 * same three headers on the healthy path.
 *
 * <p><b>Why admit at all.</b> A rate limiter is a protection, not a permission system. Answering 429
 * when the counter is gone would be a lie about the CALLER (RFC 9110 §15.5.29) that nothing measured;
 * refusing would convert a Redis outage into an outage of the whole API. What is left is the honest
 * option, and it is only honest if it is OBSERVABLE — which is the whole of this class.
 *
 * <p><b>The throttle.</b> During an outage every request takes this path, so the line is throttled
 * while the metric is not: a counter cannot be grepped for the exception, and a log cannot be alerted
 * on. {@code lastWarnAt} holds the nanoTime of the last line per route.
 */
public final class ResilientRateLimiter implements RateLimiter<RedisRateLimiter.Config> {

    /** The header that says the edge served this request WITHOUT counting it. */
    public static final String DEGRADED_HEADER = "X-Nexus-RateLimit";

    /** Its value when the counter could not be reached. Distinct from any token count on purpose. */
    public static final String DEGRADED = "unavailable";

    /**
     * The library's "I have no count" sentinel. Read from the library rather than re-derived: the Lua
     * script answers a remaining of zero or more, and both failure paths substitute {@code -1}.
     */
    private static final String NO_COUNT = "-1";

    private static final Logger log = LoggerFactory.getLogger(ResilientRateLimiter.class);

    private final RateLimiter<RedisRateLimiter.Config> counter;

    private final Counter degraded;

    private final Duration warnInterval;

    private final LongSupplier nanos;

    private final AtomicLong lastWarnAt = new AtomicLong(Long.MIN_VALUE);

    public ResilientRateLimiter(
            RateLimiter<RedisRateLimiter.Config> counter,
            MeterRegistry meters,
            Duration warnInterval,
            LongSupplier nanos) {
        this.counter = counter;
        this.warnInterval = warnInterval;
        this.nanos = nanos;
        this.degraded = Counter.builder("nexus.edge.rate_limit.degraded")
                .description("requests the edge served WITHOUT counting them, because the rate limiter could not be reached")
                .register(meters);
    }

    @Override
    public Mono<Response> isAllowed(String routeId, String id) {
        try {
            return counter.isAllowed(routeId, id)
                    // The library's async failure path: no exception reaches here, only a response
                    // that is allowed WITH the sentinel. This is the line that was missing.
                    .map(answer -> hasNoCount(answer) ? serveUncounted(routeId, id, "the counter returned no count") : answer)
                    // A delegate that fails differently from the library's own handler. Kept because
                    // "measured today" is not "promised forever", and an uncaught error here is a 500.
                    .onErrorResume(error -> Mono.just(serveUncounted(routeId, id, describe(error))));
        } catch (RuntimeException error) {
            // Before the library's own try block — a config it cannot load escapes as a THROW, not as
            // a failed Mono. Wrapping only the reactive chain would miss exactly this case.
            return Mono.just(serveUncounted(routeId, id, describe(error)));
        }
    }

    /** True when this answer claims to allow the request but carries no count at all. */
    private static boolean hasNoCount(Response answer) {
        return answer.isAllowed() && NO_COUNT.equals(answer.getHeaders().get(RedisRateLimiter.REMAINING_HEADER));
    }

    /**
     * Serve the request, and say so — in the response, in the metric, and (throttled) in the log.
     *
     * <p>The library's headers are NOT forwarded here. {@code X-RateLimit-Remaining: -1} is a
     * sentinel that reads like a count, and a caller doing arithmetic on it is the confusion this
     * class exists to remove; the honest answer is that there is no number, which is what the header
     * below says.
     */
    private Response serveUncounted(String routeId, String id, String why) {
        degraded.increment();
        if (shouldWarn(routeId)) {
            log.warn(
                    "the edge could not count this request and SERVED it unguarded: route={} key={} because {}",
                    routeId,
                    id,
                    why);
        }
        return new Response(true, Map.of(DEGRADED_HEADER, DEGRADED));
    }

    private static String describe(Throwable error) {
        String message = error.getMessage();
        return "the rate limiter failed with " + error.getClass().getSimpleName()
                + (message == null ? "" : ": " + message);
    }

    /** True at most once per {@code warn-interval} per route, and always for the first failure. */
    private boolean shouldWarn(String routeId) {
        long now = nanos.getAsLong();
        long limit = warnInterval.toNanos();
        for (;;) {
            long last = lastWarnAt.get();
            if (last != Long.MIN_VALUE && now - last < limit) {
                return false;
            }
            if (lastWarnAt.compareAndSet(last, now)) {
                log.trace("first unguarded request for route {} in this interval", routeId);
                return true;
            }
        }
    }

    // The library's own configuration, forwarded rather than reimplemented: per-route numbers
    // (`redis-rate-limiter.replenishRate` and friends in the route's args) are bound onto the LIMITER's
    // config map by Spring Cloud Gateway through a `FilterArgsEvent` listener — registered on the
    // DELEGATE bean, which is why `getConfig()` must return the delegate's own map and not a copy.
    //
    // There is no `setConfig` here because the INTERFACE has none: `Configurable<C>` declares only
    // `getConfigClass()` and `newConfig()`, and `setConfig` lives on `AbstractStatefulConfigurable`.

    @Override
    public Map<String, RedisRateLimiter.Config> getConfig() {
        return counter.getConfig();
    }

    @Override
    public Class<RedisRateLimiter.Config> getConfigClass() {
        return counter.getConfigClass();
    }

    @Override
    public RedisRateLimiter.Config newConfig() {
        return counter.newConfig();
    }
}
