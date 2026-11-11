package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * v657 — the counter is GONE, and the edge keeps its promise anyway.
 *
 * <p>The shipped route is used unchanged; the only thing this class changes is where the counter
 * would be, pointed at a port nothing listens on. That is the state a Redis restart, a wrong host, a
 * security-group mistake or a removed Sentry puts an edge in — and it is a state that must not turn
 * into a refusal, because a 429 is a claim about the CALLER (RFC 9110 §15.5.29) and nothing here
 * counted anything.
 *
 * <p>Three legs, because "it did not 429" alone is satisfied by a broken route that answers 503:
 * the request must REACH the upstream, the response must SAY it was not counted, and the metric must
 * RECORD it. A silent admission would be the worst of the three outcomes — traffic served unguarded
 * with nobody able to see it in a graph.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient(timeout = "30s")
class DegradedRateLimitTest {

    /** A port nothing is listening on: connection refused, which is what an absent Redis looks like. */
    private static final int NO_COUNTER_HERE = 6399;

    private static final StubUpstream STUB = StubUpstream.start();

    @LocalServerPort
    int port;

    @Autowired
    WebTestClient client;

    @DynamicPropertySource
    static void edgeProperties(DynamicPropertyRegistry registry) {
        registry.add("NEXUS_GATEWAY_NEXUS_API_URI", () -> "http://127.0.0.1:" + STUB.port());
        registry.add("spring.data.redis.port", () -> NO_COUNTER_HERE);
    }

    @Test
    void aCounterThatCannotBeReachedServesTheRequestAndLabelsIt() {
        var result = client.get()
                .uri("/api/echo")
                .exchange()
                .expectBody(String.class)
                .returnResult();

        assertThat(result.getStatus().value())
                .as("429 would be a lie: the edge did not count anything, so it cannot claim the caller sent too much")
                .isNotEqualTo(429);
        assertThat(result.getStatus().is2xxSuccessful())
                .as("an unreachable COUNTER is not an unreachable UPSTREAM; the request must still be served, and the edge answered %s with %s",
                        result.getStatus(), result.getResponseBody())
                .isTrue();
        assertThat(result.getResponseBody())
                .as("and it must have actually crossed the edge to the service behind it")
                .isEqualTo("STUB-OK /echo");
        assertThat(result.getResponseHeaders().getFirst("X-Nexus-RateLimit"))
                .as("the caller must be able to tell an unguarded 200 from a counted one")
                .isEqualTo("unavailable");
    }

    @Test
    void theDegradationIsAlsoInTheMetricsSoItIsVisibleWithoutReadingLogs() {
        // One request first, so the counter has something to report regardless of test order.
        client.get().uri("/api/echo").exchange().expectStatus().is2xxSuccessful();

        var metric = client.get()
                .uri("/actuator/metrics/nexus.edge.rate_limit.degraded")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody(String.class)
                .returnResult()
                .getResponseBody();

        assertThat(metric)
                .as("a metric an operator cannot find is a metric that does not exist: %s", metric)
                .contains("nexus.edge.rate_limit.degraded")
                .contains("measurements");
        assertThat(numericValueOf(metric))
                .as("the metric must COUNT the unguarded requests, not merely exist: %s", metric)
                .isGreaterThanOrEqualTo(1.0);
    }

    /** Reads the first `"value":<number>` out of the metrics endpoint's answer. */
    private static double numericValueOf(String metricJson) {
        var matcher = java.util.regex.Pattern.compile("\"value\"\\s*:\\s*([0-9.]+)").matcher(metricJson);
        return matcher.find() ? Double.parseDouble(matcher.group(1)) : -1.0;
    }
}
