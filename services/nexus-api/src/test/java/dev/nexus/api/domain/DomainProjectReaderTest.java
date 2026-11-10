package dev.nexus.api.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import dev.nexus.api.domain.DomainDtos.DomainProject;
import dev.nexus.api.domain.DomainDtos.DomainResponse;
import feign.FeignException;
import feign.Request;
import feign.Response;
import feign.RetryableException;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import java.net.ConnectException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException;

/**
 * The reader that talks to the DOMAIN service, graded over a stubbed client.
 *
 * <p>The cases that matter are the ones where the downstream is NOT behaving, because that is
 * where a service-to-service call usually goes wrong:
 *
 * <ul>
 *   <li>a project the domain service holds — the ordinary case;</li>
 *   <li>a project it does NOT hold — a 404, which is a fact ABOUT THE PROJECT;</li>
 *   <li>a domain service that cannot be reached — which is a fact ABOUT THE SERVICE, and must
 *       never be reported as the second case. This is the whole reason the reader exists: a 404
 *       delivered because the service was down tells a caller that the project is gone, and the
 *       caller will say so to a user;</li>
 *   <li>a 200 with an empty body — a malformed answer, which is neither a project nor a refusal;</li>
 *   <li>a downstream that answers 500 — it DID answer, so the failure is its own, and calling that
 *       "the project does not exist" would be a different lie.</li>
 * </ul>
 *
 * <p>The exceptions below are REAL Feign exceptions, built the way Feign builds them, rather than
 * mocks of them. A mock of {@code FeignException.NotFound} proves only that the reader catches a
 * class named {@code NotFound}; a real one proves the reader catches what Feign ACTUALLY throws for
 * a 404 — and a real {@code RetryableException} proves the connection-refused path, which Feign
 * signals with a different exception family than an HTTP status.
 */
@ExtendWith(MockitoExtension.class)
class DomainProjectReaderTest {

    private static final String METHOD_KEY = "DomainServiceClient#getProject(UUID)";

    @Mock
    private DomainServiceClient client;

    private DomainProjectReader reader;

    @BeforeEach
    void setUp() {
        reader = new DomainProjectReader(client);
    }

    @Test
    void aProjectTheDomainServiceHoldsIsFound() {
        UUID id = UUID.randomUUID();
        DomainProject project = new DomainProject(id, UUID.randomUUID(), "slug", "Name", "website", "private", null, null);
        when(client.getProject(id)).thenReturn(project);

        DomainResponse answer = reader.read(id);

        assertThat(answer.isFound()).isTrue();
        assertThat(answer.state()).isEqualTo("found");
        assertThat(answer.project()).isEqualTo(project);
        assertThat(answer.reason()).as("a found answer carries no complaint").isNull();
    }

    @Test
    void aProjectTheDomainServiceDoesNotHoldIsNotFound() {
        UUID id = UUID.randomUUID();
        when(client.getProject(id)).thenThrow(notFound(id));

        DomainResponse answer = reader.read(id);

        assertThat(answer.state()).isEqualTo("not-found");
        assertThat(answer.isUnavailable()).isFalse();
        assertThat(answer.project()).as("a project that is not there is not a project with no fields").isNull();
        assertThat(answer.reason()).isNotBlank();
        assertThat(answer.failure())
                .as("a 404 is a fact about the PROJECT, not a failure of the service")
                .isNull();
    }

    @Test
    void aDomainServiceThatCannotBeReachedIsUnavailableAndNOTNotFound() {
        UUID id = UUID.randomUUID();
        when(client.getProject(id)).thenThrow(connectionRefused(id));

        DomainResponse answer = reader.read(id);

        assertThat(answer.state())
                .as("an unreachable service is a fact about the SERVICE; reporting it as 'not found' would tell a caller the project is gone")
                .isEqualTo("downstream-unavailable");
        assertThat(answer.isUnavailable()).isTrue();
        assertThat(answer.project()).isNull();
        assertThat(answer.failure())
                .as("the answer must NAME the failure, so an operator is not guessing")
                .isEqualTo(DomainFailure.CONNECTION_REFUSED);
        assertThat(answer.reason()).contains("connection was refused");
    }

    @Test
    void anOpenBreakerIsUnavailableAndSaysTheBreakerRefusedTheCall() {
        UUID id = UUID.randomUUID();
        when(client.getProject(id)).thenThrow(breakerRefused(id));

        DomainResponse answer = reader.read(id);

        assertThat(answer.state()).isEqualTo("downstream-unavailable");
        assertThat(answer.project()).isNull();
        assertThat(answer.failure())
                .as("the call was never made: that is a different fact from a refused connection")
                .isEqualTo(DomainFailure.CIRCUIT_BREAKER_OPEN);
        assertThat(answer.reason())
                .as("the wrapper's own message names neither the service nor the failure")
                .doesNotContain("No fallback available");
    }

    @Test
    void anEmptyBodyIsNotAProject() {
        UUID id = UUID.randomUUID();
        when(client.getProject(id)).thenReturn(null);

        DomainResponse answer = reader.read(id);

        assertThat(answer.isFound()).isFalse();
        assertThat(answer.state()).isEqualTo("downstream-unavailable");
        assertThat(answer.failure())
                .as("an empty body is a malformed ANSWER, which is its own kind of failure")
                .isEqualTo(DomainFailure.MALFORMED_ANSWER);
        assertThat(answer.reason()).contains("empty body");
    }

