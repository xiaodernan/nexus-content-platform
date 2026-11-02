package dev.nexus.api.status;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/**
 * M9 — the health door's two facts, kept apart.
 *
 * <p>A process that answers is not a process that can serve. The response therefore never collapses
 * "running" and "database reachable" into one boolean: the first is the fact that this code ran at all, and
 * the second is a measurement with a latency and, when it fails, a reason.
 *
 * <p>The reason is deliberately a SHORT token — {@code invalid-connection} or an exception's simple name —
 * never a message, a stack trace, a JDBC URL or a credential. A probe must be safe to read from a log and
 * from an unauthenticated caller; the detail is enough to name the failure without describing the machine.
 */
public final class HealthDtos {

    private HealthDtos() {
    }

    /**
     * One answer from {@code GET /health}: who is running, since when, and whether its database answers.
     *
     * <p>{@code startedAt} is the instant this service's health component was constructed, which is the
     * earliest moment this build can honestly call "started" — before the web server accepts a connection.
     */
    public record Health(
            String service,
            String version,
            Instant startedAt,
            long uptimeSeconds,
            Database database) {
    }

    /**
     * The database measurement. {@code latencyMs} is how long the probe took, measured on a monotonic clock
     * and never negative; {@code detail} is omitted when the database answered, because an empty reason is
     * not a fact worth a field.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Database(boolean reachable, long latencyMs, String detail) {
    }
}
