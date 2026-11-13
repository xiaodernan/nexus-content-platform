package dev.nexus.api.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import dev.nexus.api.domain.DomainDtos.DomainProject;
import feign.FeignException;
import feign.Request;
import feign.Response;
import feign.RetryableException;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import io.github.resilience4j.retry.RetryRegistry;
import java.net.ConnectException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * The v669 RETRY pillar, graded as a REAL Resilience4j state machine (not a mock of one).
 *
 * <p>Every case here builds a genuine {@link RetryRegistry} / {@link Retry} with the SAME policy
 * shape the shipped {@code application.yml} declares — bounded attempts, a wait, and the exact
 * retry/ignore exception sets — and drives a stubbed {@link DomainServiceClient} through
 * {@link DomainServiceRetry}. The assertion that matters is the CALL COUNT: it is the only honest
 * proof that a retry happened exactly as many times as intended and not one more.
 *
 * <p>The four facts this pins, each of which is a real failure mode if the retry is wired wrong:
 *
 * <ul>
 *   <li>a transient wire blip that clears is retried and the caller gets the project;</li>
 *   <li>a downstream that keeps failing is tried EXACTLY {@code maxAttempts} times — no hot spin,
 *       no connection-pool exhaustion;</li>
 *   <li>a 404 is tried ONCE. A retry here turns a cheap negative answer into three slow ones and
 *       hammers a perfectly healthy service;</li>
 *   <li>an open breaker / missing instance is tried ONCE: the call was never made (or there was
 *       nowhere to send it), so asking again cannot help.</li>
 * </ul>
 *
 * <p>Finally, the no-registry constructor is graded as a pure pass-through: one call, no retry —
 * which is why adding this pillar changes NO behaviour for a deployment that does not configure it
 * and breaks none of the pre-v669 tests.
 */
class DomainServiceRetryTest {

    private static final String METHOD_KEY = "DomainServiceClient#getProject(UUID)";
    private static final String INSTANCE = "nexus-domain-service";
    private static final int MAX_ATTEMPTS = 3;

    /** The policy shape from application.yml; wait is shortened to keep the suite fast. */
    private static final RetryConfig CONFIG = RetryConfig.<DomainProject>custom()
            .maxAttempts(MAX_ATTEMPTS)
            .waitDuration(Duration.ofMillis(1))
            .retryExceptions(RetryableException.class, FeignException.ServiceUnavailable.class)
            .ignoreExceptions(
                    FeignException.NotFound.class,
                    CallNotPermittedException.class,
                    IllegalStateException.class)
            .build();

    private final DomainServiceClient client = mock(DomainServiceClient.class);
    private final UUID id = UUID.randomUUID();
    private final DomainProject project =
            new DomainProject(id, UUID.randomUUID(), "slug", "Name", "website", "private", null, null);

    /**
     * Build the registry the way Spring's {@code RetryAutoConfiguration.retryRegistry} does: a
     * registry with NO shared configs, then PRE-CREATE the declared instance with its per-instance
     * config via {@code retry(name, config)}. That is the shape {@code find(name)} sees in a running
     * service.
     *
     * <p>The old harness used {@code RetryRegistry.of(Map.of(name, config))}, which registers the
     * config under a SHARED-CONFIG name and creates NO instance. {@code retry(name)} then falls back
     * to {@code RetryConfig.ofDefaults()} — retry-everything — so all three ignore exceptions were
     * retried and this suite was red for a reason that had nothing to do with the policy. Grading
     * the real shape is the only way the call-count assertions mean anything.
     */
    private DomainServiceRetry withRetry() {
        RetryRegistry registry = RetryRegistry.ofDefaults();
        registry.retry(INSTANCE, CONFIG); // Spring pre-creates instances.* exactly like this
        return new DomainServiceRetry(client, registry);
    }

    @Test
    void aTransientBlipThatClearsIsRetriedAndTheCallerGetsTheProject() {
        when(client.getProject(id))
                .thenThrow(connectionRefused())
                .thenReturn(project);

        DomainProject got = withRetry().getProject(id);

        assertThat(got).isEqualTo(project);
        verify(client, times(2)).getProject(id); // one failure, one success — not three blind tries
    }

    @Test
    void aDownstreamThatKeepsFailingIsTriedExactlyMaxAttempts() {
        when(client.getProject(id)).thenThrow(connectionRefused());

        DomainServiceRetry retry = withRetry();
        assertThatThrownBy(() -> retry.getProject(id)).isInstanceOf(RetryableException.class);

        verify(client, times(MAX_ATTEMPTS)).getProject(id);
        assertThat(retry.maxAttempts()).isEqualTo(MAX_ATTEMPTS);
        assertThat(retry.isActive()).isTrue();
    }

    @Test
    void aNotFoundIsTriedOnceAndNeverRetried() {
        when(client.getProject(id)).thenThrow(notFound());

        DomainServiceRetry retry = withRetry();
        assertThatThrownBy(() -> retry.getProject(id)).isInstanceOf(FeignException.NotFound.class);

        verify(client, times(1)).getProject(id); // 404 is an answer, not a blip
    }

