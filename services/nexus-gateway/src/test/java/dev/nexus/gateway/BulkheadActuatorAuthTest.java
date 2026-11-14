package dev.nexus.gateway;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The bulkhead readout sits behind the door too (SC-37 / extends SC-31 / SC-27).
 *
 * <p>{@code /actuator/bulkheads} names which backends have a capacity bound — a free map of the platform's
 * load-shedding posture to an unauthenticated caller, and half of "how busy is the door". The endpoint is
 * served by the reactive stack, so the question is the same one §SC-27 asked of {@code /platform/services}
 * and §SC-31 of {@code /actuator/circuitbreakers}: does {@link PlatformAuthFilter} (a {@code WebFilter})
 * actually cover it, or does the endpoint get answered before the filter runs? This class boots the real
 * auth-on gateway and measures it — it is NOT assumed from the breaker test, because each actuator handler
 * is a distinct mapping and a wiring change could put one outside the filter while the other stays inside.
 *
 * <p>No production code change is needed for the protection: this is the proof that the existing WebFilter
 * reaches the bulkhead handler, so exposing the endpoint in application.yml does not open a hole.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.auth.enabled=true",
            "nexus.gateway.auth.secret=integration-test-secret-do-not-ship",
            "nexus.gateway.rate-limit.enabled=false",
            "management.endpoints.web.exposure.include=health,circuitbreakers,bulkheads"
        })
class BulkheadActuatorAuthTest {

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
    void theBulkheadReadoutWithoutATokenIsRefused() {
        client().get()
                .uri("/actuator/bulkheads")
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
    void theBulkheadReadoutWithAValidTokenAnswers() {
        String token = AuthFilter.mint("operator", List.of("read"), SECRET, 3600);

        client().get()
                .uri("/actuator/bulkheads")
                .header(AuthFilter.AUTH_HEADER, "Bearer " + token)
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.bulkheads")
                .isArray();
    }

    @Test
    void healthStaysOpenEvenWithTheReadoutsGuarded() {
        // Whitelisting health is not collateral damage from guarding the readouts: a probe must still work.
        client().get().uri("/actuator/health").exchange().expectStatus().isOk();
    }
}
