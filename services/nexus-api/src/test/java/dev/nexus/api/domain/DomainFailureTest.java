package dev.nexus.api.domain;

import static org.assertj.core.api.Assertions.assertThat;

import feign.FeignException;
import feign.Request;
import feign.Response;
import feign.RetryableException;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException;

/**
 * The classifier that names a failure of the domain service.
 *
 * <p>Every exception here is built the way the LIBRARY builds it, not the way it would be convenient
 * to build. That distinction is the whole point of this file, because the two are different:
 *
 * <ul>
 *   <li>a <b>refused connection</b> is NOT an HTTP answer. Feign's
 *       {@code FeignException.errorExecuting(Request, IOException)} builds a
 *       {@code RetryableException} with status {@code -1} and the message
 *       {@code "%s executing %s %s"} — read out of the jar with {@code javap}, not guessed;</li>
 *   <li>a <b>refused call by the breaker</b> is not an HTTP answer either, and it is not a transport
 *       failure: the call was never made;</li>
 *   <li>a <b>service that answered 500</b> DID answer, and its answer was an error.</li>
 * </ul>
 *
 * <p>The old wording merged the first and the third, and told a caller that a service which never
 * answered had "answered with an error -1". A status of -1 is not a status; it is the absence of
 * one, and the absence of an answer is the fact.
 */
class DomainFailureTest {

    private static final String METHOD_KEY = "DomainServiceClient#getProject(UUID)";

    @Test
    void aRefusedConnectionIsNotAnHttpError() {
        // THE shape Feign produces when nothing is listening (measured from feign-core 13.6.1):
        // status -1, and the IOException as the cause.
        DomainFailure failure = DomainFailure.classify(connectionRefused());

        assertThat(failure.kind())
                .as("a refused connection is a fact about the SERVICE, and it is its own kind")
                .isEqualTo(DomainFailure.CONNECTION_REFUSED);
        assertThat(failure.kind())
                .as("it must not be reported as an HTTP error status — there was no HTTP status")
                .isNotEqualTo(DomainFailure.ERROR_STATUS);
        assertThat(failure.reason()).contains("connection was refused");
    }

    @Test
    void aRefusedConnectionThatTheBreakerWrappedIsStillARefusedConnection() {
        // THE shape the topology proof produced (measured 2026-11-09): the wrapper on the outside,
        // the real failure inside it. The wrapper's message names nothing; the cause names it all.
        DomainFailure failure = DomainFailure.classify(
                new NoFallbackAvailableException("No fallback available.", connectionRefused()));

        assertThat(failure.kind()).isEqualTo(DomainFailure.CONNECTION_REFUSED);
        assertThat(failure.reason())
                .as("the answer must name the failure, not repeat the wrapper's 'No fallback available.'")
                .doesNotContain("No fallback available");
    }

    @Test
    void anOpenBreakerIsItsOwnKindBecauseTheCallWasNeverMade() {
        DomainFailure failure = DomainFailure.classify(
                new NoFallbackAvailableException("No fallback available.", openBreakerRefuses()));

        assertThat(failure.kind())
                .as("the breaker refused the call; no connection was attempted, so 'connection refused' would be a different lie")
                .isEqualTo(DomainFailure.CIRCUIT_BREAKER_OPEN);
        assertThat(failure.reason()).contains("circuit breaker");
    }

    /**
     * The exception a REAL open breaker raises.
     *
     * <p>Not a hand-built one: the exception class has no public constructor that takes a message
     * (measured, {@code javap} on resilience4j 2.2.0 — its only public factory wants a
     * {@code CircuitBreaker}), so the honest way to get one is to open a breaker and let it refuse.
     * The refusal is then the library's own, not ours.
     */
    private static CallNotPermittedException openBreakerRefuses() {
        CircuitBreaker breaker = CircuitBreaker.ofDefaults("nexus-domain-service");
        breaker.transitionToOpenState();
        try {
            breaker.executeSupplier(() -> "the call that must not happen");
        } catch (CallNotPermittedException refused) {
            return refused;
        }
        throw new AssertionError("an open breaker must refuse the call");
    }

    @Test
    void aServiceThatAnsweredWithFiveHundredIsAnErrorStatus() {
        DomainFailure failure = DomainFailure.classify(serverError(500));

        assertThat(failure.kind()).isEqualTo(DomainFailure.ERROR_STATUS);
        assertThat(failure.reason())
                .as("the service DID answer; which status it answered with is part of the fact")
                .contains("500");
    }

