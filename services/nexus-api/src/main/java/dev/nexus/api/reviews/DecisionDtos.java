package dev.nexus.api.reviews;

import java.util.List;

/**
 * M9 v869 — the wire shapes for decisions.
 *
 * <p>One record is used by every answer that carries a decision. Times are epoch milliseconds at the wire,
 * the client's own unit, like every other instant here.
 */
public final class DecisionDtos {

    private DecisionDtos() {
    }

    /** The body a caller sends to decide one request. The verdict is required and is one of two words. */
    public record Decide(String verdict, String reason, String decidedBy) {
    }

    /** One decision as every answer carries it: six fields. */
    public record DecisionRecord(
            String id,
            String pullRequestId,
            String verdict,
            String reason,
            String decidedBy,
            long decidedAt) {
    }

    /**
     * The window a listing answers with, and the two counts beside it.
     *
     * <p>{@code count} is what this answer carried; {@code total} is what the request's whole set holds.
     */
    public record DecisionList(
            List<DecisionRecord> decisions,
            int count,
            long total,
            int limit,
            int offset) {
    }
}
