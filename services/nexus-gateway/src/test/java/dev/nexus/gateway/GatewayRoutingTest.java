package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * The gateway graded on the wire, against a real upstream socket.
 *
 * <p>What this class is allowed to claim: the route matches, the prefix is stripped on the request the
 * BACKEND receives, a backend answer is passed through unchanged, and every way of not reaching a result
 * answers 503 with a body that says so. What it deliberately does not claim: that Eureka is healthy (that
 * is {@code nexus-registry}'s own test), or that {@code nexus-api} serves those paths (its own tests do).
 *
 * <p>The registry is a {@code SimpleDiscoveryClient} entry pointing at a real socket, not a mock of
 * {@code WebClient}. A gateway that routes correctly to a mock has not been shown to put bytes on a wire;
 * this one's assertions include the PATH the stub actually received. Eureka is disabled for the same
 * reason: a test that starts a second service to test the first cannot say which one broke.
 *
 * <p>Two settings exist only to make the legs independent rather than order-dependent:
 * {@code spring.cloud.loadbalancer.cache.enabled=false} so the advertised address is read on every call,
 * and a breaker window large enough that an earlier failure cannot open the circuit for a later leg.
 * {@link #resetBreakers()} additionally clears whatever the previous leg recorded.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "resilience4j.timelimiter.instances.nexus-api.timeout-duration=800ms",
            "resilience4j.circuitbreaker.instances.nexus-api.sliding-window-size=100",
            "resilience4j.circuitbreaker.instances.nexus-api.minimum-number-of-calls=100",
            "logging.level.root=warn"
        })
class GatewayRoutingTest {

    /** Started before the context so their OS-chosen ports can be written into the discovery properties. */
    private static StubUpstream apiUpstream;

    private static StubUpstream domainUpstream;

    @DynamicPropertySource
    static void advertiseTheStubs(DynamicPropertyRegistry registry) {
        apiUpstream = StubUpstream.start();
        domainUpstream = StubUpstream.start();
        domainUpstream.answer(200, "{\"projects\":[],\"from\":\"domain-stub\"}");
        registry.add("spring.cloud.discovery.client.simple.instances.nexus-api[0].uri", apiUpstream::uri);
        registry.add(
                "spring.cloud.discovery.client.simple.instances.nexus-domain-service[0].uri", domainUpstream::uri);
    }

    @AfterAll
    static void stopStubs() {
        if (apiUpstream != null) {
            apiUpstream.stop();
        }
        if (domainUpstream != null) {
            domainUpstream.stop();
        }
    }

    @LocalServerPort
    int port;

    @Autowired
    CircuitBreakerRegistry breakers;

    private WebTestClient client;

