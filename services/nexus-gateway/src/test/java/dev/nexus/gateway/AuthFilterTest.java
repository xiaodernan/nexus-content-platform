package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * The door's identity check, graded without a server (mirrors RateLimitFilterTest).
 *
 * <p>The token is minted by the SAME code path that verifies it ({@link AuthFilter#mint}), so "a valid token
 * is accepted" and "a tampered token is refused" are proven against real HMAC-SHA256 — §159 forbids faking
 * this, and there is nothing to fake: the test signs with the same secret the filter checks.
 */
class AuthFilterTest {

    private static final String SECRET = "integration-test-secret-do-not-ship";

    private static GatewayFilterChain capturingChain(AtomicReference<ServerWebExchange> captured) {
        return (exchange) -> {
            captured.set(exchange);
            return Mono.empty();
        };
    }

    private static ServerWebExchange exchangeWith(String path, String authHeader) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get(path);
        if (authHeader != null) {
            builder = builder.header(AuthFilter.AUTH_HEADER, authHeader);
        }
        return MockServerWebExchange.from(builder);
    }

    @Test
    void disabledMeansTheDoorDoesNotCheckIdentity() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        AuthFilter filter = new AuthFilter(false, SECRET);
        ServerWebExchange exchange = exchangeWith("/api/publications", null);

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();

        assertThat(captured.get()).isNotNull();
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void aRequestWithNoTokenIsRefusedWith401() {
        AuthFilter filter = new AuthFilter(true, SECRET);
        ServerWebExchange exchange = exchangeWith("/api/publications", null);

        filter.filter(exchange, (e) -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void aValidTokenIsAcceptedAndItsClaimsAreForwarded() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        AuthFilter filter = new AuthFilter(true, SECRET);
        String token = AuthFilter.mint("alice", List.of("read", "write"), SECRET, 3600);
        ServerWebExchange exchange = exchangeWith("/api/publications", "Bearer " + token);

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();

        assertThat(captured.get()).isNotNull();
        assertThat(captured.get().getRequest().getHeaders().getFirst(AuthFilter.SUBJECT_HEADER))
                .isEqualTo("alice");
        assertThat(captured.get().getRequest().getHeaders().getFirst(AuthFilter.SCOPES_HEADER))
                .isEqualTo("read,write");
    }

    /** The security property: a forged identity header is overwritten by the verified subject, not appended. */
    @Test
    void aForgedSubjectHeaderIsOverwrittenByTheVerifiedSubject() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        AuthFilter filter = new AuthFilter(true, SECRET);
        String token = AuthFilter.mint("alice", List.of("read"), SECRET, 3600);
        ServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/publications")
                        .header(AuthFilter.AUTH_HEADER, "Bearer " + token)
                        .header(AuthFilter.SUBJECT_HEADER, "attacker"));

        filter.filter(exchange, capturingChain(captured)).block();

        assertThat(captured.get().getRequest().getHeaders().getFirst(AuthFilter.SUBJECT_HEADER))
                .isEqualTo("alice");
    }

    @Test
    void aTokenWithATamperedSignatureIsRefused() {
        AuthFilter filter = new AuthFilter(true, SECRET);
        String token = AuthFilter.mint("alice", List.of("read"), SECRET, 3600);
        // Flip one character of the signature half (after the dot) — still looks like a token, signs wrong.
        int dot = token.indexOf('.');
        String sig = token.substring(dot + 1);
        String tampered = token.substring(0, dot + 1) + (sig.charAt(0) == 'A' ? 'B' : 'A') + sig.substring(1);
        ServerWebExchange exchange = exchangeWith("/api/publications", "Bearer " + tampered);

        filter.filter(exchange, (e) -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void anExpiredTokenIsRefused() {
        AuthFilter filter = new AuthFilter(true, SECRET);
        // ttl -10 puts exp in the past; the signature is still valid, so this isolates the expiry check.
        String token = AuthFilter.mint("alice", List.of("read"), SECRET, -10);
        ServerWebExchange exchange = exchangeWith("/api/publications", "Bearer " + token);

        filter.filter(exchange, (e) -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void aMalformedTokenIsRefused() {
        AuthFilter filter = new AuthFilter(true, SECRET);
        ServerWebExchange exchange = exchangeWith("/api/publications", "Bearer not-a-real-token");

        filter.filter(exchange, (e) -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void theHealthProbeIsOpenWithoutAToken() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        AuthFilter filter = new AuthFilter(true, SECRET);
        ServerWebExchange exchange = exchangeWith("/platform/health", null);

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();

        assertThat(captured.get()).isNotNull();
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    void theFallbackPathIsOpenWithoutAToken() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        AuthFilter filter = new AuthFilter(true, SECRET);
        ServerWebExchange exchange = exchangeWith("/fallback/nexus-api", null);

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();

        assertThat(captured.get()).isNotNull();
    }
}