    @Test
    void aDownstreamThatAnswersFiveHundredIsUnavailableAndNotAMissingProject() {
        UUID id = UUID.randomUUID();
        when(client.getProject(id)).thenThrow(serverError(id));

        DomainResponse answer = reader.read(id);

        assertThat(answer.state())
                .as("the service DID answer; it answered badly. That is its failure, not the project's absence")
                .isEqualTo("downstream-unavailable");
        assertThat(answer.project()).isNull();
        assertThat(answer.failure())
                .as("an answer with an error status is a different kind of failure from no answer at all")
                .isEqualTo(DomainFailure.ERROR_STATUS);
        assertThat(answer.reason()).contains("500");
    }

    @Test
    void aFourOhFourThatArrivedAsAnotherFeignExceptionIsStillNotFound() {
        UUID id = UUID.randomUUID();
        // A 404 that Feign raised as its generic client exception instead of `NotFound`. The reader
        // must decide by the STATUS, not by which exception family the library happened to use.
        FeignException asClientException = FeignException.errorStatus(
                METHOD_KEY,
                Response.builder()
                        .status(404)
                        .reason("Not Found")
                        .request(request(id))
                        .headers(Map.of())
                        .build());
        when(client.getProject(id)).thenThrow(asClientException);

        DomainResponse answer = reader.read(id);

        assertThat(answer.state())
                .as("a 404 is a fact about the PROJECT; a different exception class must not turn it into a fact about the service")
                .isEqualTo("not-found");
        assertThat(answer.project()).isNull();
        assertThat(answer.failure()).isNull();
    }

    @Test
    void aFourOhFourWrappedByTheBreakerIsStillNotFound() {
        UUID id = UUID.randomUUID();
        // THE shape the topology proof produced (measured 2026-11-09): with a circuit breaker in
        // front of the call, Spring Cloud routes EVERY exception through the breaker's fallback, and
        // with no fallback bean it throws NoFallbackAvailableException WRAPPING the original. The
        // original is the fact: a 404 says the service was there, healthy, and holding no such row.
        when(client.getProject(id)).thenThrow(new NoFallbackAvailableException(
                "No fallback available.", notFound(id)));

        DomainResponse answer = reader.read(id);

        assertThat(answer.state())
                .as("a 404 that reached the reader inside a wrapper is still a fact about the PROJECT")
                .isEqualTo("not-found");
        assertThat(answer.isUnavailable()).isFalse();
        assertThat(answer.project()).isNull();
        assertThat(answer.failure()).isNull();
    }

    @Test
    void aNonFeignFailureIsAlsoDownstreamAndNotAProject() {
        UUID id = UUID.randomUUID();
        // THE shape Spring Cloud's load balancer raises when it has nowhere to send the call: a
        // plain IllegalStateException, with the service's name in the message.
        when(client.getProject(id)).thenThrow(
                new IllegalStateException("No instances available for nexus-domain-service"));

        DomainResponse answer = reader.read(id);

        assertThat(answer.state())
                .as("a load balancer with no instance is not a statement about the project")
                .isEqualTo("downstream-unavailable");
        assertThat(answer.failure()).isEqualTo(DomainFailure.NO_INSTANCE);
        assertThat(answer.reason()).contains("no instance");
    }

    /** The exception Feign raises for a 404 — the one that means "it answered, and no". */
    private static FeignException.NotFound notFound(UUID id) {
        return new FeignException.NotFound(METHOD_KEY, request(id), new byte[0], Map.of());
    }

    /** The exception Feign raises when the connection itself fails. */
    private static FeignException connectionRefused(UUID id) {
        // THE shape Feign builds (read out of feign-core 13.6.1 with javap): status -1, message
        // "<ioe message> executing <method> <url>", and the IOException as the cause. The old
        // helper here used status 503, which is an HTTP answer — and the difference between the
        // two is exactly the difference this reader now has to keep.
        return new RetryableException(
                -1,
                "Connection refused executing GET http://nexus-domain-service/api/v1/projects/" + id,
                Request.HttpMethod.GET,
                new ConnectException("Connection refused"),
                (Long) null,
                request(id));
    }

    /** The exception Spring Cloud's breaker raises when it refuses the call. */
    private static RuntimeException breakerRefused(UUID id) {
        // A REAL open breaker, refusing a REAL call: the exception is the library's own, because
        // the library gives no public way to build one by hand (javap on resilience4j 2.2.0 — its
        // only public factory wants a CircuitBreaker).
        CircuitBreaker breaker = CircuitBreaker.ofDefaults("nexus-domain-service");
        breaker.transitionToOpenState();
        try {
            breaker.executeSupplier(() -> "the call that must not happen");
        } catch (CallNotPermittedException refused) {
            return new NoFallbackAvailableException("No fallback available.", refused);
        }
        throw new AssertionError("an open breaker must refuse the call");
    }

    /** The exception Feign raises for a 5xx that is not a retry. */
    private static FeignException serverError(UUID id) {
        Response response = Response.builder()
                .status(500)
                .reason("Internal Server Error")
                .request(request(id))
                .headers(Map.of())
                .body("the domain service broke", StandardCharsets.UTF_8)
                .build();
        return FeignException.errorStatus(METHOD_KEY, response);
    }

    private static Request request(UUID id) {
        return Request.create(
                Request.HttpMethod.GET,
                "/api/v1/projects/" + id,
                Map.of(),
                new byte[0],
                StandardCharsets.UTF_8);
    }
}
