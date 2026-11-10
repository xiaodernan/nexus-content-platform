package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpResponse;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * The two doors must speak one truth (SC-32) — the invariant both classes' comments PROMISE but nothing graded.
 *
 * <p>{@link AuthFilter} guards the ROUTE edge (a Spring Cloud {@code GlobalFilter}); {@link PlatformAuthFilter}
 * guards the gateway's OWN endpoints (a reactive {@code WebFilter}). Both carry a copy of the same whitelist
 * ({@code /platform/health}, {@code /actuator/health}, {@code /fallback/**}) and the same 401 refusal body —
 * written as TWO independent literals in two files. Both class comments say the copies "must be kept in sync,
 * or the door claims one truth at the route edge and another at its own endpoints". Until now that sync was a
 * COMMENT, not a test: a future edit adding one path to one list (and updating only that side's tests) would
 * silently open a hole — exactly the §SC-27 shape, where a platform endpoint answered 200 with no token.
 *
 * <p>This grades the invariant BEHAVIOURALLY: for each representative path it runs BOTH filters with auth on
 * and NO token and requires the SAME verdict — allowed (chain ran) or 401 — and, on 401, the SAME refusal body
 * byte-for-byte. It never hard-codes which list is "right": if either side drifts, A ≠ B and this goes red.
 *
 * <p>The fix behind the lock: both doors now delegate whitelist, segment boundary, blank-secret guard and
 * 401 body to the single {@link AuthPolicy}. First run (2026-11-11) went RED on two real defects —
 * /fallbackish slipped through a bare startsWith("/fallback"), and AuthFilter did not fail closed on a blank
 * secret while PlatformAuthFilter did. Both are fixed at the shared source, not patched per door. Complement:
 * {@link AuthPolicyTest} grades that the shared rule itself is CORRECT (parity alone would stay green if both
 * doors drifted together).
 */
class AuthWhitelistParityTest {

    private static final String SECRET = "integration-test-secret-do-not-ship";

    private record Verdict(boolean allowed, int status, String body) {}

    private static ServerWebExchange exchange(String path) {
        return MockServerWebExchange.from(MockServerHttpRequest.get(path));
    }

    private static Verdict throughRouteEdge(String path) {
        AtomicReference<ServerWebExchange> passed = new AtomicReference<>();
        GatewayFilterChain chain = exchange -> {
            passed.set(exchange);
            return Mono.empty();
        };
        ServerWebExchange exchange = exchange(path);
        new AuthFilter(true, SECRET).filter(exchange, chain).block();
        return verdict(exchange, passed.get() != null);
    }

    private static Verdict throughOwnEndpoints(String path) {
        AtomicReference<ServerWebExchange> passed = new AtomicReference<>();
        WebFilterChain chain = exchange -> {
            passed.set(exchange);
            return Mono.empty();
        };
        ServerWebExchange exchange = exchange(path);
        new PlatformAuthFilter(true, SECRET).filter(exchange, chain).block();
        return verdict(exchange, passed.get() != null);
    }

    private static Verdict verdict(ServerWebExchange exchange, boolean chainRan) {
        int status = exchange.getResponse().getStatusCode() == null
                ? 0
                : exchange.getResponse().getStatusCode().value();
        // Only a 401 writes a body (writeWith completes); the allow path has no body to read.
        String body = status == 401
                ? ((MockServerHttpResponse) exchange.getResponse()).getBodyAsString().block()
                : "";
        return new Verdict(chainRan, status, body);
    }

    /** Representative paths: the three whitelist rules, a near-miss, two platform surfaces, a real route. */
    private static final List<String> PATHS = List.of(
            "/platform/health", // exact, both
            "/actuator/health", // exact, both
            "/fallback", // prefix root
            "/fallback/nexus-api", // prefix with a child (the §SC-24/29/31 fallback)
            "/fallbackish", // near-miss: must NOT be whitelisted
            "/platform/services", // platform surface, guarded
            "/actuator/circuitbreakers", // SC-31 readout, guarded
            "/api/publications"); // a real business route, guarded

    @Test
    void theRouteEdgeAndTheOwnEndpointsGiveTheSameVerdictOnEveryPath() {
        Map<String, String> mismatches = new LinkedHashMap<>();
        for (String path : PATHS) {
            Verdict route = throughRouteEdge(path);
            Verdict own = throughOwnEndpoints(path);
            if (route.allowed() != own.allowed() || route.status() != own.status()) {
                mismatches.put(path, "route(" + route.allowed() + "/" + route.status() + ") vs own("
                        + own.allowed() + "/" + own.status() + ")");
            }
        }
        assertThat(mismatches)
                .as("the two auth surfaces must agree on every path; a mismatch is an open hole on one side")
                .isEmpty();
    }

    @Test
    void theExceptedPathsAreOpenAndTheGuardedPathsAreClosedOnBothSurfaces() {
        List<String> open = List.of("/platform/health", "/actuator/health", "/fallback", "/fallback/nexus-api");
        List<String> guarded = List.of("/fallbackish", "/platform/services", "/actuator/circuitbreakers",
                "/api/publications");

        for (String path : open) {
            assertThat(throughRouteEdge(path).allowed()).as("route allows %s", path).isTrue();
            assertThat(throughOwnEndpoints(path).allowed()).as("own endpoints allow %s", path).isTrue();
        }
        for (String path : guarded) {
            assertThat(throughRouteEdge(path).status()).as("route guards %s", path).isEqualTo(401);
            assertThat(throughOwnEndpoints(path).status()).as("own endpoints guard %s", path).isEqualTo(401);
        }
    }

    @Test
    void theRefusalDialectIsByteIdenticalOnBothSurfaces() {
        // Two independent note literals must stay byte-identical, or a caller learns two dialects for one door.
        Verdict route = throughRouteEdge("/api/publications");
        Verdict own = throughOwnEndpoints("/platform/services");

        assertThat(route.allowed()).isFalse();
        assertThat(own.allowed()).isFalse();
        assertThat(route.body()).as("the route edge's 401 body").isNotBlank();
        assertThat(route.body()).isEqualTo(own.body());
        // And both say the honest thing about what is open — no drift into a promise the door doesn't keep.
        assertThat(route.body())
                .contains("\"error\":\"unauthorized\"")
                .contains("/platform/health and /fallback/** are open");
    }

    @Test
    void anEnabledDoorWithABlankSecretFailsClosedOnBothSurfaces() {
        // The "refuse to start an open door" rule is also duplicated; both must hold it.
        assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> new AuthFilter(true, "  ")))
                .as("route edge must refuse a blank secret")
                .isInstanceOf(IllegalStateException.class);
        assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> new PlatformAuthFilter(true, "  ")))
                .as("own endpoints must refuse a blank secret")
                .isInstanceOf(IllegalStateException.class);
    }
}
