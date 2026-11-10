package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The shared rate limiter's FAIL-OPEN promise, measured on a wire against a REAL Lettuce connection failure
 * (SC-35) — not the mock {@code Mono.error} of {@link RateLimitFilterTest}, and not the normal-path 429 of
 * {@link GatewayRateLimitWiringTest}.
 *
 * <p><b>The gap:</b> SC-12 chose the {@code redis} backend so every gateway instance shares one atomic bucket,
 * and {@link RateLimitFilter} declares that a backend failure must FAIL OPEN — "a rate limit is a bound, not
 * an authentication decision; refusing every request would turn a degraded limiter into a full outage."
 * That promise was only ever graded with a mock backend that immediately returns {@code Mono.error}. A real
 * Lettuce failure has its own connection pool, retry and timeout behaviour; whether the door truly stays open
 * through all of it — and whether the request reaches the backend, not just the filter chain — was unmeasured.
 * This is the resilience that matters most precisely when the shared dependency is down.
 *
 * <p><b>Measured first with a throwaway 3-round probe (2026-11-11), then graded here:</b> with the shared
 * backend configured but its server refusing connections (port 1, no listener), the caller got status 200 every
 * round, the backend stub saw exactly ONE request per round, and the log carried
 * {@code "backend 'redis' failed; request allowed unthrottled (fail-open): RedisConnectionFailureException"}.
 * The door stayed open and the request crossed the whole chain to a real answer — not a 500, 429 or a hang.
 *
 * <p><b>Stable invariants graded:</b>
 * <ul>
 *   <li><b>A dead shared limiter never closes the door.</b> Every request gets through to the backend and the
 *       caller receives the backend's honest 200 — availability over throttling, the deliberate SC-12 trade.
 *   <li><b>No amplification.</b> The backend sees exactly ONE request per call — a limiter failure does not
 *       replay the request.
 *   <li><b>The failure is reported, not silently swallowed.</b> At least one throttled WARN names the backend
 *       and the fail-open decision, so an operator can tell "the door is up but unthrottled" from "limiter on".
 * </ul>
 *
 * <p><b>Deliberately NOT asserted</b> (measured unstable; same discipline as ADR-0101/0105/0106): the exact
 * per-round latency. The probe read 1205ms on the FIRST round (Lettuce's cold connection failure + retry),
 * then 22ms / 19ms once the failure was cached. Pinning a number would be a flaky, machine-dependent test.
 * A loose ceiling is asserted only to catch a genuine HANG — the thing fail-open exists to prevent — not to
 * grade how fast a cold Lettuce failure happens to be.
 *
 * <p><b>No production change.</b> This grades the SC-12 promise under the failure it was written for; the
 * mock-graded contract turns out to hold against a real Lettuce failure too. The honest caveat (recorded in
 * the ADR): the backend relies on Lettuce's own connect/command timeout to turn "unreachable" into an error —
 * a blackholed dependency slower than that bound delays the request before fail-open, which is why the ceiling
 * here is generous.
 */
@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.rate-limit.enabled=true",
            "nexus.gateway.rate-limit.backend=redis",
            "spring.data.redis.host=127.0.0.1",
            // Port 1 has no listener: a deterministic connection-refused, no real Redis process needed.
            "spring.data.redis.port=1",
            "spring.data.redis.timeout=300ms",
            "spring.data.redis.connect-timeout=300ms",
            "logging.level.root=warn"
        })
class GatewayRedisFailOpenWiringTest {

    private static final int ROUNDS = 5;
    /** A loose ceiling that catches a genuine hang, not a grade on cold-Lettuce latency (probe: 1205ms). */
    private static final long HANG_CEILING_MS = 8_000L;
    private static StubUpstream upstream;

    @DynamicPropertySource
    static void advertiseTheStub(DynamicPropertyRegistry registry) {
        upstream = StubUpstream.start();
        registry.add("spring.cloud.discovery.client.simple.instances.nexus-api[0].uri", upstream::uri);
    }

    @AfterAll
    static void stopStub() {
        if (upstream != null) {
            upstream.stop();
        }
    }

    @LocalServerPort
    private int port;
    private WebTestClient client;

    @BeforeEach
    void reset() {
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    @Test
    void aDeadSharedLimiterLetsEveryRequestThroughToAnHonestAnswer(CapturedOutput output) {
        int honestAnswers = 0;
        long slowestMs = 0;
        for (int i = 0; i < ROUNDS; i++) {
            upstream.clearPaths();
            long started = System.nanoTime();
            int status = client.get()
                    .uri("/api/publications")
                    .exchange()
                    .expectBody()
                    .returnResult()
                    .getStatus()
                    .value();
            long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
            slowestMs = Math.max(slowestMs, elapsedMs);

            assertThat(status)
                    .as("round %d: a dead limiter must not close the door (no 500/429) — the backend's 200", i)
                    .isEqualTo(200);
            assertThat(upstream.paths())
                    .as("round %d: the request must cross to the backend exactly ONCE — fail-open, no replay", i)
                    .hasSize(1);
            honestAnswers++;
        }
        assertThat(honestAnswers)
                .as("every round must reach an honest 200 — never a refused door, error or hang")
                .isEqualTo(ROUNDS);
        assertThat(slowestMs)
                .as("no round may hang; the ceiling is loose on purpose — cold Lettuce failure is ~1.2s")
                .isLessThan(HANG_CEILING_MS);

        // The other half of an honest fail-open: the operator can see it. Throttled, so >=1, not one per round.
        assertThat(output.getAll())
                .as("the fail-open decision must be logged (throttled), naming the backend")
                .contains("fail-open")
                .contains("redis");
    }
}
