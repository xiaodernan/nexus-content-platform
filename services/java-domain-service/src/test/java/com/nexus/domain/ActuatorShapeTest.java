package com.nexus.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The manifest of the service in a file you can {@code cat}: which actuator endpoints exist, what
 * the name says, nothing else. A unit test of the shape, not of the runtime — the runtime behaviour
 * lives in the {@code /actuator/info} live proof and the gateway wiring tests.
 */
class ActuatorShapeTest {

    @Test
    void onlyHealthAndInfoAreExposed() throws Exception {
        Path yml = Path.of("src/main/resources/application.yml");
        String content = Files.readString(yml);

        // The actuator exposure line must name exactly {health, info} and nothing else.
        List<String> exposureLines = content.lines()
                .filter(l -> l.trim().startsWith("include:"))
                .map(String::trim)
                .toList();
        assertThat(exposureLines).containsExactly("include: health,info");

        // Static info: belongs to this service, not to some other build artifact.
        assertThat(content).contains("name: java-domain-service");
    }

    @Test
    void showDetailsNever() throws Exception {
        Path yml = Path.of("src/main/resources/application.yml");
        String content = Files.readString(yml);

        assertThat(content)
                .doesNotContainPattern("(?i)show-details\\s*:\\s*(always|when-authorized)");
    }
}
