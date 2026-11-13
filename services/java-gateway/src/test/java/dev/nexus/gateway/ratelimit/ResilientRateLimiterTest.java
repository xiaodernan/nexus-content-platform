package dev.nexus.gateway.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.ratelimit.RateLimiter;
import org.springframework.cloud.gateway.filter.ratelimit.RateLimiter.Response;
import org.springframework.cloud.gateway.filter.ratelimit.RedisRateLimiter;
import reactor.core.publisher.Mono;

/**
 * v657 — what the edge does with an answer, and with the ABSENCE of one.
 *
 * <p>The absence has THREE shapes, and the first test class to try this only knew one of them. The
 * library does not refuse when it cannot count: it ADMITS, and marks the answer with
 * {@code X-RateLimit-Remaining: -1}. A decorator that only catches errors therefore never fires on
 * the very path it was written for — measured: a request through the shipped route with the counter
 * on a dead port came back 200, unmarked, with the degradation counter at zero.
 *
 * <p>So the legs below cover the sentinel (the real path), a synchronous throw from before the
 * library's own try block, and an error on the reactive chain (the defensive path).
 *
 * <p>The clock is injected ({@code LongSupplier}) so the log throttle is measured, not slept
 * through: a test that sleeps ten seconds to see a WARN is a test people delete.
 */
class ResilientRateLimiterTest {

    private static final String NO_COUNT = "-1";

    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();

    private final AtomicLong clock = new AtomicLong();

    private Logger limiterLogger;

    private ListAppender<ILoggingEvent> appender;

    @BeforeEach
    void captureTheLimitersLog() {
        limiterLogger = (Logger) LoggerFactory.getLogger(ResilientRateLimiter.class);
        appender = new ListAppender<>();
        appender.start();
        limiterLogger.addAppender(appender);
        limiterLogger.setLevel(Level.WARN);
    }

    @AfterEach
    void detach() {
        limiterLogger.detachAppender(appender);
    }

    @Test
    void aRefusalStaysARefusalWithItsOwnHeaders() {
        Map<String, String> headers = Map.of(RedisRateLimiter.REMAINING_HEADER, "0");
        ResilientRateLimiter limiter = limiter(FakeCounter.answering(new Response(false, headers)));

        Response answer = limiter.isAllowed("nexus-api", "10.0.0.7").block();

        assertThat(answer).isNotNull();
        assertThat(answer.isAllowed())
                .as("a 429 the counter DID produce must not be softened into an admission")
                .isFalse();
        assertThat(answer.getHeaders())
                .as("and it must keep the counter's own numbers: the caller needs to know when to come back")
                .containsEntry(RedisRateLimiter.REMAINING_HEADER, "0")
                .doesNotContainKey(ResilientRateLimiter.DEGRADED_HEADER);
        assertThat(degradedCount()).isZero();
        assertThat(warnings()).isEmpty();
    }

    @Test
    void anAdmissionKeepsTheCountersNumbersAndSaysNothingExtra() {
        Map<String, String> headers = Map.of(RedisRateLimiter.REMAINING_HEADER, "7");
        ResilientRateLimiter limiter = limiter(FakeCounter.answering(new Response(true, headers)));

        Response answer = limiter.isAllowed("nexus-api", "10.0.0.7").block();

        assertThat(answer).isNotNull();
        assertThat(answer.isAllowed()).isTrue();
        assertThat(answer.getHeaders())
                .as("a healthy count is reported as it arrived — the decorator adds nothing to a normal answer")
                .containsExactlyEntriesOf(headers);
        assertThat(degradedCount()).isZero();
        assertThat(warnings()).isEmpty();
    }

    @Test
    void theLibrariesOwnNoCountAnswerIsRecognisedEvenThoughNothingThrows() {
        // Exactly what RedisRateLimiter produces when the Lua call fails: still allowed, remaining -1,
        // no exception anywhere. This is the path the first version of this class never saw.
        ResilientRateLimiter limiter = limiter(FakeCounter.answering(
                new Response(true, Map.of(RedisRateLimiter.REMAINING_HEADER, NO_COUNT))));

        Response answer = limiter.isAllowed("nexus-api", "10.0.0.7").block();

        assertThat(answer).isNotNull();
        assertThat(answer.isAllowed())
                .as("the library's decision is kept: a missing counter must not become a refusal")
                .isTrue();
        assertThat(answer.getHeaders())
                .as("but the answer must SAY it is unguarded, and must not ship the sentinel as if it were a count")
                .containsEntry(ResilientRateLimiter.DEGRADED_HEADER, ResilientRateLimiter.DEGRADED)
                .doesNotContainKey(RedisRateLimiter.REMAINING_HEADER);
        assertThat(degradedCount()).isEqualTo(1.0);
        assertThat(warnings()).hasSize(1);
        assertThat(warnings().get(0)).as("the line must name what happened").contains("SERVED it unguarded");
    }

    @Test
    void aThrowFromBeforeTheLibrariesOwnTryBlockIsAlsoUncounted() {
        // RedisRateLimiter calls loadConfiguration() BEFORE its try block, so a config it cannot load
        // escapes isAllowed() as a throw. Wrapping only the reactive chain would miss this entirely.
        ResilientRateLimiter limiter = limiter(FakeCounter.throwing(new IllegalStateException("RedisRateLimiter is not initialized")));

        Response answer = limiter.isAllowed("nexus-api", "10.0.0.7").block();

        assertThat(answer).isNotNull();
        assertThat(answer.isAllowed())
                .as("a throw is not a decision about the caller either")
                .isTrue();
        assertThat(answer.getHeaders()).containsEntry(ResilientRateLimiter.DEGRADED_HEADER, ResilientRateLimiter.DEGRADED);
        assertThat(degradedCount()).isEqualTo(1.0);
        assertThat(warnings()).hasSize(1);
        assertThat(warnings().get(0))
                .as("and it must name the exception, not just that something failed")
                .contains("RedisRateLimiter is not initialized");
    }

