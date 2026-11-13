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
 * The guard that keeps the v669 RETRY config from becoming a silently-unused block (ADR 0101).
 *
 * <p>Lessons this file encodes, both measured in this repository before:
 *
 * <ul>
 *   <li>Spring Cloud OpenFeign's circuit-breaker integration wraps a Feign call in a breaker and a
 *       time limiter — it does <b>not</b> consult a Resilience4j {@code Retry} instance. A
 *       {@code resilience4j.retry.instances.*} block alone configures nothing that runs. The code
 *       that makes it real is {@link DomainServiceRetry} (obtained via {@link DomainServiceClientConfig});
 *       this test pins the CONFIG half of that contract: the instance name must match the Feign
 *       client, or {@code RetryRegistry.retry(name)} would hand the call a differently-named (or
 *       default) policy.</li>
 *   <li>A 404 is an answer, not a blip. Retrying it turns a cheap "no such project" into three slow
 *       ones and hammers a perfectly healthy service. The breaker already ignores 404; the retry
 *       must do the same, and this test refuses to let the two drift apart.</li>
 * </ul>
 *
 * <p>It also pins the two properties that keep a retry BOUNDED: a finite {@code maxAttempts} and a
 * finite {@code waitDuration}. An unbounded or un-delayed retry against a hung downstream is either
 * a thread-pool / connection exhaustion or a hot spin — both are outages this pillar must not
 * introduce while claiming to add resilience.
 */
class DomainServiceRetryConfigTest {

    private static final String CLIENT_NAME = DomainServiceClient.class.getAnnotation(FeignClient.class).name();

    @Test
    void theRetryInstanceIsNamedAfterTheClientTheCallActuallyUses() {
        Map<String, Object> root = readApplicationYml();

        @SuppressWarnings("unchecked")
        Map<String, Object> instances = (Map<String, Object>) at(root, "resilience4j", "retry", "instances");

        assertThat(instances.keySet())
                .as("the retry policy must be the one DomainServiceRetry asks RetryRegistry for")
                .containsExactly(CLIENT_NAME);
    }

    @Test
    void theRetryIsBoundedInBothAttemptsAndWait() {
        Map<String, Object> root = readApplicationYml();
        Object attempts = at(root, "resilience4j", "retry", "instances", CLIENT_NAME, "maxAttempts");
        Object wait = at(root, "resilience4j", "retry", "instances", CLIENT_NAME, "waitDuration");

        // The YAML is a Spring placeholder; SnakeYAML reads the WHOLE `${KEY:default}` string as
        // data, so grade the shipped DEFAULT (what a deployment gets with no env override).
        String attemptsDefault = defaultOf(attempts);
        String waitDefault = defaultOf(wait);
        assertThat(attemptsDefault).as("an unbounded retry exhausts the connection pool").matches("\\d+");
        assertThat(Integer.parseInt(attemptsDefault))
                .as("at most a few tries: 1 initial call + a bounded number of retries")
                .isBetween(2, 5);
        assertThat(waitDefault).as("a zero/unset wait spins against a hung downstream").matches("[1-9]\\d*(ms|s)");
    }

    @Test
    void aNotFoundIsNeverRetried() {
        @SuppressWarnings("unchecked")
        List<String> ignored = (List<String>) at(readApplicationYml(), "resilience4j", "retry", "instances",
                CLIENT_NAME, "ignoreExceptions");

        assertThat(ignored)
                .as("a 404 is an answer; retrying it three times is pure waste against a healthy service")
                .contains("feign.FeignException$NotFound");
    }

    @Test
    void anOpenBreakerAndAMissingInstanceAreNeverRetried() {
        @SuppressWarnings("unchecked")
        List<String> ignored = (List<String>) at(readApplicationYml(), "resilience4j", "retry", "instances",
                CLIENT_NAME, "ignoreExceptions");

        assertThat(ignored)
                .as("an open breaker means the call was never made; a missing instance is a topology fact")
                .contains("io.github.resilience4j.circuitbreaker.CallNotPermittedException")
                .contains("java.lang.IllegalStateException");
    }

    @Test
    void onlyTransientWireFailuresAreRetried() {
        @SuppressWarnings("unchecked")
        List<String> retried = (List<String>) at(readApplicationYml(), "resilience4j", "retry", "instances",
                CLIENT_NAME, "retryExceptions");

        assertThat(retried)
                .as("retry is for a momentary blip, not for business answers or server errors in general")
                .contains("feign.RetryableException")
                .contains("feign.FeignException$ServiceUnavailable");
        assertThat(retried)
                .as("a 500 is the downstream's own failure, not a 'try me again' signal — only 503 is")
                .doesNotContain("feign.FeignException$InternalServerError");
    }

    @Test
    void theRetryAndTheBreakerIgnoreTheSameNotFound() {
        Map<String, Object> root = readApplicationYml();

        @SuppressWarnings("unchecked")
        List<String> breakerIgnored = (List<String>) at(root, "resilience4j", "circuitbreaker", "instances",
                CLIENT_NAME, "ignoreExceptions");
        @SuppressWarnings("unchecked")
        List<String> retryIgnored = (List<String>) at(root, "resilience4j", "retry", "instances",
                CLIENT_NAME, "ignoreExceptions");

        assertThat(breakerIgnored).contains("feign.FeignException.NotFound");
        assertThat(retryIgnored).contains("feign.FeignException$NotFound");
        assertThat(retryIgnored).as("404 must not open the breaker NOR be retried")
                .anyMatch(s -> s.endsWith("NotFound"));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> readApplicationYml() {
        try (InputStream stream = DomainServiceRetryConfigTest.class.getResourceAsStream("/application.yml")) {
            assertThat(stream).as("application.yml must be on the test classpath").isNotNull();
            Object loaded = new Yaml().load(new InputStreamReader(stream, StandardCharsets.UTF_8));
            assertThat(loaded).isInstanceOf(Map.class);
            return (Map<String, Object>) loaded;
        } catch (Exception e) {
            throw new IllegalStateException("could not read application.yml", e);
        }
    }

    private static Object at(Map<String, Object> root, String... path) {
        Object current = root;
        for (String key : path) {
            assertThat(current).as("the path %s must exist", String.join(".", path)).isInstanceOf(Map.class);
            current = ((Map<?, ?>) current).get(key);
            assertThat(current).as("%s must be present", key).isNotNull();
        }
        return current;
    }

    /** Pull the shipped default out of a Spring `${KEY:default}` placeholder (or return the value). */
    private static String defaultOf(Object value) {
        String text = value.toString();
        if (text.startsWith("${") && text.endsWith("}")) {
            int colon = text.lastIndexOf(':');
            return colon > 2 ? text.substring(colon + 1, text.length() - 1) : "";
        }
        return text;
    }
}