    @BeforeEach
    void reset() {
        resetBreakers();
        for (StubUpstream stub : List.of(apiUpstream, domainUpstream)) {
            stub.reset();
            stub.clearPaths();
        }
        domainUpstream.answer(200, "{\"projects\":[],\"from\":\"domain-stub\"}");
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    private void resetBreakers() {
        for (CircuitBreaker breaker : breakers.getAllCircuitBreakers()) {
            breaker.reset();
        }
    }

    @Test
    void theRouteMatchesAndTheBackendNeverSeesTheGatewayPrefix() {
        client.get()
                .uri("/api/publications?limit=2")
                .exchange()
                .expectStatus()
                .isOk()
                .expectHeader()
                .valueEquals("X-Stub-Upstream", "nexus-api")
                .expectBody()
                .jsonPath("$.from")
                .isEqualTo("stub-upstream");

        // The whole point of StripPrefix is the request the backend actually RECEIVED, not the URL the test
        // typed. `/api/publications` must arrive as `/publications`, query string intact.
        assertThat(apiUpstream.paths()).containsExactly("/publications?limit=2");

        // The gateway also tells the backend which address the CLIENT used. Without it a receipt built from
        // the backend's own view names an internal instance address the client cannot open.
        // NOT asserted on X-Forwarded-Host: the framework's header filter rewrites that one after us
        // (measured: the stub received an empty string), which is why the gateway also sets a header of its own.
        assertThat(apiUpstream.probeHeaders()).containsExactly("1");
        assertThat(apiUpstream.originalUrls()).containsExactly("http://127.0.0.1:" + port);
    }

    @Test
    void aBackendErrorIsPassedThroughInsteadOfBecomingAnEmptySuccess() {
        apiUpstream.answer(500, "{\"error\":\"boom\",\"from\":\"stub-upstream\"}");

        client.get()
                .uri("/api/publications")
                .exchange()
                .expectStatus()
                .isEqualTo(500)
                .expectBody()
                .jsonPath("$.error")
                .isEqualTo("boom");

        // A 5xx is a response, not a transport failure: the breaker filter must not turn it into a fallback.
        assertThat(apiUpstream.paths()).containsExactly("/publications");
    }

    @Test
    void aBackendThatOutlivesTheTimeLimitAnswers503NamingTheFailure() {
        client.get()
                .uri("/api/slow")
                .exchange()
                .expectStatus()
                .isEqualTo(503)
                .expectBody()
                .jsonPath("$.error")
                .isEqualTo("service_unavailable")
                .jsonPath("$.service")
                .isEqualTo("nexus-api")
                .jsonPath("$.note")
                .isEqualTo("the gateway did not reach a result for this call; an empty list would mean something else")
                // The cause comes from what the breaker actually recorded. Asserting a specific exception
                // class would pin a library detail; asserting it was NOT invented is the claim that matters.
                .jsonPath("$.cause")
                .value(cause -> assertThat((String) cause).isNotEqualTo("not-reported"));
    }

    @Test
    void aBackendThatDropsTheConnectionAnswers503NotAnEmptyList() {
        client.get()
                .uri("/api/drop")
                .exchange()
                .expectStatus()
                .isEqualTo(503)
                .expectBody()
                .jsonPath("$.error")
                .isEqualTo("service_unavailable")
                .jsonPath("$.cause")
                .value(cause -> assertThat((String) cause).isNotEqualTo("not-reported"));
    }

    @Test
    void theDomainRouteReachesTheSecondBackendAndStripsOnlyItsOwnPrefix() {
        client.get()
                .uri("/domain/api/v1/projects/abc")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.from")
                .isEqualTo("domain-stub");

        // Two backends, two sockets: the domain call must reach the DOMAIN stub and must NOT have been routed
        // to the api stub. The semantic claim is "this path did not go to the wrong backend", so we assert the
        // DOMAIN path is absent from apiUpstream. Asserting apiUpstream is entirely EMPTY was a stronger claim
        // than the test can keep: aBackendThatDropsTheConnectionAnswers503NotAnEmptyList retries its /drop GET,
        // and under full-suite load that retry's 2nd wire attempt can land after the prior test returned and
        // after @BeforeEach cleared paths — leaving a harmless "/drop" that is about THIS test's routing.
        // Prefix isolation catches the real bug (a route table sending /domain/** to nexus-api) without being
        // tripped by an in-flight tail from a different method.
        assertThat(domainUpstream.paths()).containsExactly("/api/v1/projects/abc");
        assertThat(apiUpstream.paths()).doesNotContain("/api/v1/projects/abc");
        assertThat(domainUpstream.originalUrls()).containsExactly("http://127.0.0.1:" + port);
    }

    @Test
    @SuppressWarnings("unchecked")
    void theServicesReadoutNamesWhatTheRegistryHoldsAndSaysItIsNotAHealthCheck() {
        client.get()
                .uri("/platform/services")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.total")
                .isEqualTo(2)
                // Order is the registry's, not ours: assert membership, not positions.
                .jsonPath("$.services[*].id")
                .value(ids -> assertThat((List<String>) ids).contains("nexus-api", "nexus-domain-service"))
                .jsonPath("$.services[?(@.id == 'nexus-api')].addresses[0]")
                .value(addresses -> assertThat((List<?>) addresses)
                        .anySatisfy(address -> assertThat((String) address).contains(":" + apiUpstream.port())))
                .jsonPath("$.services[?(@.id == 'nexus-domain-service')].addresses[0]")
                .value(addresses -> assertThat((List<?>) addresses)
                        .anySatisfy(address -> assertThat((String) address).contains(":" + domainUpstream.port())))
                .jsonPath("$.note")
                .value(note -> assertThat((String) note).contains("not a health check"));

        // The readout is a directory lookup, not a routed call: it must not reach either backend.
        assertThat(apiUpstream.paths()).isEmpty();
        assertThat(domainUpstream.paths()).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void withNoDiscoveryClientAtAllTheReadoutSaysSoInsteadOfInventingRows() {
        ObjectProvider<DiscoveryClient> none = mock(ObjectProvider.class);
        when(none.getIfAvailable()).thenReturn(null);

        Map<String, Object> answer = new PlatformServicesController(none).services();

        assertThat(answer.get("source")).isEqualTo("none");
        assertThat(answer.get("total")).isEqualTo(0);
        assertThat((List<?>) answer.get("services")).isEmpty();
        assertThat((String) answer.get("note")).contains("no discovery client");
        assertThat(answer.get("measuredAt")).isInstanceOf(String.class);
    }
}
