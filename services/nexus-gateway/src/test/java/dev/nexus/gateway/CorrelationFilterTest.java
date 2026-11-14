package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * The correlation id, graded without a server (mirrors AuthFilterTest / RateLimitFilterTest).
 *
 * <p>No vendor, no outbound call: the id is a UUID this door mints. The contract under test is only that a
 * caller-supplied id is honoured and propagated, a missing one is generated, and the same id is echoed on the
 * response so either side can quote it.
 */
class CorrelationFilterTest {

    private static GatewayFilterChain capturingChain(AtomicReference<ServerWebExchange> captured) {
        return (exchange) -> {
            captured.set(exchange);
            return Mono.empty();
        };
    }

    private static ServerWebExchange exchangeWith(String path, String requestIdHeader) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get(path);
        if (requestIdHeader != null) {
            builder = builder.header(CorrelationFilter.REQUEST_ID_HEADER, requestIdHeader);
        }
        return MockServerWebExchange.from(builder);
    }

    @Test
    void aSuppliedIdIsHonouredAndEchoed() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        CorrelationFilter filter = new CorrelationFilter();
        ServerWebExchange exchange = exchangeWith("/api/publications", "caller-abc-123");

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();

        assertThat(captured.get().getRequest().getHeaders().getFirst(CorrelationFilter.REQUEST_ID_HEADER))
                .isEqualTo("caller-abc-123");
        assertThat(exchange.getResponse().getHeaders().getFirst(CorrelationFilter.REQUEST_ID_HEADER))
                .isEqualTo("caller-abc-123");
    }

    @Test
    void aMissingIdIsGeneratedAndEchoed() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        CorrelationFilter filter = new CorrelationFilter();
        ServerWebExchange exchange = exchangeWith("/api/publications", null);

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();

        String generated = captured.get().getRequest().getHeaders().getFirst(CorrelationFilter.REQUEST_ID_HEADER);
        assertThat(generated).isNotNull();
        assertThat(CorrelationFilter.isValidId(generated)).isTrue();
        // A generated UUID is 36 chars; a plausible id is what the response must echo back unchanged.
        assertThat(exchange.getResponse().getHeaders().getFirst(CorrelationFilter.REQUEST_ID_HEADER))
                .isEqualTo(generated);
    }

    @Test
    void aGeneratedIdIsAValidUuid() {
        CorrelationFilter filter = new CorrelationFilter();
        ServerWebExchange exchange = exchangeWith("/domain/users", null);
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();

        filter.filter(exchange, capturingChain(captured)).block();

        String id = captured.get().getRequest().getHeaders().getFirst(CorrelationFilter.REQUEST_ID_HEADER);
        // java.util.UUID string form is exactly 36 chars with four hyphens.
        assertThat(id).hasSize(36);
        assertThat(java.util.Arrays.stream(id.split("-")).map(String::length).toList())
                .containsExactly(8, 4, 4, 4, 12);
    }

    @Test
    void aBlankIncomingIdIsTreatedAsMissing() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        CorrelationFilter filter = new CorrelationFilter();
        ServerWebExchange exchange = exchangeWith("/api/publications", "   ");

        assertThat(filter.filter(exchange, capturingChain(captured)).block()).isNull();

        String id = captured.get().getRequest().getHeaders().getFirst(CorrelationFilter.REQUEST_ID_HEADER);
        assertThat(id).isNotBlank();
        assertThat(CorrelationFilter.isValidId(id)).isTrue();
    }
}
