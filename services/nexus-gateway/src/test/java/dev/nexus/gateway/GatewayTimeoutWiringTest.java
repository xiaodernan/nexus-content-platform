package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import java.time.Duration;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The retry filter's SECOND exception trigger — {@code TimeoutException} — on a real slow socket (SC-34).
 * {@link GatewayRetryTransportWiringTest} grades the FIRST ({@code IOException}, a mid-call connection drop);
 * this class owns the timeout half of {@code setExceptions(IOException, TimeoutException)}.
 *
 * <p><b>Why this is a real gap, not a duplicate of {@link GatewayRoutingTest}:</b> that class's one
 * {@code /api/slow} leg proves only "a slow backend answers 503, not an empty success", with a cause
 * assertion weak enough to pass for ANY non-default cause ({@code isNotEqualTo("not-reported")}). It never
 * asked whether a slow WRITE is replayed, nor whether the recorded cause is genuinely a timeout. If the
 * {@code setMethods(GET)} gate failed on the exception path, one slow POST would become two publications —
 * the exact "one click, two writes" failure the route comment exists to prevent.
 *
 * <p><b>Measured first with a throwaway 5-round probe (2026-11-11), then confirmed against source:</b>
 * resilience4j's {@code TimeLimiterImpl} raises {@code java.util.concurrent.TimeoutException} — the very
 * class {@link GatewayConfig}'s {@code setExceptions} names — so this exception trigger is LIVE. And
 * {@code RetryGatewayFilterFactory.RetryConfig}'s exception predicate applies the SAME {@code setMethods(GET)}
 * gate as its status predicate (source-verified in SC-33). The stable, graded invariants:
 *
 * <ul>
 *   <li><b>A write is never replayed on a timeout.</b> A slow POST reaches the backend exactly ONCE, every
 *       round — wire {@code hasSize(1)} proves both that it truly hit the wire and that no retry followed.
 *   <li><b>A retry never amplifies a slow GET beyond one extra attempt.</b> The backend sees at most 2 wire
 *       attempts, and the caller always gets an HONEST 503 — never an empty 200, 500, 429 or a hung socket.
 *   <li><b>The timeout cause is reported, not invented.</b> The fallback names the exact breaker-recorded
 *       class ({@code java.util.concurrent.TimeoutException}) and all five honest fields — this is the
 *       graded version of the weak assertion in {@link GatewayRoutingTest}, on a fixture that cannot lie.
 * </ul>
 *
 * <p><b>A fixture lie was found and fixed (recorded here so nobody reintroduces it):</b> a plain
 * {@link StubUpstream} uses a serial {@code HttpServer} dispatcher. Once one slow request occupies the single
 * dispatch thread, later requests never reach {@code handle()} and wire counts falsely read 0 — the probe's
 * first run read POST wire 1,0,0,0,1 / GET wire 0,0,0,1,0, which measures the STUB, not the gateway. The new
 * {@link StubUpstream#startConcurrent()} gives it a cached pool; the same probe then read POST wire 1,1,1,1,1
 * / GET wire 1,2,2,2,2, all status 503, all cause TimeoutException. Default {@code start()} is unchanged,
 * so every existing wire test keeps its measured semantics.
 *
 * <p><b>Deliberately NOT asserted</b> (unstable; same territory as ADR-0101): the GET leg's exact wire count.
 * It lands on 1 or 2 across rounds — whether the retry's second wire attempt is recorded before or after the
 * breaker fallback commits the 503 is a scheduling race. {@code isBetween(1, 2)} grades the bound, not the
 * race. Repeating rounds grades stability itself, not a lucky single run.
 *
 * <p><b>No production change.</b> The exception trigger is live and correct: it fires, the method gate blocks
 * writes, the answer is honest. There is no defect to fix — this class turns that safety property into a wire
 * invariant and makes the cause readout honest.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.rate-limit.enabled=false",
            // Backend sleeps 1200ms; the door gives up at 250ms — a timeout is deterministic, not a race.
            "resilience4j.timelimiter.instances.nexus-api.timeout-duration=250ms",
            // Breaker CLOSED throughout (100 calls needed) so wire counts reflect retry/timeout, not OPEN state.
            "resilience4j.circuitbreaker.instances.nexus-api.minimum-number-of-calls=100",
            "resilience4j.circuitbreaker.instances.nexus-api.sliding-window-size=100",
            "logging.level.root=warn"
        })
