package dev.nexus.gateway;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The route-table readout sits behind the door too (SC-39 / extends SC-27).
 *
 * <p>{@code /platform/routes} names every service id the gate can reach — a free map of the internal
 * topology to an unauthenticated caller if it were open. It is a gateway-owned controller, answered by the
 * reactive stack BEFORE the route pipeline, so only {@link PlatformAuthFilter} (a {@code WebFilter}) can
 * guard it; the route-edge {@link AuthFilter} never runs for it. This class boots the real auth-on gateway
 * and measures that the existing filter reaches this NEW controller without any production change — and
 * that it speaks the same 401 dialect as every other guarded surface (one door, one refusal shape).
 *
 * <p>The endpoint is deliberately NOT in the whitelist (only the two health probes and the fallback are).
 * Health staying open while this readout is guarded is the point: a liveness probe must not need a token,
 * the topology map must.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.auth.enabled=true",
            "nexus.gateway.auth.secret=integration-test-secret-do-not-ship",
            "nexus.gateway.rate-limit.enabled=false",
            "logging.level.root=warn"
        })
class PlatformRoutesAuthTest {

    private static final String SECRET = "integration-test-secret-do-not-ship";

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
    void setUp() {
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    @Test
    void theRouteTableWithoutATokenIsRefusedInTheSameDialect() {
        client.get()
                .uri("/platform/routes")
                .exchange()
                .expectStatus()
                .isEqualTo(401)
                .expectBody()
                .jsonPath("$.error")
                .isEqualTo("unauthorized")
                .jsonPath("$.reason")
                .isEqualTo("missing_token")
                .jsonPath("$.note")
                .isEqualTo("present Authorization: Bearer <token>; /platform/health and /fallback/** are open");
    }

    @Test
    void theRouteTableWithAValidTokenAnswers() {
        String token = AuthFilter.mint("operator", List.of("read"), SECRET, 3600);

        client.get()
                .uri("/platform/routes")
                .header(AuthFilter.AUTH_HEADER, "Bearer " + token)
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.routes")
                .isArray()
                .jsonPath("$.total")
                .isEqualTo(2);
    }

    @Test
    void theHealthProbesStayOpenWhileTheRouteTableIsGuarded() {
        // Guarding the topology map is not collateral damage: liveness probes must remain token-free.
        client.get().uri("/actuator/health").exchange().expectStatus().isOk();
    }
}
