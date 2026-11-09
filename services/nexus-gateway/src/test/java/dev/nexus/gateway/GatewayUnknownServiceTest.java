package dev.nexus.gateway;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The service is not in the registry: the door must say so, not invent an empty library.
 *
 * <p>This is a separate context on purpose. "The registry knows the service" and "it does not" are two
 * startup facts, and a test that flips one at runtime proves a mutable stub rather than the route. The only
 * difference from {@link GatewayRoutingTest} is the service id: nothing advertises it.
 */
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
    void aServiceTheRegistryDoesNotKnowAnswers503NamingIt() {
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
    }
}
