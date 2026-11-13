package dev.nexus.gateway.fallback;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.URI;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.web.reactive.function.client.WebClientRequestException;

/**
 * The edge's naming of a failure.
 *
 * <p>The cases here are the four things that actually happen to an edge, and the reason they are
 * worth telling apart: a refused connection means the upstream is gone, a timeout means it is
 * alive and slow, an open breaker means the edge stopped asking on purpose, and no instance means
 * the upstream is not registered anywhere the edge can reach. Four different problems, four
 * different fixes, and one sentence that says none of them is no answer at all.
 */
class UpstreamFailureTest {

    @Test
    void aRefusedConnectionIsNamedAsSuch() {
        // THE shape reactor-netty produces: the WebClient wraps the refusal, and the refusal is a
        // ConnectException underneath it.
        UpstreamFailure failure = UpstreamFailure.classify(new WebClientRequestException(
                new ConnectException("Connection refused: 127.0.0.1/127.0.0.1:8080"),
                HttpMethod.GET,
                URI.create("http://127.0.0.1:8080/api/echo"),
                HttpHeaders.EMPTY));

        assertThat(failure.kind()).isEqualTo(UpstreamFailure.CONNECTION_REFUSED);
        assertThat(failure.detail()).contains("connection was refused");
    }

    @Test
    void anOpenBreakerIsItsOwnKindBecauseTheUpstreamWasNeverContacted() {
        UpstreamFailure failure = UpstreamFailure.classify(openBreakerRefuses());

        assertThat(failure.kind())
                .as("the call was never made; 'connection refused' would be a different fact")
                .isEqualTo(UpstreamFailure.CIRCUIT_BREAKER_OPEN);
    }

    @Test
    void anUpstreamThatDidNotAnswerInTimeIsNamedAsSuch() {
        UpstreamFailure failure = UpstreamFailure.classify(new WebClientRequestException(
                new SocketTimeoutException("Read timed out"),
                HttpMethod.GET,
                URI.create("http://127.0.0.1:8080/api/echo"),
                HttpHeaders.EMPTY));

        assertThat(failure.kind()).isEqualTo(UpstreamFailure.TIMEOUT);
    }

    @Test
    void anUpstreamThatIsNotRegisteredAnywhereIsNamedAsSuch() {
        UpstreamFailure failure = UpstreamFailure.classify(
                new IllegalStateException("No instances available for nexus-api"));

        assertThat(failure.kind()).isEqualTo(UpstreamFailure.NO_INSTANCE);
    }

    @Test
    void aFailureNobodyCanNameSaysSoRatherThanGuessing() {
        UpstreamFailure failure = UpstreamFailure.classify(new IllegalArgumentException("something odd"));

        assertThat(failure.kind()).isEqualTo(UpstreamFailure.UNKNOWN);
        assertThat(failure.detail()).contains("something odd");
    }

    @Test
    void noFailureAtAllIsStillNamedHonestly() {
        UpstreamFailure failure = UpstreamFailure.classify(null);

        assertThat(failure.kind()).isEqualTo(UpstreamFailure.UNKNOWN);
        assertThat(failure.detail())
                .as("the edge must not pretend it knows why when it does not")
                .contains("without an exception");
    }

    @Test
    void theWholeChainIsRenderedInOneLine() {
        String chain = UpstreamFailure.chainOf(new WebClientRequestException(
                new ConnectException("Connection refused"),
                HttpMethod.GET,
                URI.create("http://127.0.0.1:8080/api/echo"),
                HttpHeaders.EMPTY));

        assertThat(chain)
                .as("an operator reads one line, and it must name every layer")
                .contains("WebClientRequestException")
                .contains("ConnectException")
                .contains("<-");
    }

    /**
     * The exception a REAL open breaker raises.
     *
     * <p>Not a hand-built one: the class has no public constructor that takes a message (measured
     * with {@code javap} on resilience4j 2.2.0 — its only public factory wants a
     * {@code CircuitBreaker}), so the honest way to get one is to open a breaker and let it refuse.
     */
    private static CallNotPermittedException openBreakerRefuses() {
        CircuitBreaker breaker = CircuitBreaker.ofDefaults("nexusApiCircuitBreaker");
        breaker.transitionToOpenState();
        try {
            breaker.executeSupplier(() -> "the call that must not happen");
        } catch (CallNotPermittedException refused) {
            return refused;
        }
        throw new AssertionError("an open breaker must refuse the call");
    }
}
