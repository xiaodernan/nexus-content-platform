package dev.nexus.api.domain;

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
}
