package dev.nexus.gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.server.ServerWebExchange;

/**
 * The route table, in Java.
 *
 * <p>Why not YAML: the Gateway 4.2+ line moved {@code spring.cloud.gateway.*} to
 * {@code spring.cloud.gateway.server.webflux.*}. A route table written against a prefix a dependency bump
 * renames does not fail — it stops matching, and every request answers 404 from a gateway that started
 * cleanly. The DSL below is compiled, so the same rename is a build error.
 *
 * <p>Why ONE route and not the discovery locator: {@code discovery.locator.enabled} publishes
 * {@code /{serviceId}/**} for EVERY service in the registry, including the registry itself and anything
 * somebody registers later. That turns "can reach the registry" into "can reach every backend", which is an
 * authorisation decision this slice has not made. Adding a backend is a deliberate edit here.
 *
 * <p>{@code lb://} is the discovery half: the host is a SERVICE ID, resolved through the registry and the
 * load balancer, so two instances of {@code nexus-api} are two addresses the gateway can choose between
 * without anybody editing a config file.
 */
@Configuration
public class GatewayConfig {

    @Bean
    RouteLocator nexusRoutes(
            RouteLocatorBuilder builder,
            @Value("${nexus.gateway.api-service:nexus-api}") String service,
            @Value("${nexus.gateway.api-prefix:/api}") String prefix) {
        // "/api" is one segment; a prefix of "/platform/api" would be two, and stripping one would leave
        // the backend answering a path it never published.
        int segments = (int) java.util.Arrays.stream(prefix.split("/")).filter((s) -> !s.isEmpty()).count();
        String fallback = "forward:/fallback/" + service;
        return builder.routes()
                .route(service, r -> r.path(prefix + "/**")
                        .filters(f -> f.stripPrefix(segments)
                                .circuitBreaker(c -> c.setName(service).setFallbackUri(fallback)))
                        .uri("lb://" + service))
                .build();
    }

    /**
     * Tells the backend which address the CLIENT used.
     *
     * <p>Receipts are built from the request the backend sees ({@code ServletUriComponentsBuilder}), so
     * without this a publish receipt names the instance's own address ({@code 192.168.1.5:8081}) — an address
     * the caller usually cannot open, and one that leaks the internal topology.
     *
     * <p>This is a GLOBAL filter ordered just before the routing filter, not a route filter: the framework's
     * own {@code XForwardedHeadersFilter} runs after route filters and overwrites {@code X-Forwarded-Host}
     * with a host-only value (measured: the backend received an empty string). Running late, after that
     * filter but still before the request leaves, is what makes the header survive — proven by the test's
     * assertion on the header the STUB received, not on the filter's intent.
     *
     * <p>Overwrite, never append: a client that forges {@code X-Forwarded-Host} must not be able to make the
     * receipt name someone else's hostname.
     */
    @Bean
    @Order(Ordered.LOWEST_PRECEDENCE - 1)
    GlobalFilter clientAddressHeaders() {
        return (exchange, chain) -> {
            ServerWebExchange mutated = withClientAddress(exchange);
            return chain.filter(mutated);
        };
    }

    private static ServerWebExchange withClientAddress(ServerWebExchange exchange) {
        var request = exchange.getRequest();
        // The authority of the URI the CLIENT called, not the Host header: a proxy in front of this gateway
        // may rewrite Host, while the request line's authority is what the caller typed.
        String authority = request.getURI().getAuthority();
        String scheme = request.getURI().getScheme();
        var mutated = request.mutate()
                .headers(headers -> {
                    headers.set("X-Nexus-Gateway", "1");
                    if (authority != null && !authority.isBlank()) {
                        headers.set("X-Forwarded-Host", authority);
                        // The standard header above is rewritten by the framework's own header filter after
                        // this one (measured: the backend received it empty). This one is ours end to end:
                        // nexus-api prefers it when building a receipt URL, so the address a caller gets back
                        // is the address that caller used, not an internal instance address.
                        headers.set("X-Nexus-Original-URL", scheme + "://" + authority);
                    }
                    headers.set("X-Forwarded-Proto", scheme);
                })
                .build();
        return exchange.mutate().request(mutated).build();
    }
}