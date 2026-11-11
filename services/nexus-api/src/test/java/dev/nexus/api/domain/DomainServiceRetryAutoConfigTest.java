package dev.nexus.api.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import dev.nexus.api.domain.DomainDtos.DomainProject;
import feign.FeignException;
import feign.Request;
import feign.RetryableException;
import io.github.resilience4j.retry.RetryRegistry;
import io.github.resilience4j.springboot3.retry.autoconfigure.RetryAutoConfiguration;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * The v669a PRODUCTION-WIRING door — the leg that closes the gap between a hand-built registry and
 * the one Spring actually injects. {@link DomainServiceRetryTest} grades a registry assembled in
 * Java; this one boots the REAL {@link RetryAutoConfiguration} from the SAME property shape
 * {@code application.yml} declares, then asks the two questions that decide whether the retry is
 * live or decorative in a running service:
 *
 * <ol>
 *   <li>Does auto-configuration PRE-CREATE the {@code nexus-domain-service} instance such that
 *       {@code RetryRegistry.find(name)} returns it? If it only registered a shared config, find()
 *       would be empty and {@link DomainServiceRetry} would (correctly) refuse to start.</li>
 *   <li>Does the resulting {@link DomainServiceRetry} bean apply the DECLARED policy — a transient
 *       wire blip retried, a 404 tried once — rather than {@code RetryConfig.ofDefaults()}?</li>
 * </ol>
 *
 * <p>This is why the property values below are written out, not loaded from a test YAML: they are
 * the shipped defaults, in the exact {@code resilience4j.retry.instances.nexus-domain-service.*}
 * namespace the binder reads. If an operator renames the instance or the YAML shape drifts, the
 * {@link DomainServiceRetryConfigTest} config door and this wiring door fail together.
 */
class DomainServiceRetryAutoConfigTest {

    private static final String PREFIX = "resilience4j.retry.instances.nexus-domain-service.";

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(RetryAutoConfiguration.class))
            .withPropertyValues(
                    PREFIX + "maxAttempts=3",
                    PREFIX + "waitDuration=1ms",
                    PREFIX + "retryExceptions[0]=feign.RetryableException",
                    PREFIX + "retryExceptions[1]=feign.FeignException$ServiceUnavailable",
                    PREFIX + "ignoreExceptions[0]=feign.FeignException$NotFound",
                    PREFIX + "ignoreExceptions[1]=io.github.resilience4j.circuitbreaker.CallNotPermittedException",
                    PREFIX + "ignoreExceptions[2]=java.lang.IllegalStateException");

    @Test
    void autoConfigPreCreatesTheDeclaredInstanceSoFindSucceeds() {
        runner.run(ctx -> {
            RetryRegistry registry = ctx.getBean(RetryRegistry.class);
            assertThat(registry.find("nexus-domain-service"))
                    .as("RetryAutoConfiguration must pre-create every instances.* entry via "
                            + "retry(name, config); find() is what DomainServiceRetry relies on")
                    .isPresent();
            assertThat(registry.find("nexus-domain-service").get().getRetryConfig().getMaxAttempts())
                    .isEqualTo(3);
        });
    }

    @Test
    void theWiredRetryAppliesTheDeclaredPolicyNotTheLibraryDefault() {
        runner.run(ctx -> {
            RetryRegistry registry = ctx.getBean(RetryRegistry.class);
            DomainServiceClient client = mock(DomainServiceClient.class);
            DomainServiceRetry wired = new DomainServiceRetry(client, registry);
            assertThat(wired.isActive()).as("the declared instance must be found").isTrue();
            assertThat(wired.maxAttempts()).isEqualTo(3);

            UUID id = UUID.randomUUID();

            // A 404 is an ANSWER: the composed (retry-set AND NOT ignore-set) predicate is false,
            // so it is tried once. A default-config retry would try it three times — this is the
            // assertion the whole v669a fix exists to make pass for the right reason.
            when(client.getProject(id)).thenThrow(notFound());
            assertThatThrownBy(() -> wired.getProject(id)).isInstanceOf(FeignException.NotFound.class);
            verify(client, times(1)).getProject(id);
        });
    }

    @Test
    void aTransientBlipIsRetriedUnderTheRealAutoConfiguredPolicy() {
        runner.run(ctx -> {
            RetryRegistry registry = ctx.getBean(RetryRegistry.class);
            DomainServiceClient client = mock(DomainServiceClient.class);
            DomainServiceRetry wired = new DomainServiceRetry(client, registry);
            UUID id = UUID.randomUUID();
            DomainProject project =
                    new DomainProject(id, UUID.randomUUID(), "slug", "Name", "website", "private", null, null);

            when(client.getProject(id)).thenThrow(connectionRefused()).thenReturn(project);

            assertThat(wired.getProject(id)).isEqualTo(project);
            verify(client, times(2)).getProject(id); // one blip, one success
        });
    }

    private static RetryableException connectionRefused() {
        return new RetryableException(-1, "Connection refused", Request.HttpMethod.GET,
                new java.net.ConnectException("Connection refused"), (Long) null, request());
    }

    private static FeignException.NotFound notFound() {
        return new FeignException.NotFound("DomainServiceClient#getProject(UUID)", request(), new byte[0], Map.of());
    }

    private static Request request() {
        return Request.create(Request.HttpMethod.GET, "/api/v1/projects/" + UUID.randomUUID(),
                Map.of(), new byte[0], StandardCharsets.UTF_8);
    }
}
