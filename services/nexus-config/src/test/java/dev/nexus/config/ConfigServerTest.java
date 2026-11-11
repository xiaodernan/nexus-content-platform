package dev.nexus.config;

import static org.hamcrest.Matchers.containsString;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * Grades the contract a client depends on: the environment document exists, the application file is merged
 * under the shared one, and the values are the ones in the repository — not defaults.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"logging.level.root=warn"})
class ConfigServerTest {

    @LocalServerPort
    int port;

    private WebTestClient client;

    @BeforeEach
    void setUp() {
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .build();
    }

    @Test
    void theGatewayDocumentCarriesTheCentralRateAndTheSharedFile() {
        client.get()
                .uri("/nexus-gateway/default")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.name")
                .isEqualTo("nexus-gateway")
                .jsonPath("$.propertySources.length()")
                .isEqualTo(2)
                .jsonPath("$.propertySources[0].name")
                .value(containsString("nexus-gateway.yml"))
                .jsonPath("$.propertySources[0].source['nexus.gateway.rate-limit.rate-per-second']")
                .isEqualTo(50)
                .jsonPath("$.propertySources[1].source['management.endpoints.web.exposure.include']")
                .isEqualTo("health,info");
    }

    @Test
    void theApiDocumentIsTheLabRegistrationTruth() {
        client.get()
                .uri("/nexus-api/default")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.name")
                .isEqualTo("nexus-api")
                .jsonPath("$.propertySources.length()")
                .isEqualTo(2)
                .jsonPath("$.propertySources[0].name")
                .value(containsString("nexus-api.yml"))
                .jsonPath("$.propertySources[0].source['eureka.client.register-with-eureka']")
                .isEqualTo(true);
    }

    @Test
    void theDomainDocumentIsTheLabRegistrationTruth() {
        client.get()
                .uri("/nexus-domain-service/default")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.name")
                .isEqualTo("nexus-domain-service")
                .jsonPath("$.propertySources[0].name")
                .value(containsString("nexus-domain-service.yml"))
                .jsonPath("$.propertySources[0].source['eureka.client.register-with-eureka']")
                .isEqualTo(true);
    }

    @Test
    void theSharedDocumentIsServedOnItsOwn() {
        client.get()
                .uri("/application/default")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.propertySources[0].source['management.endpoint.health.show-details']")
                .isEqualTo("never");
    }

    @Test
    void anApplicationWithoutAFileStillAnswersWithTheSharedDocument() {
        client.get()
                .uri("/no-such-application/default")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.propertySources.length()")
                .isEqualTo(1)
                .jsonPath("$.propertySources[0].name")
                .value(containsString("application.yml"));
    }
}
