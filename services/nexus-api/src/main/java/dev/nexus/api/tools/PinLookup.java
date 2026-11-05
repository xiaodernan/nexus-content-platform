package dev.nexus.api.tools;

import java.util.List;

/**
 * M10 v615 — the answer to "which declarations carry this pin", as the service computes it.
 *
 * <p>A pin hashes the summary and the canonical schema, so it names CONTENT, not a row: two declarations
 * with the same sentence and schema share a pin, and one declaration can carry the same pin twice (A → B →
 * A). The lookup therefore answers a LIST, one entry per declaration, each naming the NEWEST revision that
 * carries the pin and whether those bytes are the ones the declaration serves today.
 *
 * <p>The pin is stored nowhere (ADR 0028): finding these rows is a scan of the revision table, and that cost
 * is stated rather than hidden behind a column that would have to be maintained and backfilled.
 */
record PinLookup(String pin, List<Match> matches) {

    /** One declaration that ever recorded the pin. */
    record Match(
            String toolId,
            String name,
            String owner,
            int revision,
            String summary,
            String contractSha256,
            long recordedAt,
            boolean current) {
    }
}