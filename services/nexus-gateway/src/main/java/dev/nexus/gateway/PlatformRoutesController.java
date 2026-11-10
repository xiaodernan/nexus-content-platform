package dev.nexus.gateway;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * What the gateway will actually ROUTE, read from the live route table at the moment of the request (SC-39).
 *
 * <p>This is the platform's honest answer to "which routes are in effect right now?" — the door's own route
 * table, which until now could only be inferred by reading {@link GatewayConfig}'s source. It is the read-only
 * counterpart to a capability the gateway deliberately does NOT expose: Spring Cloud's {@code gateway}
 * actuator endpoint can CREATE, DELETE and REFRESH routes at runtime, is {@code enableByDefault=false} for
 * exactly that reason, and must stay disabled on a door whose packaged default is auth-off. This controller
 * gives operators the reading without shipping the write.
 *
 * <p><b>Single source of truth.</b> The data comes from {@link RouteLocator#getRoutes()} — the SAME locator
 * the route pipeline resolves against. It is specifically NOT {@code RouteDefinitionLocator}: this gateway's
 * routes are built by a compiled Java DSL ({@link GatewayConfig#nexusRoutes}), which produces runtime
 * {@link Route} objects without ever registering a {@code RouteDefinition}. Reading definitions here would
 * report zero routes and be a lie. Reading the locator is reading what the door is really using.
 *
 * <p><b>Honest bounds — what this readout does and does not claim:</b>
 *
 * <ul>
 *   <li><b>Only stable identity fields are reported</b> ({@code id}, {@code uri}, {@code order}). A route's
 *       request predicate and its filter chain are COMPILED function objects at runtime; Spring Cloud's own
 *       actuator endpoint can only print their {@code toString()}, not a structured expression. This
 *       controller does not pretend to expose a path template or a filter list it cannot faithfully render —
 *       audit the edge policy in {@link GatewayConfig} instead.
 *   <li><b>{@code uri} is the useful part.</b> A {@code lb://<service>} uri states which service id this route
 *       resolves through the registry + load balancer. That is the same id the breaker and bulkhead readouts
 *       name, so the three operator readouts agree instead of being three invented truths.
 *   <li><b>A service in the registry that is absent here has NO route.</b> That is the intended boundary,
 *       not a discovery locator exposing every registered service (including the registry itself). Adding a
 *       backend is a deliberate edit to {@link GatewayConfig}. The statement is a tautology — it stays true
 *       even if a deployment later enables the discovery locator, because such auto-routes would then appear
 *       here too.
 *   <li><b>Point-in-time, not a subscription.</b> {@code measuredAt} dates the snapshot; a cached answer is a
 *       fact with a date on it.
 *   <li><b>Diagnostic, not perimeter.</b> Like {@link PlatformServicesController}, this is answered inside
 *       the gateway before the route pipeline, so route edge policy (request-size / retry / rate-limit) does
 *       not apply. Auth, when enabled, guards it via {@link PlatformAuthFilter} like every other platform
 *       surface (it is deliberately not whitelisted).
 * </ul>
 */
@RestController
public class PlatformRoutesController {

    private final RouteLocator routeLocator;

    public PlatformRoutesController(RouteLocator routeLocator) {
        this.routeLocator = routeLocator;
    }

    @GetMapping("/platform/routes")
    public Mono<Map<String, Object>> routes() {
        return routeLocator.getRoutes()
                .map(PlatformRoutesController::describe)
                .collectList()
                .map(rows -> {
                    // Deterministic order so the reading is comparable run to run; route ORDER is kept as a
                    // field, but a stable id sort makes the snapshot diffable by an operator or a test.
                    rows.sort(Comparator.comparing((Map<String, Object> r) -> (String) r.get("id")));
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("measuredAt", Instant.now().toString());
                    out.put("total", rows.size());
                    out.put("routes", rows);
                    out.put(
                            "note",
                            "the live route table the gateway's own routing pipeline reads, at measuredAt; "
                                    + "routes are declared explicitly by the compiled Java DSL in GatewayConfig, and a "
                                    + "registry service absent here has NO route (no discovery locator exposing every "
                                    + "registered service). The lb:// uri names the service id resolved through the "
                                    + "registry + load balancer. HONEST BOUND: predicates and filters are compiled "
                                    + "function objects at runtime with no structured readout (Spring Cloud's own "
                                    + "actuator endpoint can only print toString()); this reports stable identity "
                                    + "fields only — read GatewayConfig to audit the edge policy.");
                    return out;
                });
    }

    /** Only what a runtime {@link Route} can state faithfully, without pretending to render its predicate. */
    private static Map<String, Object> describe(Route route) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", route.getId());
        row.put("uri", route.getUri() == null ? null : route.getUri().toString());
        row.put("order", route.getOrder());
        return row;
    }
}
