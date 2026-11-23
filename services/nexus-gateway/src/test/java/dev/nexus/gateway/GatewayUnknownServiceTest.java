package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The service is not in the registry: the door must say so, not invent an empty library.
 *
 * <p>This is a separate context on purpose. "The registry knows the service" and "it does not" are two
 * startup facts, and a test that flips one at runtime proves a mutable stub rather than the route. The only
 * difference from {@link GatewayRoutingTest} is the service id: nothing advertises it.
 */
@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "nexus.gateway.api-service=nexus-absent",
            "logging.level.root=warn"
        })
class GatewayUnknownServiceTest {

    @LocalServerPort
    int port;

    @Test
    void aServiceTheRegistryDoesNotKnowAnswers503NamingIt(CapturedOutput output) {
        WebTestClient client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(10))
                .build();

        client.get()
                .uri("/api/projects?limit=1")
                .exchange()
                .expectStatus()
                .isEqualTo(503)
                .expectBody()
                .jsonPath("$.error")
                .isEqualTo("service_unavailable")
                .jsonPath("$.service")
                .isEqualTo("nexus-absent")
                .jsonPath("$.cause")
                .isNotEmpty()
                .jsonPath("$.note")
                .isEqualTo("the gateway did not reach a result for this call; an empty list would mean something else");

        // SC-12b regression: the fallback's 503 is written by FallbackController, outside the route's retry.
        // With the retry filter outside the breaker it matched that already-written 503, retried on a
        // committed exchange, and the second write logged
        // "UnsupportedOperationException ... ServerHttpResponse already committed (503 SERVICE_UNAVAILABLE)".
        // The response stayed a correct 503, which is why only the log can catch this: a status assertion
        // alone was green while the gateway was writing a body twice.
        assertThat(output)
                .doesNotContain("UnsupportedOperationException")
                .doesNotContain("already committed");
    }
}
