package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Proves the endpoint is wired: the controller, the probe bean, the discovery address and the actuator path
 * all have to agree for this to pass. {@link ServiceHealthProbeTest} grades the classification; this grades
 * the join.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "nexus.gateway.health-probe-timeout-ms=500",
            "logging.level.root=warn"
        })
class PlatformHealthWiringTest {

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

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        upstream.reset();
        upstream.clearPaths();
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .build();
    }

    @Test
    void theEndpointProbesTheActuatorPathOnTheDiscoveredInstance() {
        upstream.answer(200, "{\"status\":\"UP\"}");

        client.get()
                .uri("/platform/health")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.allUp")
                .isEqualTo(true)
                .jsonPath("$.services[0].id")
                .isEqualTo("nexus-api")
                .jsonPath("$.services[0].instances[0].status")
                .isEqualTo("UP")
                .jsonPath("$.services[0].instances[0].uri")
                .isEqualTo(upstream.uri());

        assertThat(upstream.paths()).containsExactly("/actuator/health");
    }

    @Test
    void aDownBackendMakesAllUpFalseWhileTheEndpointStillAnswers200() {
        upstream.answer(503, "{\"status\":\"DOWN\"}");

        client.get()
                .uri("/platform/health")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.allUp")
                .isEqualTo(false)
                .jsonPath("$.services[0].instances[0].status")
                .isEqualTo("DOWN")
                .jsonPath("$.services[0].instances[0].httpStatus")
                .isEqualTo(503);
    }
}
