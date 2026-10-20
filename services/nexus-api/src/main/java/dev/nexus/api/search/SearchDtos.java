package dev.nexus.api.search;

import java.time.Instant;
import java.util.List;

/**
 * v290 — the wire shapes for SEARCH.
 *
 * <p>The package defines its OWN shapes rather than reusing the publish package's DTOs, on purpose: those
 * DTOs are in flight in a concurrent lane, and a search that would break when a record grew a field is a
 * search that would break the build. The JSON is the same either way — the client reads a listing, and
 * this answers with a listing.
 */
public final class SearchDtos {

    private SearchDtos() {
    }

    /**
     * Who published something, as a claim carries it.
     *
     * <p>The shape is the one the client’s own claim produces, so a client that knows one knows the
     * other. {@code claimedAt} is MILLISECONDS since the epoch, for the reason v263 recorded.
     */
    public record SearchClaim(String accountId, String handle, String assurance, Long claimedAt) {
    }

    /** One publication, as a listing row. */
    public record SearchEntry(
            String projectId,
            String title,
            int version,
            Instant publishedAt,
            String url,
            SearchClaim owner) {
    }

    /**
     * The answer to a search.
     *
     * <p>{@code count} is how many this answer CARRIED, {@code limit} is the cap that was applied and
     * {@code offset} is the window — all three, so a caller can tell "the 25th result" from "the 25th
     * page" without keeping its own bookkeeping.
     */
    public record SearchAnswer(List<SearchEntry> publications, int count, int limit, int offset) {
    }
}
