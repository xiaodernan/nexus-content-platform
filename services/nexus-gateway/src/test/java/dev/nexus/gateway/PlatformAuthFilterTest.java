package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * The door for the gateway's OWN endpoints (SC-27), graded without a server.
 *
 * <p>The failure this class exists to delete: with auth enabled, {@code /platform/services} used to answer
 * 200 to anyone, because Spring Cloud's GlobalFilter never runs for the gateway's own controllers —
 * the address book the registry holds was free to read by any caller that could reach the door.
 */
class PlatformAuthFilterTest {

    private static final String SECRET = "integration-test-secret-do-not-ship";

    private static WebFilterChain capturingChain(AtomicReference<ServerWebExchange> captured) {
        return (exchange) -> {
            captured.set(exchange);
            return Mono.empty();
        };
    }

    private static ServerWebExchange exchangeWith(String path, String authHeader, String forgedSubject) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get(path);
        if (authHeader != null) {
            builder = builder.header(AuthFilter.AUTH_HEADER, authHeader);
        }
        if (forgedSubject != null) {
            builder = builder.header(AuthFilter.SUBJECT_HEADER, forgedSubject);
        }
        return MockServerWebExchange.from(builder);
    }

    @Test
    void disabledMeansTheDoorPassesEverythingThrough() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        PlatformAuthFilter filter = new PlatformAuthFilter(false, SECRET);
        ServerWebExchange exchange = exchangeWith("/platform/services", null, null);

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();
        assertThat(captured.get()).isNotNull();
    }

    @Test
    void platformHealthAnswersWithoutAToken() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        PlatformAuthFilter filter = new PlatformAuthFilter(true, SECRET);
        ServerWebExchange exchange = exchangeWith("/platform/health", null, null);

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();
        assertThat(captured.get()).isNotNull();
    }

    @Test
    void actuatorHealthAnswersWithoutAToken() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        PlatformAuthFilter filter = new PlatformAuthFilter(true, SECRET);
        ServerWebExchange exchange = exchangeWith("/actuator/health", null, null);

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();
        assertThat(captured.get()).isNotNull();
    }

    @Test
    void platformServicesWithoutATokenAnswers401() {
        PlatformAuthFilter filter = new PlatformAuthFilter(true, SECRET);
        ServerWebExchange exchange = exchangeWith("/platform/services", null, null);

        filter.filter(exchange, (e) -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void fallbackPrefixAnswersWithoutAToken() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        PlatformAuthFilter filter = new PlatformAuthFilter(true, SECRET);
        ServerWebExchange exchange = exchangeWith("/fallback/open", null, null);

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();
        assertThat(captured.get()).isNotNull();
    }

    @Test
    void aValidTokenPassesAndOverwritesAForgedSubject() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        PlatformAuthFilter filter = new PlatformAuthFilter(true, SECRET);
        String minted = AuthFilter.mint("real-subject-1", List.of("write"), SECRET, 300);
        ServerWebExchange exchange = exchangeWith("/platform/services", "Bearer " + minted, "forged-subject");

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();

        assertThat(captured.get().getRequest().getHeaders().getFirst(AuthFilter.SUBJECT_HEADER))
                .isEqualTo("real-subject-1");
    }

    @Test
    void anExpiredTokenAnswers401() {
        PlatformAuthFilter filter = new PlatformAuthFilter(true, SECRET);
        String minted = AuthFilter.mint("real-subject-1", List.of("write"), SECRET, -120);
        ServerWebExchange exchange = exchangeWith("/platform/services", "Bearer " + minted, null);

        filter.filter(exchange, (e) -> Mono.empty()).block();

        assertThat(exchange.getResponse().getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void enabledWithBlankSecretRefusesToStart() {
        assertThat(org.assertj.core.api.Assertions.catchThrowable(
                        () -> new PlatformAuthFilter(true, " ", List.of(), List.of())))
                .isInstanceOf(IllegalStateException.class);
    }
}