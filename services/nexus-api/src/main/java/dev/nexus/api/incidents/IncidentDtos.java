package dev.nexus.api.incidents;

import java.util.List;

/**
 * M9 v594 — the wire shapes for incidents.
 *
 * <p>One record is used for every answer that carries an incident: the open's 201, the read's 200, the
 * resolve's 200 and every row of a listing. A second "created" shape would drift from the read's, and a
 * caller storing an incident would have to reconcile the two.
 *
 * <p>Times are epoch MILLISECONDS at the wire, the client's own unit, the same as every other instant this
 * service answers with. {@code resolvedAt} is present and null until resolved, so a caller can tell "not
 * resolved" from "the field was not sent".
 */
public final class IncidentDtos {

    private IncidentDtos() {
    }

    /** The body a caller sends to open an incident. Every field but the title and severity may be absent. */
    public record OpenIncident(
            String title, String summary, String severity, String targetKind, String targetId, String openedBy) {
    }

    /** One incident as every answer carries it: eleven fields, two of them null until it is resolved. */
    public record IncidentRecord(
            String id,
            String title,
            String summary,
            String severity,
            String targetKind,
            String targetId,
            String status,
            String openedBy,
            long openedAt,
            String resolvedBy,
            Long resolvedAt) {
    }

    /**
     * The window a listing answers with, and the two counts beside it.
     *
     * <p>{@code count} is what this answer CARRIED; {@code total} is how many the whole (narrowed) table
     * holds. Both travel because a window alone cannot say whether a filter hid something: with the
     * narrowing applied in the query, the caller never sees the excluded rows and the total is the one
     * number that can still say the filter is hiding them.
     *
     * <p>{@code status} and {@code severity} echo the narrowing that was APPLIED (null when none was), and
     * {@code limit}/{@code offset} are the values the service actually used, after the cap and the floor —
     * so a caller can tell a clamped request from the one it typed.
     */
    public record IncidentList(
            List<IncidentRecord> incidents,
            int count,
            long total,
            int limit,
            int offset,
            String status,
            String severity) {
    }

    /** The body a caller sends to resolve one — who did it, when the caller knows. */
    public record ResolveIncident(String resolvedBy) {
    }
}
