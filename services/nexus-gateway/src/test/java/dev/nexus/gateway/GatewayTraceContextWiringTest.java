package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * W3C Trace Context in the chain on a real socket (SC-30) — the difference between a filter class that parses
 * correctly and a bean that was never registered.
 *
 * <p>Auth and rate limiting are off so the request reaches the stub unobstructed. The stub records every header
 * it RECEIVED, so the context the backend saw and the one the caller got back can both be asserted against the
 * same value — and, crucially, that the caller's incoming parent-id was NOT forwarded unchanged (the hop rule).
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.auth.enabled=false",
            "nexus.gateway.rate-limit.enabled=false"
        })
class GatewayTraceContextWiringTest {

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
    void reset() {
        upstream.reset();
        upstream.clearPaths();
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    private static String header(Map<String, List<String>> headers, String name) {
        return headers.entrySet().stream()
                .filter(e -> e.getKey().equalsIgnoreCase(name))
                .map(e -> e.getValue().get(0))
                .findFirst()
                .orElse(null);
    }

    private String backendSaw(int requestIndex, String name) {
        return header(upstream.requestHeaders().get(requestIndex), name);
    }

    @Test
    void aMissingContextIsMintedReachesTheBackendAndIsEchoedBack() {
        String responseParent = client.get()
                .uri("/api/publications")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .exists(TraceContextFilter.TRACEPARENT)
                .returnResult(Void.class)
                .getResponseHeaders()
                .getFirst(TraceContextFilter.TRACEPARENT);

        assertThat(TraceContextFilter.parse(responseParent)).isNotNull();
        // The backend saw the SAME context the caller got back, and it is a real W3C shape.
        assertThat(backendSaw(0, TraceContextFilter.TRACEPARENT)).isEqualTo(responseParent);
    }

    @Test
    void aWellFormedParentKeepsTheTraceButThisHopReplacesTheParentId() {
        String incoming = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
        String state = "congo=t61rcWkgMzE,rojo=00f067aa0ba902b7";

        String responseParent = client.get()
                .uri("/api/publications")
                .header(TraceContextFilter.TRACEPARENT, incoming)
                .header(TraceContextFilter.TRACESTATE, state)
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .value(TraceContextFilter.TRACEPARENT, org.hamcrest.Matchers.startsWith(
                        "00-4bf92f3577b34da6a3ce929d0e0e4736-"))
                .expectHeader()
                .value(TraceContextFilter.TRACEPARENT, org.hamcrest.Matchers.endsWith("-01"))
                .returnResult(Void.class)
                .getResponseHeaders()
                .getFirst(TraceContextFilter.TRACEPARENT);

        // Same trace-id and flags: the distributed trace is still one trace.
        assertThat(responseParent).startsWith("00-4bf92f3577b34da6a3ce929d0e0e4736-").endsWith("-01");
        // But the parent-id is THIS hop's, not the caller's — the honest-shape rule.
        assertThat(TraceContextFilter.parentIdOf(responseParent))
                .isNotEqualTo("00f067aa0ba902b7");
        // The backend saw exactly what the caller got back, and tracestate survived untouched.
        assertThat(backendSaw(0, TraceContextFilter.TRACEPARENT)).isEqualTo(responseParent);
        assertThat(backendSaw(0, TraceContextFilter.TRACESTATE)).isEqualTo(state);
    }

    @Test
    void aMalformedParentIsNotPropagated() {
        String garbage = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7"; // truncated

        String responseParent = client.get()
                .uri("/api/publications")
                .header(TraceContextFilter.TRACEPARENT, garbage)
                .exchange()
                .expectStatus()
                .isOk()
                .returnResult(Void.class)
                .getResponseHeaders()
                .getFirst(TraceContextFilter.TRACEPARENT);

        assertThat(responseParent).isNotEqualTo(garbage);
        assertThat(TraceContextFilter.parse(responseParent)).isNotNull();
        assertThat(backendSaw(0, TraceContextFilter.TRACEPARENT)).isEqualTo(responseParent);
    }

    @Test
    void thePrivateCorrelationIdStillWorksAlongsideTheStandardContext() {
        // The two headers are complementary, not competing: a caller can send both and each keeps its own rule.
        client.get()
                .uri("/api/publications")
                .header("X-Request-Id", "nexus-private-42")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals("X-Request-Id", "nexus-private-42")
                .expectHeader()
                .exists(TraceContextFilter.TRACEPARENT);

        assertThat(backendSaw(0, "X-Request-Id")).isEqualTo("nexus-private-42");
        assertThat(backendSaw(0, TraceContextFilter.TRACEPARENT)).isNotNull();
    }
}
