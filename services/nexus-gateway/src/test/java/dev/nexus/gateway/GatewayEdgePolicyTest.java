package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The gateway's edge policy, on a real socket: request-size ceiling, response hardening, and — the one that
 * needs care — which HTTP methods are allowed to be retried.
 *
 * <p>Rate limiting is off in this context: its bucket is graded in {@link RateLimitFilterTest}, and leaving a
 * 2-token bucket on would turn every later request in this class into a 429.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.rate-limit.enabled=false",
            "nexus.gateway.max-request-bytes=64"
        })
class GatewayEdgePolicyTest {

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

    private WebTestClient client;

    @LocalServerPort
    private int port;

    @BeforeEach
    void reset() {
        upstream.reset();
        upstream.clearPaths();
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    @Test
    void aBodyOverTheCeilingIsRefusedAtTheDoorAndNeverForwarded() {
        String oversized = "x".repeat(200);

        client.post()
                .uri("/api/publications")
                .header("Content-Type", "application/json")
                .bodyValue("{\"title\":\"" + oversized + "\"}")
                .exchange()
                .expectStatus()
                .isEqualTo(413);

        // The point of the ceiling is that the backend never buffers the body.
        assertThat(upstream.paths()).isEmpty();
    }

    @Test
    void aForwardedAnswerCarriesTheResponseHardeningHeaders() {
        client.get()
                .uri("/api/publications?limit=1")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals("X-Content-Type-Options", "nosniff")
                .expectHeader()
                .valueEquals("X-Frame-Options", "DENY")
                .expectHeader()
                .valueEquals("Referrer-Policy", "no-referrer");
    }

    @Test
    void aGetIsRetriedOnceWhenTheBackendBrieflyFails() {
        upstream.failNextRequests(503, 1);

        client.get()
                .uri("/api/publications?limit=1")
                .exchange()
                .expectStatus()
                .isOk();

        // Two attempts: the failed one and the retry. The caller saw one successful answer.
        assertThat(upstream.paths()).hasSize(2);
    }

    @Test
    void aPostIsNotRetriedEvenWhenTheBackendFails() {
        upstream.failNextRequests(503, 1);

        client.post()
                .uri("/api/publications")
                .header("Content-Type", "application/json")
                .bodyValue("{\"title\":\"Harbour\"}")
                .exchange()
                .expectStatus()
                .isEqualTo(503);

        // A proxy that repeats a write is how one click becomes two publications. Exactly one attempt.
        assertThat(upstream.paths()).hasSize(1);
    }
}
