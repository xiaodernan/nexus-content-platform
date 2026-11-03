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
 * M9 — the traffic door's HTTP envelope: always 200, no-store, and the ledger's shape passed through as the
 * meter answered it.
 */
@ExtendWith(MockitoExtension.class)
class TrafficControllerTest {

    private static final String[] TRAFFIC_FIELDS = {
            "clientErrors", "durationMaxMs", "durationTotalMs", "latency",
            "redirects", "requests", "serverErrors", "successes", "unclassified"
    };

    private static final String[] LATENCY_FIELDS = {
            "over1000Ms", "upTo1000Ms", "upTo10Ms", "upTo250Ms", "upTo50Ms"
    };

    @Mock
    private TrafficMeter meter;

    private final ObjectMapper mapper = JsonMapper.builder().build();

    private TrafficController controller() {
        return new TrafficController(meter);
    }

    @Test
    void aLedgerAnswersTwoHundredWithTheNineFieldsAndNoStore() throws Exception {
        TrafficDtos.Traffic ledger = new TrafficDtos.Traffic(
                11, 8, 1, 1, 1, 0, 87, 40, new TrafficDtos.Latency(9, 1, 0, 1, 0));
        when(meter.snapshot()).thenReturn(ledger);

        ResponseEntity<TrafficDtos.Traffic> answer = controller().read();

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getHeaders().getCacheControl()).contains("no-store");
        assertThat(answer.getBody()).isEqualTo(ledger);

        JsonNode tree = mapper.valueToTree(answer.getBody());
        assertThat(tree.size()).isEqualTo(TRAFFIC_FIELDS.length);
        for (String field : TRAFFIC_FIELDS) {
            assertThat(tree.has(field)).as("traffic must carry %s", field).isTrue();
        }
        JsonNode latency = tree.get("latency");
        assertThat(latency.size()).isEqualTo(LATENCY_FIELDS.length);
        for (String field : LATENCY_FIELDS) {
            assertThat(latency.has(field)).as("latency must carry %s", field).isTrue();
        }
        verify(meter).snapshot();
    }

    @Test
    void aLedgerOfFailuresStillAnswersTwoHundredBecauseTrafficIsNotAServingFact() {
        when(meter.snapshot()).thenReturn(new TrafficDtos.Traffic(
                4, 0, 0, 1, 3, 0, 1200, 1000, new TrafficDtos.Latency(0, 0, 1, 2, 1)));

        ResponseEntity<TrafficDtos.Traffic> answer = controller().read();

        assertThat(answer.getStatusCode().value()).isEqualTo(200);
        assertThat(answer.getBody()).isNotNull();
        assertThat(answer.getBody().serverErrors()).isEqualTo(3);
    }
}
