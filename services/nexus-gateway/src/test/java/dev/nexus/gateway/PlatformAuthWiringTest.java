package dev.nexus.gateway;

import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * That the gateway's OWN endpoints sit behind the door too (SC-27) — the difference between a filter class
 * that passes unit tests and a bean the reactive pipeline actually registered.
 *
 * <p>The bug factory this class exists to delete: {@link AuthFilter} is a Spring Cloud {@code GlobalFilter},
 * so it never ran for {@code /platform/services} (the reactive stack answers the controller before the route
 * pipeline exists). With auth enabled, the topology address book was free to read. This test boots the real
 * gateway on a random port and asserts the platform surface behaves like everything else behind the door.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.auth.enabled=true",
            "nexus.gateway.auth.secret=integration-test-secret-do-not-ship",
            "nexus.gateway.rate-limit.enabled=false"
        })
class PlatformAuthWiringTest {

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

    @Test
    void platformServicesWithoutATokenIsRefused() {
        WebTestClient client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();

        client.get()
                .uri("/platform/services")
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
    void platformServicesWithAValidTokenAnswers() {
        WebTestClient client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();
        String token = AuthFilter.mint("studio", List.of("read"), "integration-test-secret-do-not-ship", 3600);

        client.get()
                .uri("/platform/services")
                .header(AuthFilter.AUTH_HEADER, "Bearer " + token)
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.services")
                .isArray();
    }

    @Test
    void platformHealthAnswersWithoutATokenEvenWhenAuthIsOn() {
        WebTestClient client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();

        client.get().uri("/platform/health").exchange().expectStatus().isOk();
    }

    @Test
    void theRefusalBodySpeaksTheSameDialectTheRouteEdgeAnswers() {
        WebTestClient client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();

        // A caller that parses the route edge's refusal must be able to parse this one — same note,
        // same shape, or a client learns two dialects for one door.
        client.get()
                .uri("/platform/services")
                .exchange()
                .expectStatus()
                .isEqualTo(401)
                .expectBody()
                .jsonPath("$.error")
                .isEqualTo("unauthorized")
                .jsonPath("$.note")
                .isEqualTo("present Authorization: Bearer <token>; /platform/health and /fallback/** are open");
    }
}
