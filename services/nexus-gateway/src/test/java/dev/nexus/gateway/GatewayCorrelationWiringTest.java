package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * That the correlation id is actually IN the chain on a real socket (SC-14) — the difference between a filter
 * class that works and a bean that was never registered.
 *
 * <p>Auth and rate limiting are off so the request reaches the stub unobstructed; the stub records every
 * header it received, so the id the backend saw and the id the caller got back can both be asserted against
 * the same generated value.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.auth.enabled=false",
            "nexus.gateway.rate-limit.enabled=false"
        })
class GatewayCorrelationWiringTest {

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

    private static String requestId(Map<String, List<String>> headers) {
        return headers.entrySet().stream()
                .filter(e -> e.getKey().equalsIgnoreCase(CorrelationFilter.REQUEST_ID_HEADER))
                .map(e -> e.getValue().get(0))
                .findFirst()
                .orElse(null);
    }

    @Test
    void aMissingIdIsGeneratedAndEchoedBack() {
        WebTestClient client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();

        String responseId = client.get()
                .uri("/api/publications")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .exists(CorrelationFilter.REQUEST_ID_HEADER)
                .returnResult(Void.class)
                .getResponseHeaders()
                .getFirst(CorrelationFilter.REQUEST_ID_HEADER);

        assertThat(responseId).isNotNull();
        assertThat(CorrelationFilter.isValidId(responseId)).isTrue();
        // The backend saw the SAME id the caller got back — that is the whole point of a correlation id.
        assertThat(upstream.requestHeaders().stream().map(GatewayCorrelationWiringTest::requestId))
                .anyMatch(responseId::equals);
    }

    @Test
    void aSuppliedIdIsHonouredEndToEnd() {
        WebTestClient client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();

        client.get()
                .uri("/api/publications")
                .header(CorrelationFilter.REQUEST_ID_HEADER, "caller-trace-9")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals(CorrelationFilter.REQUEST_ID_HEADER, "caller-trace-9");

        assertThat(upstream.requestHeaders().stream().map(GatewayCorrelationWiringTest::requestId))
                .anyMatch("caller-trace-9"::equals);
    }
}