    @Test
    void anOpenBreakerIsTriedOnceAndNeverRetried() {
        when(client.getProject(id)).thenThrow(openBreakerRefusal());

        assertThatThrownBy(() -> withRetry().getProject(id)).isInstanceOf(CallNotPermittedException.class);

        verify(client, times(1)).getProject(id); // the call was never made; retrying re-hits the open breaker
    }

    @Test
    void aMissingInstanceIsTriedOnceAndNeverRetried() {
        when(client.getProject(id)).thenThrow(new IllegalStateException("No instances available for nexus-domain-service"));

        assertThatThrownBy(() -> withRetry().getProject(id)).isInstanceOf(IllegalStateException.class);

        verify(client, times(1)).getProject(id); // a topology fact, not a momentary blip
    }

    @Test
    void aServiceUnavailableIsRetriedButAnInternalServerErrorIsNot() {
        // 503 is in retryExceptions; after MAX_ATTEMPTS it gives up (bounded).
        when(client.getProject(id)).thenThrow(serviceUnavailable());
        assertThatThrownBy(() -> withRetry().getProject(id)).isInstanceOf(FeignException.ServiceUnavailable.class);
        verify(client, times(MAX_ATTEMPTS)).getProject(id);
    }

    @Test
    void anInternalServerErrorIsTriedOnceBecauseOnlyTransientFailuresAreRetried() {
        // A 500 is the downstream's OWN failure, not a "try me again" signal. It is in neither
        // retryExceptions nor ignoreExceptions, so the composed predicate (retry-set AND NOT
        // ignore-set) returns false and it is tried once. A default-config retry would try it 3× —
        // this leg is what proves the YAML policy, not the library default, is actually in force.
        when(client.getProject(id)).thenThrow(internalServerError());
        assertThatThrownBy(() -> withRetry().getProject(id)).isInstanceOf(FeignException.InternalServerError.class);
        verify(client, times(1)).getProject(id);
    }

    @Test
    void anUndeclaredInstanceRefusesToStartInsteadOfSilentlyRetryingEverything() {
        // The production hazard find() closes: a registry with NO declared nexus-domain-service
        // instance. retry(name) would get-or-create a RetryConfig.ofDefaults() that retries a 404
        // three times; find(name) exposes the absence so it can be refused at startup.
        RetryRegistry emptyRegistry = RetryRegistry.ofDefaults();
        assertThat(emptyRegistry.find(INSTANCE)).isEmpty();

        assertThatThrownBy(() -> new DomainServiceRetry(client, emptyRegistry))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("resilience4j.retry.instances." + INSTANCE)
                .hasMessageContaining("ofDefaults");
        verifyNoInteractions(client); // the service refused to wire; no call was ever made
    }

    @Test
    void theNoRegistryConstructorIsAPurePassThroughOneCallNoRetry() {
        when(client.getProject(id)).thenThrow(connectionRefused());

        DomainServiceRetry passThrough = new DomainServiceRetry(client);
        assertThat(passThrough.isActive()).isFalse();
        assertThat(passThrough.maxAttempts()).isEqualTo(1);
        assertThatThrownBy(() -> passThrough.getProject(id)).isInstanceOf(RetryableException.class);

        verify(client, times(1)).getProject(id); // byte-for-byte pre-v669 behaviour
    }

    /** Feign's connection-failure family — the one a retry is FOR. */
    private static RetryableException connectionRefused() {
        return new RetryableException(-1, "Connection refused executing GET " + INSTANCE,
                Request.HttpMethod.GET, new ConnectException("Connection refused"), (Long) null, request());
    }

    private static FeignException.NotFound notFound() {
        return new FeignException.NotFound(METHOD_KEY, request(), new byte[0], Map.of());
    }

    private static FeignException.ServiceUnavailable serviceUnavailable() {
        Response response = Response.builder()
                .status(503).reason("Service Unavailable").request(request())
                .headers(Map.of()).build();
        return (FeignException.ServiceUnavailable) FeignException.errorStatus(METHOD_KEY, response);
    }

    private static FeignException.InternalServerError internalServerError() {
        Response response = Response.builder()
                .status(500).reason("Internal Server Error").request(request())
                .headers(Map.of()).build();
        return (FeignException.InternalServerError) FeignException.errorStatus(METHOD_KEY, response);
    }

    private static RuntimeException openBreakerRefusal() {
        CircuitBreaker breaker = CircuitBreaker.ofDefaults(INSTANCE);
        breaker.transitionToOpenState();
        try {
            breaker.executeSupplier(() -> "must not happen");
        } catch (CallNotPermittedException refused) {
            return refused;
        }
        throw new AssertionError("an open breaker must refuse the call");
    }

    private static Request request() {
        return Request.create(Request.HttpMethod.GET, "/api/v1/projects/" + UUID.randomUUID(),
                Map.of(), new byte[0], StandardCharsets.UTF_8);
    }
}
