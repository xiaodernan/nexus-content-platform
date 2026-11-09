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
 * That the identity check is actually IN the chain on a real socket — the difference between a filter class
 * that works and a bean that was never registered (SC-13).
 *
 * <p>The stub answers every request 200, so any 401 here can only come from the door's auth filter, and any
 * 200 to a gated path can only come from a token the filter accepted. The rate limiter is left at its
 * default (memory, 100/s) so it stays out of the way for the handful of requests this class makes.
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
class GatewayAuthWiringTest {

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

    /** Case-insensitive header read: Netty lowercases header names on the wire. */
    private static String header(Map<String, List<String>> headers, String name) {
        return headers.entrySet().stream()
                .filter(e -> e.getKey().equalsIgnoreCase(name))
                .map(e -> e.getValue().get(0))
                .findFirst()
                .orElse(null);
    }

    @Test
    void aGatedPathWithoutATokenIsRefused() {
        WebTestClient client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();

        client.get()
                .uri("/api/publications")
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
    void aGatedPathWithAValidTokenReachesTheBackend() {
        WebTestClient client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();
        String token = AuthFilter.mint("studio", List.of("read", "write"), SECRET, 3600);

        client.get()
                .uri("/api/publications")
                .header(AuthFilter.AUTH_HEADER, "Bearer " + token)
                .exchange()
                .expectStatus()
                .isOk();

        // The claims the door injected must be what the backend actually saw, not what the client claimed.
        // Order-independent: JUnit's method order is not fixed, and the health probe also hits the stub.
        // Header names are case-insensitive on the wire (Netty lowercases them), so match case-insensitively.
        var identityRequest = upstream.requestHeaders().stream()
                .filter(h -> {
                    String subject = header(h, AuthFilter.SUBJECT_HEADER);
                    return subject != null && "studio".equals(subject);
                })
                .findFirst();
        assertThat(identityRequest).isPresent();
        assertThat(header(identityRequest.get(), AuthFilter.SCOPES_HEADER))
                .isEqualTo("read,write");
    }

    @Test
    void aGatedPathWithATamperedTokenIsRefused() {
        WebTestClient client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();
        String token = AuthFilter.mint("studio", List.of("read"), SECRET, 3600);
        int dot = token.indexOf('.');
        String sig = token.substring(dot + 1);
        String tampered = token.substring(0, dot + 1) + (sig.charAt(0) == 'A' ? 'B' : 'A') + sig.substring(1);

        client.get()
                .uri("/api/publications")
                .header(AuthFilter.AUTH_HEADER, "Bearer " + tampered)
                .exchange()
                .expectStatus()
                .isEqualTo(401)
                .expectBody()
                .jsonPath("$.reason")
                .isEqualTo("bad_signature");
    }

    @Test
    void theHealthProbeIsOpenEvenWhenAuthIsOn() {
        WebTestClient client = WebTestClient.bindToServer().baseUrl("http://127.0.0.1:" + port).build();

        // The probe runs and answers 200 (it may report allUp=false because the stub has no /actuator/health);
        // the assertion that matters here is that auth did NOT turn it into a 401.
        client.get().uri("/platform/health").exchange().expectStatus().isOk();
    }
}
