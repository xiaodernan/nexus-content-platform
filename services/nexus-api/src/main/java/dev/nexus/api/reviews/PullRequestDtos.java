package dev.nexus.api.reviews;

import java.util.List;

/**
 * M9 v868 — the wire shapes for review requests.
 *
 * <p>The diff is NOT here. The patch row already carries the bytes, and a second copy in this record would
 * be two answers to one question: the first read would be right and the second would drift. A caller that
 * needs the bytes follows {@code patchId} to {@code GET /patches/{patchId}}.
 *
 * <p>Times are epoch milliseconds at the wire, the client's own unit, like every other instant here.
 */
public final class PullRequestDtos {

    private PullRequestDtos() {
    }

    /** The body a caller sends to put a patch up for review. The title is required. */
    public record OpenPullRequest(String title, String summary, String openedBy) {
    }

    /** One review request as every answer carries it: seven fields, no bytes. */
    public record PullRequestRecord(
            String id,
            String patchId,
            String title,
            String summary,
            String status,
            String openedBy,
            long openedAt) {
    }

    /**
     * The window a listing answers with, and the two counts beside it.
     *
     * <p>{@code count} is what this answer carried; {@code total} is what the patch's whole set holds. Both
     * travel because the window alone cannot say whether the patch has more requests than it was shown.
     */
    public record PullRequestList(
            List<PullRequestRecord> pullRequests,
            int count,
            long total,
            int limit,
            int offset) {
    }
}
