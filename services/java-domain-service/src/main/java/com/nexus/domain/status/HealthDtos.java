package com.nexus.domain.status;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/**
 * The health door's two facts, kept apart.
 *
 * <p>Same shape and the same names as {@code services/nexus-api}'s health door, on purpose: an operator
 * reading two services' health must not have to learn two vocabularies, and a proof that reads both
 * must not have two parsers.
 *
 * <p>A process that answers is not a process that can serve, so the body never collapses "running" and
 * "database reachable" into one boolean. The detail is a SHORT token — never a message, a stack trace, a
 * JDBC URL or a credential — because this body is served without authentication and may be read from a log.
 */
public final class HealthDtos {

    private HealthDtos() {
    }

    /**
     * One answer from {@code GET /health}: who is running, since when, and whether its database answers.
     */
    public record Health(
            String service,
            String version,
            Instant startedAt,
            long uptimeSeconds,
            Database database) {
    }

    /**
     * The database measurement. {@code detail} is omitted when the database answered, because an empty
     * reason is not a fact worth a field.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Database(boolean reachable, long latencyMs, String detail) {
    }

    /**
     * The process fact ALONE, answered by {@code GET /health/live}.
     *
     * <p>There is no {@code database} field, and that absence is the claim: a liveness probe must answer
     * while the pool is exhausted or the database is down, because restarting a healthy process does not
     * repair either.
     */
    public record Liveness(
            String service,
            String version,
            Instant startedAt,
            long uptimeSeconds) {
    }
}
