package dev.nexus.gateway;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The management surface must sit behind the door too (SC-31 / extends SC-27).
 *
 * <p>{@code /actuator/circuitbreakers} exposes which backends are being tripped, their failure rates and call
 * counts — an operator's读数, and a free map of the platform's weak spots to an unauthenticated caller. The
 * actuator endpoint is served by the reactive stack, so the question is the same one §SC-27 asked of
 * {@code /platform/services}: does {@link PlatformAuthFilter} (a {@code WebFilter}) actually cover it, or does
 * the endpoint get answered before the filter runs? This class boots the real auth-on gateway and measures it.
 *
 * <p>The endpoint is deliberately NOT in the whitelist (only {@code /actuator/health} is): a health probe may
 * be public, the failure-rate readout may not. No production code change was needed for the protection — this
 * class is the proof that the existing WebFilter reaches actuator's handler, so exposing the endpoint in
 * application.yml does not open a hole.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.auth.enabled=true",
            "nexus.gateway.auth.secret=integration-test-secret-do-not-ship",
            "nexus.gateway.rate-limit.enabled=false",
            "management.endpoints.web.exposure.include=health,circuitbreakers"
        })
class CircuitBreakerActuatorAuthTest {

    private static final String SECRET = "integration-test-secret-do-not-ship";

    @LocalServerPort
    private int port;

    private WebTestClient client() {
        return WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    @Test
    void theCircuitBreakerReadoutWithoutATokenIsRefused() {
        client().get()
                .uri("/actuator/circuitbreakers")
                .exchange()
                .expectStatus()
                .isEqualTo(401)
                .expectBody()
                .jsonPath("$.error")
                .isEqualTo("unauthorized")
                .jsonPath("$.reason")
                .isEqualTo("missing_token");
    }

    @Test
    void theCircuitBreakerReadoutWithAValidTokenAnswers() {
        String token = AuthFilter.mint("operator", List.of("read"), SECRET, 3600);

        client().get()
                .uri("/actuator/circuitbreakers")
                .header(AuthFilter.AUTH_HEADER, "Bearer " + token)
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.circuitBreakers.nexus-api.state")
                .isEqualTo("CLOSED");
    }

    @Test
    void theHealthProbeStaysOpenEvenWithTheReadoutGuarded() {
        // Whitelisting health is not collateral damage from guarding the readout: a probe must still work.
        client().get().uri("/actuator/health").exchange().expectStatus().isOk();
    }
}
