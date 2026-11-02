package dev.nexus.api.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * M9 — the health measurement, graded without a database or a Spring context.
 *
 * <p>The load-bearing cases are the ones a caller would notice: a reachable database has NO detail, a
 * refused one is named, an exception is reduced to its simple name (a message could carry a URL or a
 * password), uptime cannot go backwards, and the borrow happens exactly once and is closed.
 */
@ExtendWith(MockitoExtension.class)
class HealthServiceTest {

    private static final Instant STARTED = Instant.parse("2026-11-02T08:00:00Z");

    @Mock
    private DataSource dataSource;

    @Mock
    private Connection connection;

    private final ObjectMapper mapper = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .build();

    private HealthService service(Clock clock) {
        return new HealthService(dataSource, clock, "nexus-api");
    }

    private HealthService serviceAt(Instant instant) {
        return service(new SteppingClock(instant));
    }

    @Test
    void aReachableDatabaseIsReportedWithoutADetailAndWithANonNegativeLatency() throws Exception {
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.isValid(1)).thenReturn(true);

        HealthDtos.Health report = serviceAt(STARTED).report();

        assertThat(report.service()).isEqualTo("nexus-api");
        assertThat(report.startedAt()).isEqualTo(STARTED);
        assertThat(report.uptimeSeconds()).isZero();
        assertThat(report.database().reachable()).isTrue();
        assertThat(report.database().detail()).isNull();
        assertThat(report.database().latencyMs()).isGreaterThanOrEqualTo(0L);
        assertThat(mapper.valueToTree(report).get("database").has("detail")).isFalse();
    }

    @Test
    void aConnectionThatRefusesToValidateIsNamedRatherThanSilentlyUnreachable() throws Exception {
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.isValid(1)).thenReturn(false);

        HealthDtos.Health report = serviceAt(STARTED).report();

        assertThat(report.database().reachable()).isFalse();
        assertThat(report.database().detail()).isEqualTo(HealthService.INVALID_CONNECTION);
        assertThat(report.service()).isEqualTo("nexus-api");
        assertThat(report.uptimeSeconds()).isZero();
    }

    @Test
    void anExceptionIsReducedToItsSimpleNameAndItsMessageNeverReachesTheBody() throws Exception {
        when(dataSource.getConnection()).thenThrow(new SQLException(
                "connection refused at jdbc:postgresql://127.0.0.1:5432/nexus password=nexus"));

        HealthDtos.Health report = serviceAt(STARTED).report();

        assertThat(report.database().reachable()).isFalse();
        assertThat(report.database().detail()).isEqualTo("SQLException");
        String body = mapper.writeValueAsString(report);
        assertThat(body)
                .doesNotContain("jdbc:", "postgresql", "127.0.0.1", "password", "connection refused");
    }

    @Test
    void theBorrowHappensExactlyOnceAndTheConnectionIsClosed() throws Exception {
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.isValid(1)).thenReturn(true);

        serviceAt(STARTED).report();

        verify(dataSource, times(1)).getConnection();
        verify(connection, times(1)).close();
    }

    @Test
    void anExceptionOnBorrowLeavesNoConnectionToClose() throws Exception {
        SQLException refused = new SQLException("refused");
        when(dataSource.getConnection()).thenThrow(refused);

        HealthDtos.Health report = serviceAt(STARTED).report();

        assertThat(report.database().detail()).isEqualTo("SQLException");
        verifyNoInteractions(connection);
    }

    @Test
    void uptimeIsMeasuredAgainstTheInjectedClockAndNeverGoesBackwards() throws Exception {
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.isValid(1)).thenReturn(true);
        SteppingClock clock = new SteppingClock(STARTED);
        HealthService service = service(clock);

        clock.moveTo(STARTED.plusSeconds(12));
        assertThat(service.report().uptimeSeconds()).isEqualTo(12L);

        clock.moveTo(STARTED.minusSeconds(30));
        assertThat(service.report().uptimeSeconds()).isZero();

        clock.moveTo(STARTED.plusSeconds(90));
        assertThat(service.report().uptimeSeconds()).isEqualTo(90L);
        assertThat(service.report().startedAt()).isEqualTo(STARTED);
    }

    @Test
    void anUnpackagedTreeReportsUnknownRatherThanADependencyOrAGuess() {
        // Surefire runs from target/classes: there is no jar manifest for this package, and the answer
        // must say so instead of borrowing a version from a manifest on the test classpath.
        assertThat(HealthService.runtimeVersion()).isEqualTo(HealthService.UNKNOWN_VERSION);
    }

    /** A clock a test can move in both directions; the production bean uses {@code Clock.systemUTC()}. */
    private static final class SteppingClock extends Clock {

        private Instant now;

        SteppingClock(Instant now) {
            this.now = now;
        }

        void moveTo(Instant instant) {
            this.now = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