    @Test
    void anAnswerWithARetryAfterIsStillAnAnswer() {
        // Feign's own decoder builds this for a response that carries a Retry-After header: the
        // status is REAL. It must not be confused with the "-1" of a call that never completed.
        DomainFailure failure = DomainFailure.classify(new RetryableException(
                503,
                "Service Unavailable",
                Request.HttpMethod.GET,
                null,
                5L,
                request()));

        assertThat(failure.kind())
                .as("a 503 with a Retry-After header is an ANSWER, and the difference is the whole point")
                .isEqualTo(DomainFailure.ERROR_STATUS);
        assertThat(failure.reason()).contains("503");
    }

    @Test
    void noInstanceToRouteToIsItsOwnKind() {
        DomainFailure failure = DomainFailure.classify(
                new IllegalStateException("No instances available for nexus-domain-service"));

        assertThat(failure.kind()).isEqualTo(DomainFailure.NO_INSTANCE);
        assertThat(failure.reason()).contains("no instance");
    }

    @Test
    void aCallThatRanOutOfTimeIsItsOwnKind() {
        DomainFailure failure = DomainFailure.classify(new RetryableException(
                -1,
                "Read timed out executing GET http://nexus-domain-service/api/v1/projects/x",
                Request.HttpMethod.GET,
                new SocketTimeoutException("Read timed out"),
                (Long) null,
                request()));

        assertThat(failure.kind()).isEqualTo(DomainFailure.TIMEOUT);
    }

    @Test
    void aHostThatCannotBeResolvedIsItsOwnKind() {
        DomainFailure failure = DomainFailure.classify(new RetryableException(
                -1,
                "nexus-domain-service executing GET http://nexus-domain-service/api/v1/projects/x",
                Request.HttpMethod.GET,
                new UnknownHostException("nexus-domain-service"),
                (Long) null,
                request()));

        assertThat(failure.kind()).isEqualTo(DomainFailure.HOST_UNKNOWN);
    }

    @Test
    void aFailureNobodyCanNameSaysSoRatherThanGuessing() {
        DomainFailure failure = DomainFailure.classify(new IllegalArgumentException("something nobody expected"));

        assertThat(failure.kind())
                .as("an unnamed failure must not be dressed up as one of the kinds")
                .isEqualTo(DomainFailure.UNKNOWN);
        assertThat(failure.reason())
                .as("even an unnamed failure may quote what it actually was")
                .contains("something nobody expected");
    }

    @Test
    void theWholeChainIsRenderedInOneLine() {
        String chain = DomainFailure.chainOf(new NoFallbackAvailableException(
                "No fallback available.", connectionRefused()));

        assertThat(chain)
                .as("an operator reads one line, and it must name every layer")
                .contains("NoFallbackAvailableException")
                .contains("RetryableException")
                .contains("ConnectException")
                .contains("<-");
    }

    @Test
    void aChainThatLoopsDoesNotSpinForever() {
        // Java forbids an exception from causing ITSELF, but not two from causing each other —
        // and a loop would hang the reader on a thread that is supposed to answer a caller.
        RuntimeException first = new RuntimeException("first");
        RuntimeException second = new RuntimeException("second");
        first.initCause(second);
        second.initCause(first);

        DomainFailure failure = DomainFailure.classify(first);

        assertThat(failure.kind()).isEqualTo(DomainFailure.UNKNOWN);
        assertThat(DomainFailure.chainOf(first)).contains("first").contains("second");
    }

    /** The exception Feign raises when the connection itself fails. */
    private static FeignException connectionRefused() {
        return new RetryableException(
                -1,
                "Connection refused executing GET http://nexus-domain-service/api/v1/projects/x",
                Request.HttpMethod.GET,
                new ConnectException("Connection refused"),
                (Long) null,
                request());
    }

    /** The exception Feign raises for a 5xx that is not a retry. */
    private static FeignException serverError(int status) {
        Response response = Response.builder()
                .status(status)
                .reason("Internal Server Error")
                .request(request())
                .headers(Map.of())
                .body("the domain service broke", StandardCharsets.UTF_8)
                .build();
        return FeignException.errorStatus(METHOD_KEY, response);
    }

    private static Request request() {
        return Request.create(
                Request.HttpMethod.GET,
                "/api/v1/projects/6fef79cf-a5f7-4d27-9e7e-30309e567dad",
                Map.of(),
                new byte[0],
                StandardCharsets.UTF_8);
    }
}
