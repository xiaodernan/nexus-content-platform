package dev.nexus.api.social;

import java.util.List;

/**
 * M7 v295 — the wire shapes for REPORTS.
 *
 * <p>The report itself is the client's own declared shape, field for field: {@code id},
 * {@code reporterId}, {@code targetId}, {@code reason}, {@code detail}, {@code status} and
 * {@code createdAt} in epoch MILLISECONDS. The service sends the reporter's handle and assurance as
 * well — the same rule the like, the comment and the follow follow: the assurance travels with the
 * actor so a reader is TOLD what the report is worth.
 *
 * <p>The reasons are a CLOSED SET of four, exactly as the client declares them, so a reader can count by
 * reason and a caller cannot invent a fifth.
 */
public final class ReportDtos {

    private ReportDtos() {
    }

    /** The reasons a report may carry — the client's own four, and no others. */
    public static final String REASON_SPAM = "spam";
    public static final String REASON_HARASSMENT = "harassment";
    public static final String REASON_ILLEGAL = "illegal";
    public static final String REASON_OTHER = "other";

    /** The statuses a report may carry. */
    public static final String STATUS_OPEN = "open";
    public static final String STATUS_REVIEWED = "reviewed";
    public static final String STATUS_RESOLVED = "resolved";
    public static final String STATUS_REJECTED = "rejected";

    /**
     * v304 — the OWNER's status: the owner of the reported publication has seen the report.
     *
     * <p>It is NOT {@link #STATUS_REVIEWED} and NOT {@link #STATUS_RESOLVED}. Those two are a
     * MODERATOR's vocabulary, and this build has no moderator: they are declared so that a future one
     * has a name to use, and they are unreachable on purpose. What the owner can honestly say is that they
     * have seen it — which is a smaller claim than a review and a much smaller one than a resolution.
     */
    public static final String STATUS_ACKNOWLEDGED = "acknowledged";

    /** WHO is reporting. The shape is the one the Studio's own claim produces. */
    public record ReportClaim(String accountId, String handle, String assurance, Long claimedAt) {
    }

    /** A report request: which publication, who is reporting, why, and what they say about it. */
    public record ReportRequest(String projectId, ReportClaim claim, String reason, String detail) {
    }

    /** One report. The client's own `Report` shape, plus the two fields the service knows. */
    public record Report(
            String id,
            String reporterId,
            String targetId,
            String reason,
            String detail,
            String status,
            long createdAt,
            String handle,
            String assurance) {
    }

    /**
     * The answer to a report question.
     *
     * <p>{@code count} is how many reports the answer carried and {@code limit} is the cap that was
     * applied — both, so a caller can tell "three reports" from "there are at least three".
     */
    public record ReportAnswer(String projectId, List<Report> reports, int count, int limit) {
    }
}
