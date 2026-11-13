package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * v670 — the edge exports its own half of the latency to the caller as a {@code Server-Timing} header.
 *
 * <p>The wire carries the signal an operator needs from a browser dev-tools window:
 *
 * <pre>
 *   Server-Timing: edge;dur=&lt;non-negative integer&gt;
 * </pre>
 *
 * <p>That shape is the W3C Timing-API-compatible form. The value is a wall-clock count the
 * filter itself recorded on this exchange — and nothing else. A hit on this test pins only
 * what the edge can own (the presence of the header and its non-negative integer shape,
 * plus a consistent pattern, so anything claiming to be a {@code Server-Timing: edge} line
 * with a different shape still fails this test).
 *
 * <p>The value (a plain integer count of milliseconds) is not asserted against a time budget;
 * the test does not depend on the machine being fast. It pins only the wire shape.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient(timeout = "30s")
class ServerTimingTests {

    private static final StubUpstream STUB = StubUpstream.start();

    @LocalServerPort
    int port;

    @Autowired
    WebTestClient client;

    @DynamicPropertySource
    static void edgeProperties(DynamicPropertyRegistry registry) {
        registry.add("NEXUS_GATEWAY_NEXUS_API_URI", () -> "http://127.0.0.1:" + STUB.port());
        registry.add("spring.data.redis.port", () -> 6399);
    }

    private static final Pattern EDGE_DUR = Pattern.compile("^edge;dur=(\\d+)$");

    @Test
    void theEdgeCarriesItsOwnDurationOnTheWire() {
        var result = client.get()
                .uri("/api/echo")
                .exchange()
                .expectStatus().is2xxSuccessful()
                .returnResult(String.class);

        List<String> timings = result.getResponseHeaders().get("Server-Timing");
        assertThat(timings)
                .as("the edge's answer to /api/echo must carry Server-Timing, or the dev-tools Network panel is silent")
                .isNotNull()
                .isNotEmpty();

        // The edge writes exactly one entry (one key, one value) in this service. If the proxy
        // ever appends its own (`edge;dur=x, downstream;dur=y`), this test still survives the
        // regex — but fails the single-entry expectation below, which was the honest shape.
        String joined = String.join(", ", timings);
        Matcher match = EDGE_DUR.matcher(joined);
        assertThat(match.matches())
                .as("Server-Timing must be exactly 'edge;dur=N' with N a millisecond count: %s", joined)
                .isTrue();

        long dur = Long.parseLong(match.group(1));
        assertThat(dur)
                .as("the edge's own duration is a real number on this host — it cannot be negative and cannot be made up")
                .isGreaterThanOrEqualTo(0);
    }
}
