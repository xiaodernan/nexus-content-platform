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
      // Spring Boot's TEST support turns metrics export off for every test context
      // (`management.defaults.metrics.export.enabled=false`), and the scrape leg below needs it on.
      // Measured 2026-11-10: without this line the condition report says exactly that, no
      // `PrometheusMeterRegistry` bean exists, and `/actuator/prometheus` falls through to this
      // server's own `/{application}/{profile}` route and answers the shared document instead of a
      // scrape. This is the TEST's switch; the shipped configuration is not touched by it.
      "management.prometheus.metrics.export.enabled=true",
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
        assertThat(answer.getBody()).contains("health,info,metrics,prometheus");
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

    /**
     * The scrape, on the SAME port the product route uses.
     *
     * <p>This is the leg ADR 0056's amendment 658 owes: the shared config document tells every service
     * to expose {@code prometheus}, and this deployable tells the same story about itself. The one way
     * this could be a lie is the collision the config server's own routing invites — its product route
     * is {@code /{application}/{profile}}, which is also two segments, so a request for
     * {@code /actuator/prometheus} would match it if the actuator had no mapping of its own. Measured
     * here rather than reasoned about: with {@code prometheus} absent from the exposure list the request
     * answered the shared document for an application named "actuator" (200, wrong body); with it
     * listed, the exact mapping wins and this assertion reads a scrape.
     *
     * <p>The assertion is on the FORMAT, not on a metric name: a body that says {@code # HELP} or carries
     * a {@code jvm_} series is a body a scraper can read, and that is the whole claim.
     */
    @Test
    void actuatorPrometheusAnswersTheScrapeOnTheSamePortAsTheProductRoute() {
        ResponseEntity<String> answer = rest.getForEntity(url("/actuator/prometheus"), String.class);

        assertThat(answer.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(answer.getBody())
                .as("a 200 is not a scrape; the body must be in the exposition format")
                .matches(body -> body != null && (body.contains("# HELP") || body.contains("jvm_")));
    }


    private String url(String path) {
        return "http://127.0.0.1:" + port + path;
    }
}
