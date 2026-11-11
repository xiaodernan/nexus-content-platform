package dev.nexus.api.domain;

import io.github.resilience4j.retry.RetryRegistry;
import org.springframework.cloud.openfeign.CircuitBreakerNameResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the circuit breaker's NAME, so that the configuration and the call agree.
 *
 * <p>Both resolvers Spring Cloud OpenFeign ships name a breaker something nobody would guess — see
 * {@link DomainCircuitBreakerNameResolver} for the measurement. Registering ours makes both of them
 * back off (each is {@code @ConditionalOnMissingBean(CircuitBreakerNameResolver.class)}), and the
 * breaker in front of the domain-service call is then named after the client:
 * {@code nexus-domain-service} — the same word that appears in {@code application.yml}.
 *
 * <p>Without this, the {@code resilience4j} block in {@code application.yml} would configure an
 * instance nothing uses, and the failure would be SILENT: the file looks right, the service starts,
 * and the breaker quietly runs on defaults.
 */
@Configuration(proxyBeanMethods = false)
public class DomainServiceClientConfig {

    /**
     * The resolver that names the breaker after the Feign client.
     */
    @Bean
    public CircuitBreakerNameResolver domainCircuitBreakerNameResolver() {
        return new DomainCircuitBreakerNameResolver();
    }

    /**
     * v669 — the RETRY made REAL. The {@code resilience4j.retry.instances.*} block in
     * application.yml would otherwise be a silent no-op on a Feign call (OpenFeign's breaker
     * integration never consults a Retry instance). This bean obtains the very instance the YAML
     * declares — by the SAME name the Feign client uses — and hands it to the business boundary
     * that actually wraps the call.
     *
     * <p>{@link RetryRegistry} is auto-configured by resilience4j-spring-boot3, which
     * spring-cloud-starter-circuitbreaker-resilience4j already puts on the classpath. Asking for an
     * instance the YAML did not declare would FAIL AT STARTUP (registry.retry throws) — which is the
     * honest failure: a retry the operator thinks exists but does not is worse than no retry.
     */
    @Bean
    public DomainServiceRetry domainServiceRetry(DomainServiceClient client, RetryRegistry retryRegistry) {
        return new DomainServiceRetry(client, retryRegistry);
    }
}
