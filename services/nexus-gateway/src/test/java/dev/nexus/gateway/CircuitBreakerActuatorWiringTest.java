package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import java.time.Duration;
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
 * The breaker's own state, on the operator's surface (SC-31) — the join of §SC-24 (OPEN fails fast),
 * §SC-29 (HALF_OPEN heals), and the platform's management plane.
 *
 * <p>Until now the only reader of a breaker's state was a TEST calling {@link CircuitBreakerRegistry}. An
 * operator had no way to see "is my backend being tripped right now, and did the door recover" without
 * attaching a debugger. Resilience4j ships an actuator endpoint ({@code /actuator/circuitbreakers}); the
 * gateway had it on the classpath but did NOT expose it ({@code management...exposure.include} was health only),
 * so the读数 existed but nobody could read it. This class grades the exposed endpoint on a real socket:
 *
 * <ul>
 *   <li>it lists BOTH backends and agrees with the registry the gateway actually wired (the readout is not a
 *       second invented truth — it is the SAME state machines, projected);
 *   <li>when §SC-24's failures open a circuit, the endpoint shows {@code state=OPEN} with a real
 *       {@code failureRate}/{@code failedCalls} — not a hard-coded string;
 *   <li>when §SC-29's half-open probe succeeds and the circuit CLOSES, the endpoint shows {@code CLOSED} again —
 *       the door's self-healing is now an operator-visible fact, not just a test assertion.
 * </ul>
 *
 * <p>The endpoint is deliberately NOT in the auth whitelist; its protection is graded separately in
 * {@link CircuitBreakerActuatorAuthTest}, which runs an auth-on context.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.auth.enabled=false",
            "nexus.gateway.rate-limit.enabled=false",
            "management.endpoints.web.exposure.include=health,circuitbreakers",
            "resilience4j.timelimiter.instances.nexus-api.timeout-duration=800ms",
            "resilience4j.circuitbreaker.instances.nexus-api.sliding-window-size=4",
            "resilience4j.circuitbreaker.instances.nexus-api.minimum-number-of-calls=4",
            "resilience4j.circuitbreaker.instances.nexus-api.failure-rate-threshold=50",
            "resilience4j.circuitbreaker.instances.nexus-api.wait-duration-in-open-state=1500ms",
            "resilience4j.circuitbreaker.instances.nexus-api.permitted-number-of-calls-in-half-open-state=1",
            "resilience4j.circuitbreaker.instances.nexus-api.automatic-transition-from-open-to-half-open-enabled=true",
            "logging.level.root=warn"
        })
class CircuitBreakerActuatorWiringTest {

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

    private void openTheCircuit() {
        upstream.startDropping();
        for (int i = 0; i < 12 && breakers.find("nexus-api").orElseThrow().getState() != CircuitBreaker.State.OPEN;
                i++) {
            client.get().uri("/api/publications").exchange().expectStatus().isEqualTo(503);
        }
        assertThat(breakers.find("nexus-api").orElseThrow().getState())
                .as("sustained drops must open the circuit")
                .isEqualTo(CircuitBreaker.State.OPEN);
    }

    private void awaitAutomaticHalfOpen() throws InterruptedException {
        CircuitBreaker breaker = breakers.find("nexus-api").orElseThrow();
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(20_000L);
        while (breaker.getState() != CircuitBreaker.State.HALF_OPEN && System.nanoTime() < deadline) {
            Thread.sleep(50L);
        }
        assertThat(breaker.getState()).isEqualTo(CircuitBreaker.State.HALF_OPEN);
    }

    @Test
    void theEndpointListsBothBackendsAndAgreesWithTheRegistry() {
        client.get()
                .uri("/actuator/circuitbreakers")
                .exchange()
                .expectStatus()
                .isOk()
                // The projection names exactly the two breakers the route table wires — no invented third.
                .expectBody()
                .jsonPath("$.circuitBreakers.nexus-api.state")
                .isEqualTo("CLOSED")
                .jsonPath("$.circuitBreakers.nexus-domain-service.state")
                .isEqualTo("CLOSED")
                .jsonPath("$.circuitBreakers.nexus-api.failureRateThreshold")
                .isEqualTo("50.0%");

        // And it is the SAME state machines, not a second hardcoded truth: the registry says so too.
        assertThat(breakers.find("nexus-api")).isPresent();
        assertThat(breakers.find("nexus-domain-service")).isPresent();
        assertThat(breakers.find("nexus-api").orElseThrow().getState())
                .isEqualTo(CircuitBreaker.State.CLOSED);
    }

    @Test
    void anOpenCircuitShowsRealFailureReadoutAndClearsAfterSelfHealing() throws InterruptedException {
        // §SC-24 + §SC-29 drive the state machines; the endpoint only OBSERVES them.
        openTheCircuit();

        client.get()
                .uri("/actuator/circuitbreakers")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.circuitBreakers.nexus-api.state")
                .isEqualTo("OPEN")
                // Real counters from the window, not a literal "OPEN" planted for the test.
                .jsonPath("$.circuitBreakers.nexus-api.failedCalls")
                .value(n -> assertThat(((Number) n).intValue()).isGreaterThan(0))
                .jsonPath("$.circuitBreakers.nexus-api.failureRate")
                .value(rate -> assertThat((String) rate).endsWith("%"))
                // The other backend is untouched: one tripped circuit is not a blanket outage.
                .jsonPath("$.circuitBreakers.nexus-domain-service.state")
                .isEqualTo("CLOSED");

        // Recover the backend; §SC-29's half-open probe succeeds and the door heals.
        upstream.stopDropping();
        awaitAutomaticHalfOpen();
        client.get().uri("/api/publications").exchange().expectStatus().isOk();
        assertThat(breakers.find("nexus-api").orElseThrow().getState())
                .isEqualTo(CircuitBreaker.State.CLOSED);

        // The operator's surface now reads CLOSED — self-healing is an observable fact, not a test-only one.
        client.get()
                .uri("/actuator/circuitbreakers")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.circuitBreakers.nexus-api.state")
                .isEqualTo("CLOSED");
    }
}
