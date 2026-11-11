package dev.nexus.api.domain;

import dev.nexus.api.domain.DomainDtos.DomainProject;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryRegistry;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The RETRY pillar for the one typed call this service makes across a boundary (v669).
 *
 * <p>Why this class exists at all, rather than a line in {@code application.yml}: Spring Cloud
 * OpenFeign's circuit-breaker integration wraps the Feign call in a {@code CircuitBreaker} and a
 * {@code TimeLimiter}, but it does <b>not</b> consult a Resilience4j {@code Retry} instance — there
 * is no retry configuration class in {@code spring-cloud-circuitbreaker-resilience4j}. A
 * {@code resilience4j.retry.instances.*} block by itself therefore configures an instance
 * <b>nothing uses</b>, silently: the file looks right, the service starts, and no call is ever
 * retried. This repository has already paid for that exact failure mode once with the breaker's
 * NAME (see {@link DomainCircuitBreakerConfigTest}); the rule learned there is that a configured
 * resilience instance must have code that actually obtains and applies it. This class is that code.
 *
 * <p>The retry is deliberately placed at the BUSINESS boundary ({@link DomainProjectReader} →
 * {@link DomainServiceClient}), not inside Feign. The call is a GET by id — safe to ask more than
 * once — and the decision of <i>which</i> failures deserve a second ask is a domain fact, not a
 * transport default: a 404 is an answer, an open breaker never made the call, and a missing
 * instance is a topology fact. Those must not be retried; only a transient wire blip should.
 * The exact exceptions are declared in {@code application.yml} and graded by
 * {@link DomainServiceRetryConfigTest}.
 *
 * <p><b>Two constructors, zero regression.</b> The no-arg form is a pass-through: it calls the
 * client exactly once, which is the behaviour every pre-v669 test and the default-off topology
 * already rely on. Spring injects the {@link RetryRegistry} form in a running context, where the
 * retry is active. Keeping the pass-through form means adding this pillar changes NO behaviour for
 * a deployment that does not configure it, and no test has to be rewritten to accommodate it.
 *
 * <p><b>Find the declared instance; never let the registry invent one (v669a).</b>
 * {@link RetryRegistry#retry(String)} is a <i>get-or-create</i>: measured against Resilience4j 2.2.0,
 * {@code InMemoryRetryRegistry.retry(name)} delegates to {@code retry(name, getDefaultConfig())},
 * so a name that was never declared silently yields a {@code RetryConfig.ofDefaults()} — which
 * retries <b>every</b> exception, including the 404 this whole pillar exists to leave alone. Spring
 * Cloud's {@code RetryAutoConfiguration} pre-creates each YAML-declared {@code instances.*} entry
 * with {@code retry(name, perInstanceConfig)}; by the time this bean is injected that entry is in
 * the registry. So the active constructor uses {@link RetryRegistry#find(String)} and refuses to
 * run on a defaulted policy if the instance is absent. That turns a silent "404 retried three
 * times" into a startup failure an operator can actually see — the same rule the breaker's name
 * taught this repository (a configured instance nothing uses is worse than no instance).
 */
public class DomainServiceRetry {

    private static final Logger log = LoggerFactory.getLogger(DomainServiceRetry.class);
    private static final String INSTANCE = "nexus-domain-service";

    private final Retry retry;
    private final DomainServiceClient client;

    /** Pass-through: no registry, no retry. The pre-v669 behaviour, kept verbatim. */
    public DomainServiceRetry(DomainServiceClient client) {
        this(client, null);
    }

    /** Active: the caller supplies the registry the auto-configuration built from application.yml. */
    public DomainServiceRetry(DomainServiceClient client, RetryRegistry registry) {
        this.client = client;
        // find(), not retry(): `retry(name)` is get-or-create and would SILENTLY manufacture a
        // RetryConfig.ofDefaults() (retry-everything, including a 404) when the YAML instance was
        // never declared. Spring's RetryAutoConfiguration pre-creates each `instances.*` entry with
        // `retry(name, perInstanceConfig)` DURING the retryRegistry bean method, so by the time this
        // bean is injected the declared entry is present and find() returns exactly that policy.
        // `retry(name, configName)` would also work here, but it conflates the instance namespace
        // with the config-name namespace and would silently build an instance from a shared config
        // of the same name — find() states the one contract that matters: the DECLARED instance must
        // exist, or the service refuses to start rather than retry a 404 three times.
        this.retry = registry == null
                ? null
                : registry.find(INSTANCE).orElseThrow(() -> new IllegalStateException(
                        "resilience4j.retry.instances." + INSTANCE + " was not declared; refusing to "
                                + "run the domain-service call on RetryConfig.ofDefaults(), which retries "
                                + "every exception including a 404. Declare the instance in application.yml "
                                + "or use the pass-through constructor."));
    }

    /**
     * Read one project, applying the bounded retry only when a registry was supplied.
     *
     * <p>{@code executeSupplier} re-invokes {@code client.getProject(id)} on each attempt and stops
     * at the configured {@code maxAttempts}. The exceptions worth retrying, the ones to ignore, and
     * the attempt ceiling all come from the YAML this instance was built from — none are hard-coded
     * here, so an operator can widen or tighten the policy without a code change, and the config
     * door test can pin the values.
     */
    public DomainProject getProject(UUID id) {
        if (retry == null) {
            return client.getProject(id);
        }
        return retry.executeSupplier(() -> client.getProject(id));
    }

    /** The number of attempts the configured policy allows (1 = no retry). Exposed for the gate. */
    public int maxAttempts() {
        return retry == null ? 1 : retry.getRetryConfig().getMaxAttempts();
    }

    /** Whether a retry policy is actually attached (false for the pass-through constructor). */
    public boolean isActive() {
        return retry != null;
    }

    /** Log the retry-shaped failure once the policy has exhausted its attempts. Called by the reader
     *  so the operator line says how many tries it took, not just that it failed. */
    public void logExhausted(RuntimeException failure, UUID id) {
        log.warn("domain-service read for {} failed after up to {} attempts: {}", id, maxAttempts(),
                failure.getClass().getSimpleName());
    }
}
