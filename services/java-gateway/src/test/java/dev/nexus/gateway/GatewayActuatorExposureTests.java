package dev.nexus.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * The edge's own operator door, and the fact that it is the ONLY door.
 *
 * <p>Two facts are pinned here, and they pull in opposite directions on purpose:
 *
 * <ul>
 *   <li>the edge exposes {@code metrics}, because {@code resilience4j.circuitbreaker.state} is the
 *       metric that says whether the edge's OWN breaker — the one the route table names — is
 *       CLOSED, OPEN or HALF_OPEN. Without it, every 503 the edge produces is the same sentence,
 *       and an operator cannot tell "the upstream is gone" from "the edge stopped asking";</li>
 *   <li>and NO route in the shipped table leads to an actuator. The edge's table matches
 *       {@code /api/**} and nothing else, so the operator's door of the service behind it — and of
 *       the edge itself — is not on the public side. A route table that grew a {@code /actuator/**}
 *       entry would publish the internals of every service behind the edge, and it would do it
 *       quietly: the route table still looks like a list of doors.</li>
 * </ul>
 */
class GatewayActuatorExposureTests {

    @Test
    void theEdgeExposesTheMetricsThatSayWhatItsOwnBreakerIsDoing() {
        Map<String, Object> root = readApplicationYml();

        List<String> exposed = exposedEndpoints(root);

        assertThat(exposed)
                .as("without `metrics` the edge cannot say whether its own breaker is open")
                .contains("metrics");
        assertThat(exposed).contains("health");
    }

    /**
     * The endpoints this service exposes over HTTP.
     *
     * <p>Spring Boot accepts the exposure list as a comma-separated STRING as well as as a YAML
     * sequence, and the shipped file uses the string form — so both are read here rather than
     * casting one shape and failing on the other.
     */
    private static List<String> exposedEndpoints(Map<String, Object> root) {
        Object value = at(root, "management", "endpoints", "web", "exposure", "include");
        if (value instanceof List<?> list) {
            @SuppressWarnings("unchecked")
            List<String> asStrings = (List<String>) list;
            return asStrings;
        }
        return Arrays.stream(String.valueOf(value).split(","))
                .map(String::trim)
                .filter(part -> !part.isEmpty())
                .toList();
    }

    @Test
    void noRouteInTheShippedTableLeadsToAnActuator() {
        Map<String, Object> root = readApplicationYml();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> routes = (List<Map<String, Object>>) at(root,
                "spring", "cloud", "gateway", "server", "webflux", "routes");

        List<String> paths = new ArrayList<>();
        for (Map<String, Object> route : routes) {
            Object predicates = route.get("predicates");
            if (!(predicates instanceof List<?> list)) {
                continue;
            }
            for (Object predicate : list) {
                if (predicate instanceof String text && text.startsWith("Path=")) {
                    paths.add(text.substring("Path=".length()));
                }
            }
        }

        assertThat(paths)
                .as("the shipped table must have at least one path, or this case proves nothing")
                .isNotEmpty();
        assertThat(paths)
                .as("every route the edge serves is the PRODUCT door; an actuator route would publish a service's internals")
                .allSatisfy(path -> assertThat(path)
                        .as("a route on the operator's door of a service behind the edge")
                        .doesNotContain("actuator")
                        .doesNotContain("management"));
        assertThat(paths)
                .as("and the only prefix the edge routes is the product prefix")
                .allSatisfy(path -> assertThat(path).startsWith("/api"));
    }

    /** The application's own configuration file, read as data. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> readApplicationYml() {
        try (InputStream stream = GatewayActuatorExposureTests.class.getResourceAsStream("/application.yml")) {
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
