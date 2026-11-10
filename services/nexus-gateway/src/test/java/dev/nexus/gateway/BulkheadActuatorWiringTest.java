package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The bulkhead's operator readout (SC-37) — the capacity half of §SC-31's breaker readout.
 *
 * <p>The gateway has carried a bulkhead on every route since Spring Cloud wired its reactive
 * {@code BulkheadProvider} by default; it was simply invisible. Exposing {@code /actuator/bulkheads} makes
 * "which backends have a capacity bound" an operator fact instead of a library default. This class grades
 * the exposed endpoint on a real socket and records its HONEST shape:
 *
 * <ul>
 *   <li>it lists the bulkhead ids the route table declares — the same {@code setName(service)} ids the
 *       breaker and the wire test use, so the readout is not a second invented truth. Declaring a bound in
 *       application.yml registers it at boot; the list does not depend on traffic having flowed;
 *   <li><b>it exposes names only, not live occupancy.</b> resilience4j 2.2.0's {@code BulkheadEndpoint} has no
 *       per-id detail operation (measured: {@code /actuator/bulkheads/nexus-api} is 404) and no in-flight
 *       counter. The test pins that boundary on purpose, so nobody later mistakes this name list for a
 *       capacity metric. In-flight behaviour is graded on the wire by {@link GatewayBulkheadWiringTest}.
 * </ul>
 *
 * <p>Protection when auth is enabled is graded separately in {@link BulkheadActuatorAuthTest}.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.auth.enabled=false",
            "nexus.gateway.rate-limit.enabled=false",
            "management.endpoints.web.exposure.include=health,circuitbreakers,bulkheads",
            "logging.level.root=warn"
        })
class BulkheadActuatorWiringTest {

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
    void setUp() {
        upstream.reset();
        upstream.clearPaths();
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    @Test
    void theReadoutListsTheWiredBulkheadIdsAndNothingInvented() {
        // application.yml now declares a bulkhead instance for BOTH routes, so both ids are in the registry
        // from boot — declaring the bound registers it, independent of whether a call has been routed yet.
        // The readout is the SAME registry the routes use, not a second invented truth.
        client.get()
                .uri("/actuator/bulkheads")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.bulkheads.length()")
                .isEqualTo(2)
                .jsonPath("$.bulkheads")
                .value((Object ids) -> {
                    @SuppressWarnings("unchecked")
                    java.util.List<String> names = (java.util.List<String>) ids;
                    assertThat(names).containsExactlyInAnyOrder("nexus-api", "nexus-domain-service");
                });
    }

    @Test
    void aRoutedCallDoesNotChangeTheReadoutBecauseBothBoundsAreDeclared() {
        // Contrast with the breaker's laziness: those bulkheads exist because they are CONFIGURED, so a call
        // adds no new id. This pins the honest shape — a name list of declared bounds, not a live occupancy
        // gauge that ticks with traffic (resilience4j 2.2.0 has no such counter to expose anyway).
        client.get().uri("/api/publications").exchange().expectStatus().isOk();
        assertThat(upstream.paths()).containsExactly("/publications");

        client.get()
                .uri("/actuator/bulkheads")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.bulkheads.length()")
                .isEqualTo(2);
    }

    @Test
    void thereIsNoPerNameDetailOperationSoTheNameListIsNotMistakenForOccupancy() {
        client.get().uri("/api/publications").exchange().expectStatus().isOk();

        // HONEST BOUND, pinned: resilience4j 2.2.0 ships no /actuator/bulkheads/{id}. A future dependency
        // bump that ADDS one is a welcome change and SHOULD turn this test red — that is the signal to update
        // the ADR, not a flake to delete. Until then, no live in-flight count exists to read here.
        client.get()
                .uri("/actuator/bulkheads/nexus-api")
                .exchange()
                .expectStatus()
                .isNotFound();
    }
}
