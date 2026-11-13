package dev.nexus.api.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.util.UUID;

/**
 * The wire shapes for the DOMAIN service's project rows.
 *
 * <p>They are declared HERE rather than shared with `services/java-domain-service`, on purpose: that
 * service is a separate deployable with its own release cadence, and a shared Java module between
 * two services would couple them at the COMPILE level — the exact thing a microservice boundary
 * exists to prevent. The contract between them is HTTP, and the contract is these records.
 */
public final class DomainDtos {

    private DomainDtos() {
    }

    /**
     * One project row, as the domain service answers it.
     *
     * <p>The fields are the ones a caller actually needs to identify a project and to say who owns
     * it. A field the caller does not read is not part of the contract, and a contract that grows
     * with every column of somebody else's table is a contract that will break.
     *
     * <p>Every field here is one the domain service ACTUALLY SENDS. The service's own response carries
     * more ({@code description}, {@code forkOf}), and those are ignored rather than declared: a declared
     * field the downstream never sends is a field that is always null, and a field that is always null
     * is indistinguishable from a field that is null today. {@code createdAt} and {@code updatedAt}
     * were in this record before the domain service sent them — they are here because the service now
     * sends them, which it did not until its DTO carried the timestamps the entity already had.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DomainProject(
            UUID id,
            UUID ownerId,
            String slug,
            String name,
            String kind,
            String visibility,
            Instant createdAt,
            Instant updatedAt) {
    }

    /**
     * The answer of a domain read, with the three states kept apart.
     *
     * <p>These are different facts and the shape keeps them apart:
     *
     * <ul>
     *   <li>{@code found} — the domain service holds that project;</li>
     *   <li>{@code not-found} — the domain service answered, and it does not hold that project;</li>
     *   <li>{@code downstream-unavailable} — the domain service could not be reached at all.</li>
     * </ul>
     *
     * <p>The third one is the reason this type exists. A caller that asked "is there a project with
     * this id?" and got a 404 while the service was down would conclude the project is gone, and
     * would say so — to a user, in a list, in a message. The service being unreachable and the
     * project being absent are DIFFERENT FACTS, and the artifact page in this very service already
     * refuses to confuse them (503 for "the service is not running", 404 for "nothing is published
     * here"). This answer keeps the same discipline across the service boundary.
     *
     * <p>ONE body type carries all three states, and the HTTP status says which happened — the
     * house style this service already uses for its health door. The earlier draft of this record
     * returned a {@code DomainProject} with every field null for the 503 case, which is a
     * FABRICATED EMPTY PROJECT: a caller that ignored the status code would have seen a project
     * with no name and no owner. A missing project and an unreachable service must not be spelled
     * the same way, even in a body.
     * <p>{@code failure} says WHICH failure, in a stable word a caller may branch on
     * ({@code connection-refused}, {@code circuit-breaker-open}, {@code timeout}, …), and
     * {@code reason} says the same thing in a sentence. The reason is what a human reads; the
     * kind is what a program reads — and a program cannot parse an English sentence without
     * guessing. Both are absent when nothing failed.
     */
    public record DomainResponse(String state, DomainProject project, String reason, String failure) {

        public static DomainResponse found(DomainProject project) {
            return new DomainResponse("found", project, null, null);
        }

        public static DomainResponse notFound() {
            return new DomainResponse("not-found", null,
                    "the domain service answered and holds no project with that id", null);
        }

        public static DomainResponse unavailable(DomainFailure failure) {
            return new DomainResponse("downstream-unavailable", null, failure.reason(), failure.kind());
        }

        public boolean isFound() {
            return "found".equals(state);
        }

        public boolean isUnavailable() {
            return "downstream-unavailable".equals(state);
        }
    }
}
