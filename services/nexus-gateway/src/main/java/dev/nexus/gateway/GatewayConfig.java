package dev.nexus.gateway;

import java.io.IOException;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.util.unit.DataSize;
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

    private static final Logger log = LoggerFactory.getLogger(GatewayConfig.class);

    @Bean
    RouteLocator nexusRoutes(
            RouteLocatorBuilder builder,
            @Value("${nexus.gateway.api-service:nexus-api}") String apiService,
            @Value("${nexus.gateway.api-prefix:/api}") String apiPrefix,
            @Value("${nexus.gateway.domain-service:nexus-domain-service}") String domainService,
            @Value("${nexus.gateway.domain-prefix:/domain}") String domainPrefix,
            @Value("${nexus.gateway.max-request-bytes:1048576}") long maxRequestBytes) {
        return builder.routes()
                .route(apiService, r -> r.path(apiPrefix + "/**")
                        .filters(f -> edgePolicy(f, apiService, apiPrefix, maxRequestBytes))
                        .uri("lb://" + apiService))
                // SC-6 — the second backend. `java-domain-service` publishes `/api/v1/{users,projects}`; the
                // gateway publishes it under `/domain/**` so a caller can tell the two backends apart from the
                // URL alone. Route order matters only where prefixes overlap, and these two do not.
                .route(domainService, r -> r.path(domainPrefix + "/**")
                        .filters(f -> edgePolicy(f, domainService, domainPrefix, maxRequestBytes))
                        .uri("lb://" + domainService))
                .build();
    }

    /**
     * What every backend route gets, in the order the filters matter.
     *
     * <ul>
     *   <li><b>StripPrefix</b> — see {@link #segments(String)}.
     *   <li><b>RequestSize</b> — a hard ceiling on the body BEFORE it is read into memory. Measured: an
     *       oversized body answers 413 at the door and is never forwarded, so a backend cannot be made to
     *       buffer it.
     *   <li><b>SecureHeaders</b> — the framework's response hardening (nosniff, frame DENY, referrer policy,
     *       HSTS). Cheap, and it applies to the 413/429 answers too.
     *   <li><b>Retry, GET only</b> — a connection refused / 502 / 503 on a GET is retried ONCE. POST, PATCH
     *       and DELETE are deliberately excluded: a proxy that repeats a write is how one click becomes two
     *       publications. This is the reason the filter names methods instead of retrying everything.
     *   <li><b>CircuitBreaker</b> — last, so it counts the retried call's final outcome and answers the
     *       honest 503 when its window says the backend is down.
     * </ul>
     */
    private static org.springframework.cloud.gateway.route.builder.GatewayFilterSpec edgePolicy(
            org.springframework.cloud.gateway.route.builder.GatewayFilterSpec f,
            String service,
            String prefix,
            long maxRequestBytes) {
        return f.stripPrefix(segments(prefix))
                .setRequestSize(DataSize.ofBytes(maxRequestBytes))
                .secureHeaders()
                .retry(c -> c.setRetries(1)
                        .setMethods(HttpMethod.GET)
                        // An empty series matters: left unset, the filter falls back to "any 5xx", which would
                        // repeat a GET whose backend answered 500 — a real answer, not a transient failure.
                        .setSeries()
                        .setStatuses(HttpStatus.BAD_GATEWAY, HttpStatus.SERVICE_UNAVAILABLE)
                        .setExceptions(IOException.class, TimeoutException.class))
                .circuitBreaker(c -> c.setName(service).setFallbackUri(fallback(service)));
    }

    /** How many path segments a prefix has — one for {@code /api}, two for {@code /platform/api}. */
    private static int segments(String prefix) {
        // Stripping one segment too many would leave the backend answering a path it never published.
        return (int) java.util.Arrays.stream(prefix.split("/")).filter((s) -> !s.isEmpty()).count();
    }

    private static String fallback(String service) {
        return "forward:/fallback/" + service;
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

    /**
     * The door's own bound on request rate, per client.
     *
     * <p>Two backends (SC-12):
     *
     * <ul>
     *   <li>{@code memory} (default) — a token bucket per instance, over a Caffeine cache with a ceiling. It
     *       needs no second process; the bound is per instance, so two gateways allow twice the rate.
     *   <li>{@code redis} — one atomic bucket per client in Redis, shared by every gateway instance that
     *       points at the same server. {@code NEXUS_REDIS_HOST}/{@code NEXUS_REDIS_PORT} choose the server.
     * </ul>
     *
     * <p>Defaults are deliberately generous (100 requests/second, burst 200): the point is to stop a runaway
     * client from turning into unbounded work, not to shape traffic. A deployment lowers them by environment.
     * {@code NEXUS_GATEWAY_RATE_LIMIT=false} turns the bucket off entirely, for a benchmark or a client that
     * legitimately needs more than the configured ceiling.
     *
     * <p>An unknown backend name is a startup failure, not a silent fallback to memory: a deployment that
     * asked for shared limiting and quietly got per-instance buckets would be wrong in exactly the way this
     * setting exists to prevent.
     */
    @Bean
    RateLimitFilter rateLimitFilter(
            @Value("${nexus.gateway.rate-limit.enabled:true}") boolean enabled,
            @Value("${nexus.gateway.rate-limit.backend:memory}") String backendName,
            @Value("${nexus.gateway.rate-limit.rate-per-second:100}") double ratePerSecond,
            @Value("${nexus.gateway.rate-limit.burst:200}") int burst,
            @Value("${nexus.gateway.rate-limit.max-clients:10000}") int maxClients,
            @Value("${nexus.gateway.rate-limit.redis-key-prefix:nexus:gateway:rate:}") String redisKeyPrefix,
            ObjectProvider<ReactiveStringRedisTemplate> redis) {
        RateLimitBackend backend;
        if ("memory".equalsIgnoreCase(backendName)) {
            backend = new MemoryRateLimitBackend(ratePerSecond, burst, maxClients);
        } else if ("redis".equalsIgnoreCase(backendName)) {
            ReactiveStringRedisTemplate template = redis.getIfAvailable();
            if (template == null) {
                throw new IllegalStateException(
                        "nexus.gateway.rate-limit.backend=redis, but no ReactiveStringRedisTemplate is configured");
            }
            backend = new RedisRateLimitBackend(template, ratePerSecond, burst, redisKeyPrefix);
        } else {
            throw new IllegalStateException("unknown nexus.gateway.rate-limit.backend '" + backendName
                    + "'; expected 'memory' or 'redis'");
        }
        // A reading at startup, because "the limiter is on, on which backend" is otherwise indistinguishable
        // from "the limiter was never wired" until somebody measures a 429 by hand.
        log.info(
                "gateway rate limit: enabled={} backend={} ratePerSecond={} burst={} maxClients={}",
                enabled,
                backend.describe(),
                ratePerSecond,
                burst,
                maxClients);
        return new RateLimitFilter(enabled, backend);
    }

    /**
     * The door's identity check (SC-13).
     *
     * <p>OFF by default so the packaged door stays offline-truth: with no secret and no open door, the laptop
     * and the test suite run without a token service. A deployment turns it on WITH a real secret. Enabling it
     * with a blank secret fails startup rather than starting an open door — an auth gate whose secret is
     * "whatever" is the one configuration this setting exists to prevent.
     *
     * <p>Whitelisted (no token required): the door's own health probes ({@code /platform/health},
     * {@code /actuator/health}) and the circuit-breaker fallback ({@code /fallback/**}), because a caller
     * cannot present a token before it knows the door is even up, and the fallback is what the door says when
     * it could not reach a backend. Everything routed to a backend needs a valid token; see {@link AuthFilter}.
     */
    @Bean
    AuthFilter authFilter(
            @Value("${nexus.gateway.auth.enabled:false}") boolean enabled,
            @Value("${nexus.gateway.auth.secret:}") String secret) {
        if (enabled && (secret == null || secret.isBlank())) {
            throw new IllegalStateException(
                    "nexus.gateway.auth.enabled=true but nexus.gateway.auth.secret is blank; refusing to start an open door");
        }
        log.info("gateway auth: enabled={}", enabled);
        return new AuthFilter(enabled, secret);
    }

    /**
     * A correlation id on every request, so a call the Studio makes can be followed across the door and the
     * backends (SC-14). The caller's own {@code X-Request-Id} is honoured; a missing one is generated. The id
     * is stamped on the request the backend receives and echoed on the response. Runs AFTER auth and the rate
     * limiter and before routing — a refused request never needs a correlation id.
     */
    @Bean
    CorrelationFilter correlationFilter() {
        return new CorrelationFilter();
    }

    /**
     * W3C Trace Context (SC-30): an open {@code traceparent} a Jaeger / Zipkin / OTel collector can join,
     * complementing the private {@link CorrelationFilter#REQUEST_ID_HEADER}. Provider-free — this door mints
     * random ids and speaks the standard format; it does not sample or export to any vendor. Well-formed input
     * keeps its trace-id + flags but gets a FRESH parent-id (a gateway is a hop), and {@code tracestate} is
     * forwarded untouched (the mutate below only rewrites {@code traceparent}). See {@link TraceContextFilter}.
     */
    @Bean
    TraceContextFilter traceContextFilter() {
        return new TraceContextFilter();
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