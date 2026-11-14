package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import java.time.Duration;
import java.util.List;
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
 * The circuit breaker's OPEN state — the half nobody had graded.
 *
 * <p>{@link GatewayRoutingTest} proves a failing backend answers 503 naming the failure, but deliberately
 * keeps the window at 100 so an earlier failure cannot open the circuit for a later leg. The one property
 * that distinguishes a breaker from a per-request timeout — once the window says the backend is down, the
 * door fails fast and the backend hears nothing — was never asserted on a wire. This class asserts it:
 * four stub refusals open the circuit (failure rate 100% ≥ 50%), the fifth call is answered from the
 * fallback with {@code CallNotPermitted} as the recorded cause, and the stub sees NO new request.
 *
 * <p>The window is explicitly small (4) so this leg costs four refused calls, not a hundred. The stub's
 * refusal is a mid-call connection drop — an exception, which is what the breaker counts; a 5xx response
 * is not a breaker failure (that is the route's answer, pinned by GatewayRoutingTest).
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "resilience4j.timelimiter.instances.nexus-api.timeout-duration=800ms",
            "resilience4j.circuitbreaker.instances.nexus-api.sliding-window-size=4",
            "resilience4j.circuitbreaker.instances.nexus-api.minimum-number-of-calls=4",
            "resilience4j.circuitbreaker.instances.nexus-api.failure-rate-threshold=50",
            "resilience4j.circuitbreaker.instances.nexus-api.wait-duration-in-open-state=60s",
            "logging.level.root=warn"
        })
class GatewayCircuitOpenWiringTest {

    private static StubUpstream apiUpstream;

    @DynamicPropertySource
    static void advertiseTheStubs(DynamicPropertyRegistry registry) {
        apiUpstream = StubUpstream.start();
        registry.add("spring.cloud.discovery.client.simple.instances.nexus-api[0].uri", apiUpstream::uri);
    }

    @AfterAll
    static void stopStubs() {
        if (apiUpstream != null) {
            apiUpstream.stop();
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
        apiUpstream.reset();
        apiUpstream.clearPaths();
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    @Test
    void afterFourRefusalsTheDoorFailsFastAndTheBackendHearsNothing() {
        // Baseline: the backend answers fine until the test breaks it.
        client.get()
                .uri("/api/publications")
                .exchange()
                .expectStatus()
                .isOk();
        assertThat(apiUpstream.paths()).containsExactly("/publications");
        apiUpstream.clearPaths();

        // Break the backend; every call is refused mid-call (an exception — what the breaker counts).
        // The GET retry filter retries once per refusal: two wire attempts per call.
        for (int i = 0; i < 4; i++) {
            client.get()
                    .uri("/api/drop")
                    .exchange()
                    .expectStatus()
                    .isEqualTo(503)
                    .expectBody()
                    .jsonPath("$.service")
                    .isEqualTo("nexus-api");
        }
        int callsBeforeOpen = apiUpstream.paths().size();

        // The circuit is open: the fifth call is answered from the fallback with NO request hitting the wire.
        client.get()
                .uri("/api/drop")
                .exchange()
                .expectStatus()
                .isEqualTo(503)
                .expectBody()
                .jsonPath("$.error")
                .isEqualTo("service_unavailable")
                .jsonPath("$.cause")
                .value(cause -> assertThat((String) cause).contains("CallNotPermitted"));

        assertThat(apiUpstream.paths()).hasSize(callsBeforeOpen);
    }
}