    @Test
    void anErrorOnTheReactiveChainIsAlsoUncounted() {
        ResilientRateLimiter limiter = limiter(FakeCounter.failingWith(new IllegalStateException("redis is gone")));

        Response answer = limiter.isAllowed("nexus-api", "10.0.0.7").block();

        assertThat(answer).isNotNull();
        assertThat(answer.isAllowed()).isTrue();
        assertThat(answer.getHeaders()).containsEntry(ResilientRateLimiter.DEGRADED_HEADER, ResilientRateLimiter.DEGRADED);
        assertThat(warnings()).hasSize(1);
        assertThat(warnings().get(0)).contains("redis is gone").contains("route=nexus-api").contains("key=10.0.0.7");
    }

    @Test
    void everyRequestIsCountedButAtMostOneLinePerIntervalReachesTheLog() {
        Duration interval = Duration.ofSeconds(10);
        ResilientRateLimiter limiter = limiter(
                FakeCounter.answering(new Response(true, Map.of(RedisRateLimiter.REMAINING_HEADER, NO_COUNT))), interval);

        clock.set(0);
        for (int i = 0; i < 50; i++) {
            limiter.isAllowed("nexus-api", "10.0.0.7").block();
            clock.addAndGet(Duration.ofMillis(100).toNanos());
        }
        assertThat(degradedCount())
                .as("the METRIC is per request: an operator alerting on it must see the real rate")
                .isEqualTo(50.0);
        assertThat(warnings())
                .as("but 50 lines about one outage is how a log stops being read")
                .hasSize(1);

        clock.addAndGet(interval.toNanos());
        limiter.isAllowed("nexus-api", "10.0.0.7").block();
        assertThat(warnings())
                .as("the next interval earns its own line, so a long outage stays visible")
                .hasSize(2);
    }

    @Test
    void theRoutesOwnNumbersReachTheDelegateRatherThanBeingShadowedHere() {
        FakeCounter counter = FakeCounter.answering(new Response(true, Map.of()));
        ResilientRateLimiter limiter = limiter(counter);

        RedisRateLimiter.Config config = counter.newConfig();
        config.setReplenishRate(3);
        config.setBurstCapacity(3);
        // Written where Spring Cloud Gateway writes it — onto the DELEGATE, through the
        // `FilterArgsEvent` listener the delegate bean registers. A decorator holding its own map
        // would answer the next two assertions and still count with the wrong numbers.
        counter.getConfig().put("nexus-api", config);

        assertThat(limiter.getConfig())
                .as("the route's numbers must be visible THROUGH the decorator")
                .containsKey("nexus-api");
        assertThat(limiter.getConfig().get("nexus-api").getBurstCapacity()).isEqualTo(3);
        assertThat(limiter.getConfigClass()).isEqualTo(RedisRateLimiter.Config.class);
    }

    private ResilientRateLimiter limiter(RateLimiter<RedisRateLimiter.Config> counter) {
        return limiter(counter, Duration.ofSeconds(10));
    }

    private ResilientRateLimiter limiter(RateLimiter<RedisRateLimiter.Config> counter, Duration interval) {
        return new ResilientRateLimiter(counter, meters, interval, clock::get);
    }

    private double degradedCount() {
        var counter = meters.find("nexus.edge.rate_limit.degraded").counter();
        return counter == null ? 0.0 : counter.count();
    }

    private List<String> warnings() {
        return appender.list.stream()
                .filter(event -> event.getLevel() == Level.WARN)
                .map(ILoggingEvent::getFormattedMessage)
                .toList();
    }

    /** A counter that answers what it was told to answer, fails, or throws — the three shapes. */
    private static final class FakeCounter implements RateLimiter<RedisRateLimiter.Config> {

        private final Response answer;

        private final RuntimeException failure;

        private final boolean failSynchronously;

        private Map<String, RedisRateLimiter.Config> config = new HashMap<>();

        private FakeCounter(Response answer, RuntimeException failure, boolean failSynchronously) {
            this.answer = answer;
            this.failure = failure;
            this.failSynchronously = failSynchronously;
        }

        static FakeCounter answering(Response answer) {
            return new FakeCounter(answer, null, false);
        }

        static FakeCounter failingWith(RuntimeException failure) {
            return new FakeCounter(null, failure, false);
        }

        static FakeCounter throwing(RuntimeException failure) {
            return new FakeCounter(null, failure, true);
        }

        @Override
        public Mono<Response> isAllowed(String routeId, String id) {
            if (failure == null) {
                return Mono.just(answer);
            }
            if (failSynchronously) {
                throw failure;
            }
            return Mono.error(failure);
        }

        @Override
        public Map<String, RedisRateLimiter.Config> getConfig() {
            return config;
        }

        @Override
        public Class<RedisRateLimiter.Config> getConfigClass() {
            return RedisRateLimiter.Config.class;
        }

        @Override
        public RedisRateLimiter.Config newConfig() {
            RedisRateLimiter.Config fresh = new RedisRateLimiter.Config();
            fresh.setReplenishRate(1);
            fresh.setBurstCapacity(1);
            return fresh;
        }
    }
}
