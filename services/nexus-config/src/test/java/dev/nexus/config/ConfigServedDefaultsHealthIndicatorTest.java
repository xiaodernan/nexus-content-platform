package dev.nexus.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.Status;

/**
 * The shared default (`nexus-config/application.yml`) is the blast radius of every Spring client in this
 * fleet — §SC-71 exists because it was once clobbered and every client inherited the wrong endpoints.
 * This test pins the indicator's positive path to the exact file the jar ships, so the answer is a fact,
 * not a stub: a build that accidentally ships a widened shared default would fail here in CI long before
 * a client boots with it.
 */
class ConfigServedDefaultsHealthIndicatorTest {

    @Test
    void theShippedSharedDefaultIsNarrowed_healthAndInfoOnly() {
        Health health = new ConfigServedDefaultsHealthIndicator().health();
        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails()).containsEntry("mode", "native-classpath");
    }
}
