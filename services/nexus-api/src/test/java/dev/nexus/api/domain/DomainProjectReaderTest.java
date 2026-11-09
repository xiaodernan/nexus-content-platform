package dev.nexus.api.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import dev.nexus.api.domain.DomainDtos.DomainProject;
import dev.nexus.api.domain.DomainDtos.DomainResponse;
import feign.FeignException;
import feign.Request;
import feign.Response;
import feign.RetryableException;
import java.net.ConnectException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
        assertThat(answer.reason())
                .as("the reason must name the failure, so an operator is not guessing")
                .contains("connection refused");
    }

    @Test
    void anEmptyBodyIsNotAProject() {
        UUID id = UUID.randomUUID();
        when(client.getProject(id)).thenReturn(null);

        DomainResponse answer = reader.read(id);

        assertThat(answer.isFound()).isFalse();
        assertThat(answer.state()).isEqualTo("downstream-unavailable");
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
        assertThat(answer.reason()).contains("500");
    }

    @Test
    void aNonFeignFailureIsAlsoDownstreamAndNotAProject() {
        UUID id = UUID.randomUUID();
        when(client.getProject(id)).thenThrow(new IllegalStateException("no instance available"));

        DomainResponse answer = reader.read(id);

        assertThat(answer.state())
                .as("a load balancer with no instance is not a statement about the project")
                .isEqualTo("downstream-unavailable");
        assertThat(answer.reason()).contains("no instance available");
    }

    /** The exception Feign raises for a 404 — the one that means "it answered, and no". */
    private static FeignException.NotFound notFound(UUID id) {
        return new FeignException.NotFound(METHOD_KEY, request(id), new byte[0], Map.of());
    }

    /** The exception Feign raises when the connection itself fails. */
    private static FeignException connectionRefused(UUID id) {
        return new RetryableException(
                503,
                "connection refused",
                Request.HttpMethod.GET,
                new ConnectException("connection refused"),
                (Long) null,
                request(id));
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
