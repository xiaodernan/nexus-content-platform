package dev.nexus.gateway;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * That the bucket is actually IN the chain — the difference between a filter class that works and a filter
 * bean that was never registered.
 *
 * <p>The rate is 0 so tokens never refill and the burst of 2 is an exact count rather than a race. A 429 here
 * can only come from the limiter: the upstream stub answers every request 200.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.rate-limit.enabled=true",
            "nexus.gateway.rate-limit.rate-per-second=0",
            "nexus.gateway.rate-limit.burst=2"
        })
class GatewayRateLimitWiringTest {

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
    void theThirdRequestInABurstOfTwoIsRefusedByTheGateway() {
        WebTestClient client =
                WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();

        client.get().uri("/api/publications").exchange().expectStatus().isOk();
        client.get().uri("/api/publications").exchange().expectStatus().isOk();
        client.get()
                .uri("/api/publications")
                .exchange()
                .expectStatus()
                .isEqualTo(429)
                .expectHeader()
                .valueEquals("Retry-After", "1")
                .expectBody()
                .jsonPath("$.error")
                .isEqualTo("rate_limited");
    }
}
