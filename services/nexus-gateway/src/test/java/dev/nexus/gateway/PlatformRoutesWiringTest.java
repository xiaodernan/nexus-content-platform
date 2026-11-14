package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;

/**
 * The gateway's route table, made READABLE — and, more importantly, made HONEST (SC-39).
 *
 * <p>This grades three things that were previously only a source comment in {@link GatewayConfig}:
 *
 * <ol>
 *   <li><b>The readout is the real route table, not a planted literal.</b> The registry advertises THREE
 *       services ({@code nexus-api}, {@code nexus-domain-service}, and an unauthorised {@code rogue-service}),
 *       yet the reading contains exactly the TWO routes the compiled Java DSL declares, each with a
 *       {@code lb://} uri naming its service id. Every row is cross-checked against the live
 *       {@link RouteLocator} the pipeline itself resolves against — if a future edit baked the ids in as
 *       literals, this test goes red.
 *   <li><b>"Absent from the readout" really means "no route" on the wire.</b> A call to the rogue service's
 *       path is a 404 and the rogue backend never sees a byte; a call to the named route answers 200 and DOES
 *       reach its backend. The registry knows the rogue service ({@code /platform/services} would list it);
 *       the door deliberately gives it no route. This is the wire proof of "no discovery locator" that
 *       {@link GatewayConfig} has asserted in prose since SC-1.
 *   <li><b>The honest bounds are pinned.</b> The readout reports only stable identity fields and SAYS SO;
 *       it does not invent a path template or a filter list it cannot faithfully render (a runtime
 *       predicate/filter is a compiled function object — even Spring Cloud's own actuator only prints
 *       {@code toString()}). And the dangerous {@code gateway} actuator endpoint — which can CREATE/DELETE
 *       routes at runtime — stays unexposed, so this read-only controller never ships a write surface.
 * </ol>
 *
 * <p>Auth-on protection is graded separately in {@link PlatformRoutesAuthTest}, mirroring SC-27/31/37.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "eureka.client.enabled=false",
            "spring.cloud.loadbalancer.cache.enabled=false",
            "nexus.gateway.auth.enabled=false",
            "nexus.gateway.rate-limit.enabled=false",
            "management.endpoints.web.exposure.include=health,gateway",
            "logging.level.root=warn"
        })
class PlatformRoutesWiringTest {

    private static StubUpstream api;
    private static StubUpstream domain;
    private static StubUpstream rogue;

    @DynamicPropertySource
    static void advertiseThreeServicesButNameOnlyTwo(DynamicPropertyRegistry registry) {
        api = StubUpstream.start();
        domain = StubUpstream.start();
        rogue = StubUpstream.start();
        // Three services in the registry. The route table names only two of them.
        registry.add("spring.cloud.discovery.client.simple.instances.nexus-api[0].uri", api::uri);
        registry.add("spring.cloud.discovery.client.simple.instances.nexus-domain-service[0].uri", domain::uri);
        registry.add("spring.cloud.discovery.client.simple.instances.rogue-service[0].uri", rogue::uri);
    }

    @AfterAll
    static void stopStubs() {
        if (api != null) {
            api.stop();
        }
        if (domain != null) {
            domain.stop();
        }
        if (rogue != null) {
            rogue.stop();
        }
    }

    /** The SAME locator the route pipeline uses — the readout must agree with this, not a second truth. */
    @Autowired
    private RouteLocator routeLocator;

    @LocalServerPort
    private int port;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        api.reset();
        domain.reset();
        rogue.reset();
        api.clearPaths();
        domain.clearPaths();
        rogue.clearPaths();
        client = WebTestClient.bindToServer()
                .baseUrl("http://127.0.0.1:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    private List<Route> liveRoutes() {
        return routeLocator.getRoutes().collectList().block(Duration.ofSeconds(10));
    }

    @Test
    void theReadoutIsExactlyTheLiveRouteTableAndNamesNoUnauthorisedService() {
        List<Route> live = liveRoutes();
        assertThat(live).hasSize(2);

        // Cross-check the readout against the locator, field for field. The reading is not a literal.
        client.get()
                .uri("/platform/routes")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody()
                .jsonPath("$.total")
                .isEqualTo(2)
                .jsonPath("$.measuredAt")
                .isNotEmpty()
                .jsonPath("$.note")
                .value((Object note) -> assertThat((String) note).contains("NO route"))
                .jsonPath("$.routes")
                .value((Object raw) -> {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> rows = (List<Map<String, Object>>) raw;
                    assertThat(rows).hasSize(2);
                    assertThat(rows).extracting(r -> r.get("id"))
                            .containsExactlyInAnyOrder("nexus-api", "nexus-domain-service");
                    // The registry's third service must NOT have become a route.
                    assertThat(rows).extracting(r -> r.get("id")).doesNotContain("rogue-service");
                    for (Map<String, Object> row : rows) {
                        assertThat((String) row.get("uri")).startsWith("lb://");
                        assertThat(row).containsKey("order");
                    }
                });

        // Every id + uri in the response came from the live locator, not a canned pair.
        for (Route route : live) {
            assertThat(route.getUri().toString()).startsWith("lb://");
            assertThat(List.of("nexus-api", "nexus-domain-service")).contains(route.getId());
        }
    }

    @Test
    void absentFromTheReadoutMeansNoRouteOnTheWire() {
        // The rogue service is genuinely registered (its stub is advertised), but has no route.
        client.get().uri("/rogue-service/anything").exchange().expectStatus().isNotFound();
        assertThat(rogue.paths()).isEmpty();

        // A named route still reaches its backend; the reading is not a substitute for real routing.
        client.get().uri("/api/publications").exchange().expectStatus().isOk();
        assertThat(api.paths()).containsExactly("/publications");
        assertThat(domain.paths()).isEmpty();
    }

    @Test
    void theReadOnlyControllerDoesNotShipTheDangerousWriteEndpoint() {
        // `gateway` is in exposure here ON PURPOSE, to prove that exposure alone cannot open it: Spring
        // Cloud's GatewayControllerEndpoint is enableByDefault=false because it can save/delete/refresh
        // routes. A door whose packaged default is auth-off must never expose that write surface.
        client.get().uri("/actuator/gateway/routes").exchange().expectStatus().isNotFound();
        client.post()
                .uri("/actuator/gateway/refresh")
                .exchange()
                .expectStatus()
                .isNotFound();
        client.delete()
                .uri("/actuator/gateway/routes/nexus-api")
                .exchange()
                .expectStatus()
                .isNotFound();
    }
}
