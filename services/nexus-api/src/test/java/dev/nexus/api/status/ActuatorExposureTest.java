package dev.nexus.api.status;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * The guard that the operator's door is OPEN, and that it opens onto metrics nobody else can see.
 *
 * <p>This service has two doors. The product door is {@code /api/**}, which the edge routes to it.
 * The operator door is {@code /actuator/**}, which the edge does NOT route — and must not.
 *
 * <p>What the operator door is FOR is the metric {@code resilience4j.circuitbreaker.state}: it says
 * whether the breaker in front of the domain service is CLOSED, OPEN or HALF_OPEN, and its
 * {@code name} tag is the breaker's own name — the same word the configuration file uses. That
 * metric is what turns a 503 ("the domain service could not be reached") into an answer about
 * WHICH component stopped the call.
 *
 * <p>So two facts are pinned here:
 *
 * <ul>
 *   <li>the door is open to {@code metrics} — a closed door is a silently broken door;</li>
 *   <li>and the metrics are for the operator: the configuration says so in the same file, and the
 *       edge's own route table is what keeps them off the public side.</li>
 * </ul>
 */
class ActuatorExposureTest {

    @Test
    void theOperatorDoorExposesTheMetricsThatSayWhatTheBreakersAreDoing() {
        Map<String, Object> root = readApplicationYml();

        List<String> exposed = exposedEndpoints(root);

        assertThat(exposed)
                .as("without `metrics` the breaker's own state cannot be read, and a 503 has no cause behind it")
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
    void theOperatorDoorIsNotOnTheProductSide() {
        Map<String, Object> root = readApplicationYml();
        Object management = at(root, "management");
        Object endpoints = ((Map<?, ?>) management).get("endpoints");
        Object web = endpoints == null ? null : ((Map<?, ?>) endpoints).get("web");
        Object configured = web == null ? null : ((Map<?, ?>) web).get("base-path");

        // The actuator's base path is `/actuator` unless somebody moves it. If it were moved UNDER
        // the edge's routed prefix (`/api/**`), the operator's door would be on the public side —
        // and the edge's route table, which matches `/api/**`, would publish it without anybody
        // deciding to. The default is the safe place; this case is here so that moving it is a
        // deliberate act with a red test attached.
        String basePath = configured == null ? "/actuator" : String.valueOf(configured);

        assertThat(basePath)
                .as("the operator door must not sit behind the prefix the edge routes")
                .doesNotStartWith("/api");
    }

    /** The application's own configuration file, read as data. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> readApplicationYml() {
        try (InputStream stream = ActuatorExposureTest.class.getResourceAsStream("/application.yml")) {
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
