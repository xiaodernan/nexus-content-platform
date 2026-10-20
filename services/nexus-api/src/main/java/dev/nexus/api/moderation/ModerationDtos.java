package dev.nexus.api.moderation;

import java.util.List;

/**
 * M7 v304 — the wire shapes for the OWNER'S DESK.
 *
 * <p>A desk row is a report with the two things that make it actionable and the one thing that does not:
 *
 * <ul>
 *   <li>{@code reason} — the closed set of four, so the owner can count by it.
 *   <li>{@code detail} — the reporter's own WORDS. They are stored verbatim and shown verbatim, because
 *       the whole point of the desk is that somebody finally READS them.
 *   <li>{@code targetProjectId} and {@code targetTitle} — which of the owner's publications it is about.
 *   <li>NO {@code reporterId} and NO {@code handle}. The desk does not name the reporter; see
 *       {@link ModerationService} for why, which is the load-bearing decision of this package.
 * </ul>
 */
public final class ModerationDtos {

    private ModerationDtos() {
    }

    /** One report, as the desk shows it. */
    public record DeskEntry(
            String reportId,
            String targetProjectId,
            String targetTitle,
            String reason,
            String detail,
            String status,
            long createdAt) {
    }

    /**
     * The desk: the reports against the publications this account owns, newest first.
     *
     * <p>{@code limit} is the cap the service applied, so a client can say what it asked for and what it
     * got — the same rule every other list in this service keeps.
     */
    public record DeskAnswer(
            String ownerAccountId,
            List<DeskEntry> reports,
            int limit) {
    }

    /**
     * The answer to a DISPOSITION.
     *
     * <p>{@code moved} says whether the status actually changed. A report that was already disposed of is
     * not an error — it is a fact — so the answer carries the status it is at either way, and the caller
     * is never told a report moved when it did not.
     */
    public record DispositionAnswer(
            String reportId,
            String status,
            boolean moved) {
    }
}
