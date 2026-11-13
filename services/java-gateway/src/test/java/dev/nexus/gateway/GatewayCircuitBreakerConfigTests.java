package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.yaml.snakeyaml.Yaml;

/**
 * The guard against the edge's breaker being CONFIGURED but not IN USE.
 *
 * <p>The route table names a breaker: the {@code CircuitBreaker} filter's {@code name} argument. The
 * {@code resilience4j} block names an instance. Those two words must be the same word, or the block
 * configures an instance nothing uses — and that failure is SILENT: the file still looks right, the
 * edge still starts, and the breaker quietly runs on the library's defaults.
 *
 * <p>Measured, 2026-11-09, on the topology proof: with the defaults (100 calls before the breaker may
 * open, 60 seconds before it may come back) the edge kept sending traffic to a dead upstream for
 * about half a minute. This case pins both halves:
 *
 * <ul>
 *   <li>the NAME in the route table is the NAME in the configuration;</li>
 *   <li>and the breaker that Spring Cloud actually builds has the configured numbers — not the
 *       defaults.</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewayCircuitBreakerConfigTests {

    @Autowired
    private CircuitBreakerRegistry circuitBreakerRegistry;

    @Test
    void theRouteAndTheConfigurationNameTheSameBreaker() {
        Map<String, Object> root = readApplicationYml();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> routes = (List<Map<String, Object>>) at(root,
                "spring", "cloud", "gateway", "server", "webflux", "routes");

        String routeBreaker = null;
        for (Map<String, Object> route : routes) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> filters = (List<Map<String, Object>>) route.get("filters");
            if (filters == null) {
                continue;
            }
            for (Object filter : filters) {
                // The route's filter list holds BOTH plain strings (`StripPrefix=1`) and maps (the
                // filter with arguments). Only the maps can name a breaker.
                if (!(filter instanceof Map)) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> filterMap = (Map<String, Object>) filter;
                if (!"CircuitBreaker".equals(filterMap.get("name"))) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> args = (Map<String, Object>) filterMap.get("args");
                routeBreaker = (String) args.get("name");
            }
        }

        assertThat(routeBreaker).as("the shipped route must name a breaker").isNotBlank();

        @SuppressWarnings("unchecked")
        Map<String, Object> instances = (Map<String, Object>) at(root, "resilience4j", "circuitbreaker", "instances");

        assertThat(instances.keySet())
                .as("the configured instance must be the one the route asks for")
                .containsExactly(routeBreaker);
    }

    @Test
    void theBreakerSpringCloudBuildsHasTheConfiguredNumbersAndNotTheDefaults() {
        Map<String, Object> root = readApplicationYml();

        @SuppressWarnings("unchecked")
        Map<String, Object> instances = (Map<String, Object>) at(root, "resilience4j", "circuitbreaker", "instances");
        String name = instances.keySet().iterator().next();

        @SuppressWarnings("unchecked")
        Map<String, Object> configured = (Map<String, Object>) instances.get(name);

        // The registry Spring Cloud builds its breakers from. `circuitBreaker(name)` returns the
        // CONFIGURED breaker when the name is one the configuration knows, and a DEFAULT one when it
        // is not — which is exactly the difference this case is about.
        var breaker = circuitBreakerRegistry.circuitBreaker(name);

        assertThat(breaker.getCircuitBreakerConfig().getMinimumNumberOfCalls())
                .as("with the library's default (100) the edge keeps sending traffic to a dead upstream for half a minute")
                .isEqualTo(((Number) configured.get("minimumNumberOfCalls")).intValue());
        assertThat(breaker.getCircuitBreakerConfig().getSlidingWindowSize())
                .as("the window the failure rate is measured over must be the configured one")
                .isEqualTo(((Number) configured.get("slidingWindowSize")).intValue());
    }

    /** The application's own configuration file, read as data. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> readApplicationYml() {
        try (InputStream stream = GatewayCircuitBreakerConfigTests.class.getResourceAsStream("/application.yml")) {
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
