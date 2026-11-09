package dev.nexus.api.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.openfeign.FeignClient;
import org.yaml.snakeyaml.Yaml;

/**
 * The guard against the circuit breaker's CONFIG and the circuit breaker's NAME drifting apart.
 *
 * <p>This is not a hypothetical. Measured 2026-11-09, on the first run of the topology proof:
 *
 * <ul>
 *   <li>Spring Cloud OpenFeign names a breaker instance after the Feign client with every
 *       NON-ALPHANUMERIC CHARACTER REMOVED — {@code nexus-domain-service} becomes
 *       {@code nexusdomainservice};</li>
 *   <li>so the {@code resilience4j.circuitbreaker.instances.nexus-domain-service} block in
 *       {@code application.yml} configured an instance <b>nothing was using</b>;</li>
 *   <li>and the breaker that was actually in front of the call ran on the DEFAULTS — 100 calls
 *       before it may open, 60 seconds before it may half-open, and every exception counted as a
 *       failure, <b>including a 404</b>;</li>
 *   <li>so a perfectly healthy service answered every later question with 503 "No fallback
 *       available." instead of 404.</li>
 * </ul>
 *
 * <p>Nothing in the unit suite could have seen it: the tests never build a breaker, and a
 * configuration file that configures the wrong name fails SILENTLY — which is the worst kind of
 * wrong, because the file still looks right.
 *
 * <p>So this case reads the file and pins the three facts that have to agree: the client's name, the
 * instance's name, and the switch that keeps the library from mangling that name.
 */
class DomainCircuitBreakerConfigTest {

    private static final String CLIENT_NAME = DomainServiceClient.class.getAnnotation(FeignClient.class).name();

    @Test
    void theBreakerInstanceIsNamedAfterTheClientAndNotAfterAStrippedCopyOfIt() {
        Map<String, Object> root = readApplicationYml();

        @SuppressWarnings("unchecked")
        Map<String, Object> instances = (Map<String, Object>) at(root, "resilience4j", "circuitbreaker", "instances");

        assertThat(instances.keySet())
                .as("the configured breaker must be the one the Feign client actually asks for")
                .containsExactly(CLIENT_NAME);
    }

    @Test
    void theNameInFrontOfTheCallIsTheNameThisFileConfigures() {
        // The resolver is what decides the name. The library's own two resolvers name a breaker
        // `dev.nexus.api.domain.DomainServiceClient#getProject` — and, by default, that with every
        // non-alphanumeric character removed — so a configuration keyed by the client's name would
        // describe an instance nothing uses, and it would fail SILENTLY.
        String named = new DomainCircuitBreakerNameResolver().resolveCircuitBreakerName(CLIENT_NAME, null, null);

        assertThat(named)
                .as("the breaker's name is the client's name, verbatim")
                .isEqualTo(CLIENT_NAME);
        assertThat(named)
                .as("a name a reader can recognise is worth more than one a tool can digest")
                .doesNotContain("#")
                .doesNotContain(".");
    }

    @Test
    void aNotFoundIsNotCountedAsAFailureOfTheService() {
        Map<String, Object> root = readApplicationYml();

        @SuppressWarnings("unchecked")
        List<String> ignored = (List<String>) at(root, "resilience4j", "circuitbreaker", "instances", CLIENT_NAME,
                "ignoreExceptions");

        assertThat(ignored)
                .as("a 404 is an ANSWER; counting it as a failure opens the breaker for a healthy service")
                .contains("feign.FeignException.NotFound");
    }

    @Test
    void theBreakerMayOpenAndMayComeBackOnItsOwn() {
        Map<String, Object> root = readApplicationYml();

        Object wait = at(root, "resilience4j", "circuitbreaker", "instances", CLIENT_NAME, "waitDurationInOpenState");
        Object halfOpen = at(root, "resilience4j", "circuitbreaker", "instances", CLIENT_NAME,
                "automaticTransitionFromOpenToHalfOpenEnabled");

        assertThat(wait).isNotNull();
        assertThat(halfOpen)
                .as("an open breaker that never comes back turns one bad minute into an outage")
                .isEqualTo(Boolean.TRUE);
    }

    /** The application's own configuration file, read as data. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> readApplicationYml() {
        try (InputStream stream = DomainCircuitBreakerConfigTest.class.getResourceAsStream("/application.yml")) {
            assertThat(stream).as("application.yml must be on the test classpath").isNotNull();
            Object loaded = new Yaml().load(new InputStreamReader(stream, StandardCharsets.UTF_8));
            assertThat(loaded).isInstanceOf(Map.class);
            return (Map<String, Object>) loaded;
        } catch (Exception e) {
            throw new IllegalStateException("could not read application.yml", e);
        }
    }

    /** Walk a path through nested maps, refusing to guess when a step is missing. */
    private static Object at(Map<String, Object> root, String... path) {
        Object current = root;
        for (String key : path) {
            assertThat(current).as("the path %s must exist", String.join(".", path)).isInstanceOf(Map.class);
            current = ((Map<?, ?>) current).get(key);
            assertThat(current).as("%s must be present", key).isNotNull();
        }
        return current;
    }
}
