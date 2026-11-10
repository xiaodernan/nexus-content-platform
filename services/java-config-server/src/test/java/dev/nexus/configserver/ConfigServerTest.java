package dev.nexus.configserver;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * The config server's own end-to-end door, graded on what it actually SERVES.
 *
 * <p>No mocks: the test starts the server on a random port and resolves the same YAMLs the
 * deployment would resolve. It fails if the file layout drifts, if a key disappears, or if the
 * actuator door claims something it does not do.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.cloud.config.server.native.search-locations=file:../../infra/config/",
    })
class ConfigServerTest {

    @LocalServerPort
    private int port;

    private final TestRestTemplate rest = new TestRestTemplate();

    @Test
    void applicationDefaultServesTheSharedFourServiceConfig() {
        ResponseEntity<String> answer = rest.getForEntity(url("/application/default"), String.class);

        assertThat(answer.getStatusCode()).isEqualTo(HttpStatus.OK);
        // The shared config is what the OTHER three services need to start with health/metrics up.
        assertThat(answer.getBody()).contains("health,info,metrics");
        assertThat(answer.getBody()).contains("config-server-served");
    }

    @Test
    void nexusApiDefaultServesTheServiceOwnKey() {
        ResponseEntity<String> answer = rest.getForEntity(url("/nexus-api/default"), String.class);

        assertThat(answer.getStatusCode()).isEqualTo(HttpStatus.OK);
        // The service-specific overlay is loaded for THIS application; a copy-paste error in the
        // config server's own property resolution would leave it out.
        assertThat(answer.getBody()).contains("dev.nexus.api");
    }

    @Test
    void aServiceAskingForAnotherServicesKeyDoesNotGetIt() {
        // isolation is the property that keeps a service from being reconfigured by another's edits.
        ResponseEntity<String> answer = rest.getForEntity(url("/nexus-registry/default"), String.class);

        assertThat(answer.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(answer.getBody()).contains("dev.nexus.registry");
        assertThat(answer.getBody()).doesNotContain("dev.nexus.api");
    }

    @Test
    void actuatorHealthAnswersTheDoorIsAnswering() {
        ResponseEntity<String> answer = rest.getForEntity(url("/actuator/health"), String.class);

        assertThat(answer.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(answer.getBody()).contains("\"status\":\"UP\"");
    }

    private String url(String path) {
        return "http://127.0.0.1:" + port + path;
    }
}
