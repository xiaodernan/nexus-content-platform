package dev.nexus.api.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

/**
 * M9 — the vitals door's HTTP envelope: a sample always answers 200, the shape is exactly the six numbers,
 * and the header forbids caching.
 */
@ExtendWith(MockitoExtension.class)
class VitalsControllerTest {

    private static final String[] VITALS_FIELDS = {
            "heapCommittedBytes", "heapMaxBytes", "heapUsedBytes",
            "liveThreads", "peakThreads", "processors"
    };

    @Mock
    private VitalsService vitals;

    private final ObjectMapper mapper = JsonMapper.builder().build();

    private VitalsController controller() {
        return new VitalsController(vitals);
    }

    @Test
    void aSampleAnswersTwoHundredWithExactlyTheSixNumbersAndNoStore() throws Exception {
        when(vitals.read()).thenReturn(new HealthDtos.Vitals(100L, 200L, 400L, 17, 19, 8));

        ResponseEntity<HealthDtos.Vitals> answer = controller().read();

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getHeaders().getCacheControl()).contains("no-store");
        HealthDtos.Vitals body = answer.getBody();
        assertThat(body).isNotNull();
        assertThat(body.heapUsedBytes()).isEqualTo(100L);
        assertThat(body.heapCommittedBytes()).isEqualTo(200L);
        assertThat(body.heapMaxBytes()).isEqualTo(400L);
        assertThat(body.liveThreads()).isEqualTo(17);
        assertThat(body.peakThreads()).isEqualTo(19);
        assertThat(body.processors()).isEqualTo(8);
        JsonNode tree = mapper.valueToTree(body);
        assertThat(tree.size()).isEqualTo(VITALS_FIELDS.length);
        for (String field : VITALS_FIELDS) {
            assertThat(tree.has(field)).as("vitals must carry %s", field).isTrue();
        }
        verify(vitals).read();
    }

    @Test
    void anUndefinedMaximumIsServedAsMinusOneAndStillAnswersTwoHundred() {
        when(vitals.read()).thenReturn(new HealthDtos.Vitals(0L, 0L, -1L, 1, 1, 1));

        ResponseEntity<HealthDtos.Vitals> answer = controller().read();

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().heapMaxBytes()).isEqualTo(-1L);
    }
}
