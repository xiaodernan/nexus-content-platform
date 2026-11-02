package dev.nexus.api.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M9 — the health door's HTTP envelope: the status is the database fact, the body survives either answer,
 * and the header forbids caching.
 */
@ExtendWith(MockitoExtension.class)
class HealthControllerTest {

    private static final Instant STARTED = Instant.parse("2026-11-02T08:00:00Z");

    @Mock
    private HealthService health;

    private final ObjectMapper mapper = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .build();

    private HealthController controller() {
        return new HealthController(health);
    }

    private HealthDtos.Health report(boolean reachable, long latencyMs, String detail) {
        return new HealthDtos.Health(
                "nexus-api", "0.1.0-SNAPSHOT", STARTED, 42L,
                new HealthDtos.Database(reachable, latencyMs, detail));
    }

    @Test
    void aReachableDatabaseAnswersTwoHundredWithTheWholeShapeAndNoStore() throws Exception {
        when(health.report()).thenReturn(report(true, 3L, null));

        ResponseEntity<HealthDtos.Health> answer = controller().read();

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getHeaders().getCacheControl()).contains("no-store");
        HealthDtos.Health body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.service()).isEqualTo("nexus-api");
        assertThat(body.version()).isEqualTo("0.1.0-SNAPSHOT");
        assertThat(body.startedAt()).isEqualTo(STARTED);
        assertThat(body.uptimeSeconds()).isEqualTo(42L);
        assertThat(body.database().reachable()).isTrue();
        assertThat(body.database().latencyMs()).isEqualTo(3L);
        assertThat(body.database().detail()).isNull();
        assertThat(mapper.writeValueAsString(body)).doesNotContain("\"detail\"");
        verify(health).report();
    }

    @Test
    void anUnreachableDatabaseAnswersFiveZeroThreeAndStillSaysWhy() {
        when(health.report()).thenReturn(report(false, 30001L, "invalid-connection"));

        ResponseEntity<HealthDtos.Health> answer = controller().read();

        assertThat(answer.getStatusCode().value()).isEqualTo(503);
        assertThat(answer.getHeaders().getCacheControl()).contains("no-store");
        HealthDtos.Health body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.database().reachable()).isFalse();
        assertThat(body.database().detail()).isEqualTo("invalid-connection");
        assertThat(body.service()).isEqualTo("nexus-api");
        assertThat(body.uptimeSeconds()).isEqualTo(42L);
    }
}