class GatewayTimeoutWiringTest {

    private static final int ROUNDS = 5;
    private static final long BACKEND_DELAY_MS = 1200;
    private static final String TIMEOUT_CAUSE = TimeoutException.class.getName();
    private static StubUpstream upstream;

    @DynamicPropertySource
    static void advertiseTheStub(DynamicPropertyRegistry registry) {
        // SC-34: concurrent dispatch, so a sleeping request cannot hide later wire attempts from paths().
        upstream = StubUpstream.startConcurrent();
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

    @Autowired
    CircuitBreakerRegistry breakers;

    @BeforeEach
    void reset() {
        for (CircuitBreaker breaker : breakers.getAllCircuitBreakers()) {
            breaker.reset();
        }
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    /** Make the backend genuinely slow, past the door's timelimiter, and forget prior wire reads. */
    private void armSlowBackend() {
        upstream.reset();
        upstream.clearPaths();
        upstream.delay(BACKEND_DELAY_MS);
    }

    private WebTestClient.ResponseSpec slowPost() {
        armSlowBackend();
        return client.post()
                .uri("/api/publications")
                .header("Content-Type", "application/json")
                .bodyValue("{\"title\":\"Harbour\"}")
                .exchange();
    }

    private WebTestClient.ResponseSpec slowGet() {
        armSlowBackend();
        return client.get().uri("/api/publications?limit=1").exchange();
    }

    private static void assertHonestTimeout(WebTestClient.ResponseSpec spec) {
        spec.expectStatus()
                .isEqualTo(503)
                .expectBody()
                .jsonPath("$.error")
                .isEqualTo("service_unavailable")
                .jsonPath("$.service")
                .isEqualTo("nexus-api")
                .jsonPath("$.cause")
                .isEqualTo(TIMEOUT_CAUSE)
                .jsonPath("$.note")
                .isEqualTo("the gateway did not reach a result for this call; an empty list would mean something else");
    }

    @Test
    void aWriteIsNeverReplayedWhenTheBackendOnlyTimesOut() {
        for (int i = 0; i < ROUNDS; i++) {
            WebTestClient.ResponseSpec spec = slowPost();
            int wire = upstream.paths().size();
            assertThat(wire)
                    .as("round %d: a timed-out POST must reach the backend exactly ONCE, never be replayed", i)
                    .isEqualTo(1);
            assertHonestTimeout(spec);
        }
    }

    @Test
    void aTimedOutReadIsRetriedAtMostOnceAndAlwaysAnswersHonestly() {
        int honestAnswers = 0;
        for (int i = 0; i < ROUNDS; i++) {
            WebTestClient.ResponseSpec spec = slowGet();
            int wire = upstream.paths().size();
            assertThat(wire)
                    .as("round %d: retry=1 caps a slow GET at 2 wire attempts (no amplification)", i)
                    .isBetween(1, 2);
            assertHonestTimeout(spec); // honest 503 with the real TimeoutException cause — never an empty 200
            honestAnswers++;
        }
        assertThat(honestAnswers)
                .as("every round must land on an honest 503 — never an empty success, 500 or hung socket")
                .isEqualTo(ROUNDS);
    }

    @Test
    void theTimeoutIsReportedAsTheCauseInsteadOfBeingInventedOrHidden() {
        // The graded replacement for GatewayRoutingTest's weak isNotEqualTo("not-reported") assertion: on a
        // fixture that cannot lie, the fallback must name the EXACT class the breaker recorded, and every
        // honest field must be present. A fabricated exception or a swallowed timeout fails here.
        assertHonestTimeout(slowGet());
    }
}
