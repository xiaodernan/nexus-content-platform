package dev.nexus.api.domain;

import feign.Target;
import java.lang.reflect.Method;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.openfeign.CircuitBreakerNameResolver;

/**
 * The name of the circuit breaker that stands in front of a service-to-service call.
 *
 * <p>This class exists because of a measured failure (2026-11-09). Spring Cloud OpenFeign ships two
 * name resolvers, and BOTH of them name a breaker something nobody would guess:
 *
 * <ul>
 *   <li>the default one returns {@code Feign.configKey(type, method)} — for this client that is
 *       {@code dev.nexus.api.domain.DomainServiceClient#getProject};</li>
 *   <li>the "alphanumeric" one (which is the default one, on by default) returns the same thing with
 *       every non-alphanumeric character removed — {@code devnexusapidomainDomainServiceClientgetProject}.</li>
 * </ul>
 *
 * <p>So a configuration file that says
 * {@code resilience4j.circuitbreaker.instances.nexus-domain-service: …} configures an instance
 * <b>nothing is using</b>. The breaker that actually guards the call runs on the library's DEFAULTS,
 * and the configuration file still looks right — which is the worst kind of wrong, because there is
 * nothing to see.
 *
 * <p>Measured, on the first run of the topology proof: the real breaker counted every exception as a
 * failure, <b>including a 404</b>, and after its hundredth call it opened and stayed open for a
 * minute. A healthy domain service answered "there is no project with that id" with
 * <b>503 "No fallback available."</b> instead of <b>404</b> — which is the exact lie this whole
 * slice exists to prevent, produced by a configuration file that had been right the whole time.
 *
 * <p>This resolver names the breaker after the <b>client</b> — {@code nexus-domain-service} — so the
 * name in {@code application.yml} and the name in front of the call are the same word, and a reader
 * can check that by reading one file.
 *
 * <p>{@code DomainCircuitBreakerConfigTest} reads {@code application.yml} and refuses to let the
 * two drift apart again.
 */
public class DomainCircuitBreakerNameResolver implements CircuitBreakerNameResolver {

    private static final Logger log = LoggerFactory.getLogger(DomainCircuitBreakerNameResolver.class);

    /**
     * The resolver is consulted on every call, so the announcement is made ONCE. A name nobody can
     * see is a drift nobody notices — but a name printed on every request is a line nobody reads.
     */
    private boolean announced;

    @Override
    public String resolveCircuitBreakerName(String feignClientName, Target<?> target, Method method) {
        // The client name, verbatim. The two library resolvers exist to make INSTANCE IDS legal for
        // tools that only accept letters and digits; a Resilience4j instance name has no such rule,
        // and a name a reader can recognise is worth more than one a tool can digest.
        if (!announced) {
            announced = true;
            log.info("the circuit breaker in front of the Feign client {} is named {}", feignClientName, feignClientName);
        }
        return feignClientName;
    }
}
