package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
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
 * The circuit breaker's HALF_OPEN state — the half §SC-24 deliberately left ungraded.
 *
 * <p>{@link GatewayCircuitOpenWiringTest} proved that sustained failures OPEN the circuit and that an OPEN
 * circuit fails fast without touching the backend. That is only half of a breaker. A breaker that can open but
 * never close is a permanent outage wearing a resilience costume: after the backend restarts, the door would
 * keep answering 503 forever. The other half is the half-open probe — the door lets a small number of calls
 * through, and if they succeed it CLOSES and traffic flows again; if they fail it goes back to OPEN.
 *
 * <p>Three production settings in {@code application.yml} govern this and NONE of them had ever been
 * exercised: {@code automatic-transition-from-open-to-half-open-enabled}, {@code wait-duration-in-open-state},
 * and {@code permitted-number-of-calls-in-half-open-state}. This class grades all three on a real socket:
 *
 * <ul>
 *   <li>{@link #aRecoveredBackendIsProbedThroughHalfOpenAndTheCircuitCloses} — backend drops, circuit OPENS,
 *       backend recovers, the circuit transitions to HALF_OPEN ON ITS OWN (no request drives the transition —
 *       that is what the {@code automatic-transition} setting promises), the permitted probes succeed, the
 *       circuit CLOSES, and ordinary traffic reaches the backend again. This is the proof that the door heals.
 *   <li>{@link #aStillBrokenBackendKeepsTheCircuitOpenAfterTheProbe} — the same recovery window, but the
 *       backend is still down: the half-open probe fails and the circuit returns to OPEN. This is the proof
 *       that half-open is a guarded probe, not an unconditional re-open.
 * </ul>
 *
 * <p>What is asserted is the platform's own state machine (read from the {@link CircuitBreakerRegistry} the
 * gateway wired) and what the backend actually received — not resilience4j's internal event counts or a
 * library-specific exception. The window is small and the wait short so this leg costs a handful of calls and
 * about two seconds, mirroring how §SC-24 shrank its window to 4. The GET retry filter is present in the route;
 * it only re-fires an attempt on 502/503/IOException, so it is inert for the successful probes here and just
 * means the "opening" phase produces two wire attempts per call. Rate limiting is off so a probe burst cannot
 * be mistaken for a 429.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.rate-limit.enabled=false",
            "resilience4j.timelimiter.instances.nexus-api.timeout-duration=800ms",
            "resilience4j.circuitbreaker.instances.nexus-api.sliding-window-type=count-based",
            "resilience4j.circuitbreaker.instances.nexus-api.sliding-window-size=4",
            "resilience4j.circuitbreaker.instances.nexus-api.minimum-number-of-calls=4",
            "resilience4j.circuitbreaker.instances.nexus-api.failure-rate-threshold=50",
            "resilience4j.circuitbreaker.instances.nexus-api.wait-duration-in-open-state=1500ms",
            "resilience4j.circuitbreaker.instances.nexus-api.permitted-number-of-calls-in-half-open-state=2",
            "resilience4j.circuitbreaker.instances.nexus-api.automatic-transition-from-open-to-half-open-enabled=true",
            "logging.level.root=warn"
        })
class GatewayCircuitHalfOpenWiringTest {

    /** How long to wait for the automatic OPEN → HALF_OPEN transition before calling the wiring broken. */
    private static final long HALF_OPEN_TIMEOUT_MS = 20_000L;

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
    int port;

    @Autowired
    CircuitBreakerRegistry breakers;

    private WebTestClient client;

