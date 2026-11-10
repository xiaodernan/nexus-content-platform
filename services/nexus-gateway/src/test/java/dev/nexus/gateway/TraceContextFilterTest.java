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
 * The W3C trace context, graded without a server (mirrors CorrelationFilterTest).
 *
 * <p>The contract that separates a real hop from a string-copier: a well-formed parent keeps trace-id + flags
 * but gets a NEW parent-id; missing/malformed input is replaced, never propagated; tracestate is untouched.
 */
class TraceContextFilterTest {

    private static GatewayFilterChain capturingChain(AtomicReference<ServerWebExchange> captured) {
        return (exchange) -> {
            captured.set(exchange);
            return Mono.empty();
        };
    }

    private static ServerWebExchange exchangeWith(String traceparent, String tracestate) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get("/api/publications");
        if (traceparent != null) {
            builder = builder.header(TraceContextFilter.TRACEPARENT, traceparent);
        }
        if (tracestate != null) {
            builder = builder.header(TraceContextFilter.TRACESTATE, tracestate);
        }
        return MockServerWebExchange.from(builder);
    }

    private static String requestHeader(ServerWebExchange exchange, String name) {
        return exchange.getRequest().getHeaders().getFirst(name);
    }

    private static final String VALID = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

    @Test
    void aWellFormedParentKeepsTraceIdAndFlagsButGetsANewParentId() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        ServerWebExchange exchange = exchangeWith(VALID, null);

        new TraceContextFilter().filter(exchange, capturingChain(captured)).block();

        String outgoing = requestHeader(captured.get(), TraceContextFilter.TRACEPARENT);
        assertThat(outgoing).isNotEqualTo(VALID);
        assertThat(TraceContextFilter.parse(outgoing)).isNotNull();
        // The whole distributed trace stays ONE trace: trace-id + flags survive.
        assertThat(outgoing).startsWith("00-4bf92f3577b34da6a3ce929d0e0e4736-").endsWith("-01");
        // But this hop is a NEW span: the parent-id the backend sees is not the caller's.
        assertThat(TraceContextFilter.parentIdOf(outgoing))
                .isNotEqualTo("00f067aa0ba902b7")
                .isNotEqualTo("0000000000000000");
        // The caller can quote the exact context the backend saw.
        assertThat(exchange.getResponse().getHeaders().getFirst(TraceContextFilter.TRACEPARENT))
                .isEqualTo(outgoing);
    }

    @Test
    void aMissingParentIsMintedWholeAndEchoed() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        ServerWebExchange exchange = exchangeWith(null, null);

        new TraceContextFilter().filter(exchange, capturingChain(captured)).block();

        String outgoing = requestHeader(captured.get(), TraceContextFilter.TRACEPARENT);
        TraceContextFilter.Parent parsed = TraceContextFilter.parse(outgoing);
        assertThat(parsed).isNotNull();
        assertThat(parsed.version()).isEqualTo("00");
        assertThat(parsed.traceId()).isNotEqualTo("0".repeat(32));
        assertThat(parsed.parentId()).isNotEqualTo("0".repeat(16));
        assertThat(parsed.flags()).isEqualTo("00");
        assertThat(exchange.getResponse().getHeaders().getFirst(TraceContextFilter.TRACEPARENT))
                .isEqualTo(outgoing);
    }

    @Test
    void aMalformedParentIsReplacedNotPropagated() {
        // Wrong length, non-hex, all-zero trace-id, all-zero parent-id, wrong version, all must be refused.
        for (String bad : new String[] {
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7", // too short
            "00-4bf92f3577b34da6a3ce929d0e0e473g-00f067aa0ba902b7-01", // g not hex
            "00-00000000000000000000000000000000-00f067aa0ba902b7-01", // all-zero trace-id
            "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01", // all-zero parent-id
            "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" // unsupported version
        }) {
            assertThat(TraceContextFilter.parse(bad)).as("must refuse %s", bad).isNull();

            AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
            new TraceContextFilter().filter(exchangeWith(bad, null), capturingChain(captured)).block();
            String outgoing = requestHeader(captured.get(), TraceContextFilter.TRACEPARENT);
            assertThat(outgoing).as("must not echo the garbage %s", bad).isNotEqualTo(bad);
            assertThat(TraceContextFilter.parse(outgoing)).as("must mint a valid context after %s", bad).isNotNull();
        }
    }

    @Test
    void aTraceStateIsForwardedVerbatim() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        String state = "congo=t61rcWkgMzE,rojo=00f067aa0ba902b7";

        new TraceContextFilter().filter(exchangeWith(VALID, state), capturingChain(captured)).block();

        // W3C: a hop that does not understand a vendor entry must not drop tracestate. Our mutate only rewrites
        // traceparent, so tracestate survives untouched on the request the backend receives.
        assertThat(requestHeader(captured.get(), TraceContextFilter.TRACESTATE)).isEqualTo(state);
    }

    @Test
    void anUpperCaseParentIsAcceptedAndNormalisedToLowercase() {
        AtomicReference<ServerWebExchange> captured = new AtomicReference<>();
        String upper = "00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01";

        new TraceContextFilter().filter(exchangeWith(upper, null), capturingChain(captured)).block();

        String outgoing = requestHeader(captured.get(), TraceContextFilter.TRACEPARENT);
        assertThat(outgoing).startsWith("00-4bf92f3577b34da6a3ce929d0e0e4736-");
        assertThat(TraceContextFilter.parse(outgoing)).isNotNull();
    }
}
