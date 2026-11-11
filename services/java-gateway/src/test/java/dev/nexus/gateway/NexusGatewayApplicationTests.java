package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The edge's two contracts, proved against the SHIPPED route table.
 *
 * <p>Both cases use the route that ships in {@code application.yml} — {@code /api/**} in front of
 * {@code nexus-api} — and change only the upstream ADDRESS through the same environment variable an
 * operator would set. Nothing here adds a test-only route: a test that exercises a route the
 * product does not have proves the test, not the product.
 *
 * <p>The order is pinned because the second case makes the upstream ABSENT by stopping it. Stopping
 * the stub is how "the service behind the edge is gone" is produced without inventing a second route
 * or a mock that keeps answering after the fact — a mock upstream would keep answering, and the
 * behaviour under test is precisely the case where nothing answers.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient(timeout = "30s")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class NexusGatewayApplicationTests {

    private static final StubUpstream STUB = StubUpstream.start();

    @LocalServerPort
    int port;

    @Autowired
    WebTestClient client;

    /**
     * Point the SHIPPED route at the stub, through the shipped property name.
     *
     * <p>This is the same {@code NEXUS_GATEWAY_NEXUS_API_URI} the deployed service reads, so the
     * route under test is the route that ships — the address is the only thing that changed.
     */
    @DynamicPropertySource
    static void edgeProperties(DynamicPropertyRegistry registry) {
        registry.add("NEXUS_GATEWAY_NEXUS_API_URI", () -> "http://127.0.0.1:" + STUB.port());
        // v657 — this class is about FORWARDING and about an absent UPSTREAM. The rate limiter's
        // counter is pinned to a port nothing listens on so that "no counter" is a fact of the test
        // rather than a fact of the machine: the decorated limiter admits under a labelled
        // degradation, and the two legs below keep asserting exactly what they asserted before.
        // Without this, the same test would pass on a host with a Redis and fail on one without —
        // or worse, pass for a different reason on each.
        registry.add("spring.data.redis.port", () -> 6399);
    }

    @Test
    @Order(1)
    void theEdgeForwardsToTheServiceBehindItAndAppliesItsOwnPathRules() {
        var result = client.get()
                .uri("/api/echo")
                .exchange()
                .expectBody(String.class)
                .returnResult();

        // The upstream names the path IT was asked for. The edge's `StripPrefix=1` removed `/api`, so
        // the upstream saw `/echo` — a broken prefix rule would show up here as `/api/echo`.
        assertThat(result.getStatus())
                .as("the edge's own answer was: %s", result.getResponseBody())
                .isEqualTo(org.springframework.http.HttpStatus.OK);
        assertThat(result.getResponseBody()).isEqualTo("STUB-OK /echo");
    }

    @Test
    @Order(2)
    void whenTheServiceBehindItIsAbsentTheEdgeSaysSoAndInventsNothing() {
        STUB.stop();

        var result = client.get()
                .uri("/api/echo")
                .exchange()
                .expectStatus()
                .isEqualTo(503)
                .expectBody(String.class)
                .returnResult();

        String body = result.getResponseBody();
        assertThat(body)
                .as("the edge's own answer must name the failure; an empty 200 would be indistinguishable from 'no such project'")
                .contains("\"ok\":false")
                .contains("\"reason\":\"upstream-unavailable\"")
                .contains("\"upstream\":\"nexus-api\"")
                // The upstream was there and is gone: the connection was refused. That is a
                // different fact from "the breaker was open" and from "there is no upstream to
                // route to", and the edge can tell them apart — so it says which.
                .contains("\"failure\":\"connection-refused\"");
        assertThat(body)
                .as("and the detail must name the upstream too, not just the failure")
                .contains("the gateway could not reach nexus-api");
    }
}