    @BeforeEach
    void reset() {
        for (CircuitBreaker breaker : breakers.getAllCircuitBreakers()) {
            breaker.reset();
        }
        upstream.reset();
        upstream.clearPaths();
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    /** The breaker instance the gateway route created, configured from the properties above. */
    private CircuitBreaker breaker() {
        return breakers.find("nexus-api").orElseThrow();
    }

    /**
     * Drive the backend into a mid-call outage until the breaker OPENS. The loop reads the breaker's own state
     * rather than assuming a fixed call count: the retry filter makes each call one or two wire attempts
     * depending on when the window fills, and that is a library detail this test refuses to pin.
     */
    private void openTheCircuit() {
        upstream.startDropping();
        for (int i = 0; i < 12 && breaker().getState() != CircuitBreaker.State.OPEN; i++) {
            client.get().uri("/api/publications").exchange().expectStatus().isEqualTo(503);
        }
        assertThat(breaker().getState())
                .as("sustained backend drops must open the circuit")
                .isEqualTo(CircuitBreaker.State.OPEN);
    }

    /** Wait, WITHOUT sending any request, for the automatic OPEN → HALF_OPEN transition. */
    private void awaitAutomaticHalfOpen() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(HALF_OPEN_TIMEOUT_MS);
        while (breaker().getState() != CircuitBreaker.State.HALF_OPEN && System.nanoTime() < deadline) {
            Thread.sleep(50L);
        }
        assertThat(breaker().getState())
                .as("an OPEN circuit must reach HALF_OPEN on its own once wait-duration elapses "
                        + "(automatic-transition-from-open-to-half-open-enabled), with NO request driving it")
                .isEqualTo(CircuitBreaker.State.HALF_OPEN);
    }

    @Test
    void aRecoveredBackendIsProbedThroughHalfOpenAndTheCircuitCloses() throws InterruptedException {
        openTheCircuit();

        // An OPEN door fails fast and hears nothing from the backend.
        int pathsWhenOpen = upstream.paths().size();
        client.get().uri("/api/publications").exchange().expectStatus().isEqualTo(503);
        assertThat(upstream.paths())
                .as("an OPEN circuit must not forward the call")
                .hasSize(pathsWhenOpen);

        // The backend comes back, but the breaker is still OPEN.
        upstream.stopDropping();
        awaitAutomaticHalfOpen();

        // HALF_OPEN admits the permitted number of probes; each reaches the RECOVERED backend and answers 200.
        // A fallback could only ever answer 503, so a 200 already proves the call crossed the wire.
        for (int i = 0; i < 2; i++) {
            client.get()
                    .uri("/api/publications")
                    .exchange()
                    .expectStatus()
                    .isOk()
                    .expectBody()
                    .jsonPath("$.from")
                    .isEqualTo("stub-upstream");
        }
        assertThat(breaker().getState())
                .as("successful half-open probes must CLOSE the circuit")
                .isEqualTo(CircuitBreaker.State.CLOSED);

        // Ordinary traffic flows again, and the backend receives it: the door genuinely healed.
        int pathsWhenClosed = upstream.paths().size();
        client.get()
                .uri("/api/publications?limit=1")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.from")
                .isEqualTo("stub-upstream");
        assertThat(upstream.paths()).hasSizeGreaterThan(pathsWhenClosed);
        assertThat(breaker().getState()).isEqualTo(CircuitBreaker.State.CLOSED);
    }

    @Test
    void aStillBrokenBackendKeepsTheCircuitOpenAfterTheProbe() throws InterruptedException {
        openTheCircuit();

        // The wait-duration elapses automatically, but this backend did NOT recover.
        awaitAutomaticHalfOpen();

        // The permitted probes hit the still-dropping backend and fail. resilience4j re-opens on the FIRST
        // failed probe, but Spring Cloud Gateway's retry filter may spend a SECOND wire attempt on the same
        // logical call before the breaker is consulted again — so read the state after the fact, and keep
        // probing a bounded number of times. The invariant is: the circuit must NOT close on a dead backend,
        // and must end OPEN shielding the backend. We never assert it pins an exact probe count (a library detail).
        List<CircuitBreaker.State> afterEachProbe = new ArrayList<>();
        for (int i = 0; i < 3 && breaker().getState() != CircuitBreaker.State.OPEN; i++) {
            client.get()
                    .uri("/api/publications")
                    .exchange()
                    .expectStatus()
                    .isEqualTo(503)
                    .expectBody()
                    .jsonPath("$.error")
                    .isEqualTo("service_unavailable");
            afterEachProbe.add(breaker().getState());
        }
        assertThat(breaker().getState())
                .as("failed half-open probes must send the circuit back to OPEN, never CLOSE it "
                        + "(states observed after each probe: " + afterEachProbe + ")")
                .isEqualTo(CircuitBreaker.State.OPEN);

        // And the door shields the backend again: the next call fails fast without a NEW wire attempt.
        int pathsWhenReopened = upstream.paths().size();
        client.get().uri("/api/publications").exchange().expectStatus().isEqualTo(503);
        assertThat(upstream.paths())
                .as("after a failed probe the backend must be shielded again")
                .hasSize(pathsWhenReopened);
    }
}
