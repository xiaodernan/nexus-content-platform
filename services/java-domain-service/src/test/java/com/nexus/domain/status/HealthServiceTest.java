package com.nexus.domain.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * The health door's measurement, graded over a stubbed datasource.
 *
 * <p>Three rules, each of which the door can break without anybody noticing:
 *
 * <ul>
 *   <li>the database is MEASURED — a reachable one is reported reachable, an unreachable one is not;</li>
 *   <li>the failure is NAMED but not DESCRIBED — the body is served without authentication, so it may
 *       never carry a host, a user or a password that a JDBC message would have carried;</li>
 *   <li>liveness never touches the pool — a liveness probe that waits behind the connection pool turns
 *       "the process is up" into "the process is up, unless the database is down".</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class HealthServiceTest {

    private static final Instant STARTED = Instant.parse("2026-11-09T00:00:00Z");

    @Mock
    private DataSource dataSource;

    @Mock
    private Connection connection;

    private HealthService service;

    @BeforeEach
    void setUp() {
        service = new HealthService(dataSource, "nexus-domain-service", Clock.fixed(STARTED, ZoneOffset.UTC));
    }

    @Test
    void aReachableDatabaseIsMeasuredAndCarriesNoComplaint() throws Exception {
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.isValid(1)).thenReturn(true);

        HealthDtos.Health report = service.report();

        assertThat(report.database().reachable()).isTrue();
        assertThat(report.database().detail()).as("a database that answered has nothing to complain about").isNull();
        assertThat(report.database().latencyMs()).isGreaterThanOrEqualTo(0L);
    }

    @Test
    void theBodyNamesTheServiceAndTheVersionItIsRunning() {
        HealthDtos.Health report = service.report();

        assertThat(report.service()).isEqualTo("nexus-domain-service");
        assertThat(report.version()).isEqualTo(HealthService.UNKNOWN_VERSION);
        assertThat(report.startedAt()).isEqualTo(STARTED);
    }

    @Test
    void anUnreachableDatabaseIsNamedButNotDescribed() throws Exception {
        when(dataSource.getConnection()).thenThrow(new IllegalStateException("password=hunter2 at db.internal:5432"));

        HealthDtos.Health report = service.report();

        assertThat(report.database().reachable()).isFalse();
        assertThat(report.database().detail())
                .as("the body is public; it may name the failure but not describe the machine")
                .isEqualTo("IllegalStateException")
                .doesNotContain("hunter2")
                .doesNotContain("db.internal");
    }

    @Test
    void aBorrowedConnectionThatRefusesToValidateIsNamedToo() throws Exception {
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.isValid(1)).thenReturn(false);

        HealthDtos.Health report = service.report();

        assertThat(report.database().reachable()).isFalse();
        assertThat(report.database().detail()).isEqualTo(HealthService.INVALID_CONNECTION);
    }

    @Test
    void livenessNeverBorrowsAConnection() throws Exception {
        HealthDtos.Liveness liveness = service.liveness();

        assertThat(liveness.service()).isEqualTo("nexus-domain-service");
        assertThat(liveness.uptimeSeconds()).isEqualTo(0L);
        verify(dataSource, never()).getConnection();
    }
}
