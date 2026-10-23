package dev.nexus.api.social;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;

/**
 * M7 v295 — the repository for REPORTS.
 *
 * <p>Every windowed finder carries a {@link Pageable}, so the cap reaches the DATABASE: a report list
 * read whole and trimmed in memory would be a table scan on every page load.
 */
public interface ReportRepository extends JpaRepository<ReportEntry, String> {

    /** ONE report by its own id — the row a withdrawal names. */
    Optional<ReportEntry> findByReportId(String reportId);

    /** The reports about one publication, newest first, capped by the caller's `Pageable`. */
    List<ReportEntry> findByTargetProjectIdOrderByCreatedAtDesc(String targetProjectId, Pageable pageable);

    /**
     * v304 — the reports about ANY of several publications, newest first.
     *
     * <p>This is the finder the moderation package's desk needs: an owner may have many publications, and
     * asking the database once per publication would be a round trip per work. The set is the owner's own
     * publications, so the `IN` is bounded by the window the caller chose.
     */
    List<ReportEntry> findByTargetProjectIdInOrderByCreatedAtDesc(
            Collection<String> targetProjectIds, Pageable pageable);

    /**
     * v326 — the SAME finder, narrowed to one reason.
     *
     * <p>The narrowing happens IN the query and not after it: the desk's rows are a WINDOW (the most
     * recent N), and a window taken before the narrowing would answer a different question than the
     * one asked — "the most recent hundred reports, of which these are the spam ones" rather than "the
     * most recent hundred spam reports". The cap has to reach the database either way, and the two
     * questions must not be confused.
     */
    List<ReportEntry> findByTargetProjectIdInAndReasonOrderByCreatedAtDesc(
            Collection<String> targetProjectIds, String reason, Pageable pageable);

    /** The reports one account filed, newest first, capped by the caller's `Pageable`, filtered by target_type. */
    List<ReportEntry> findByReporterAccountIdOrderByCreatedAtDesc(String reporterAccountId, Pageable pageable, String targetType);

    /**
     * v312 — the reports about ANY of several publications, COUNTED by reason and by status.
     *
     * <p>This is a GROUPED query rather than a count per publication, because the tally a creator reads
     * has to count EVERY report against their work — and the desk's rows are a WINDOW (the most recent
     * hundred). A tally computed from the window would say "3 reports" when there are thirty, and the
     * number that is wrong is the one a creator acts on.
     *
     * <p>The rows are {@code (reason, status, count)}: one row per pair that occurs, so the caller can
     * add them up the way it wants and a reason with no reports simply does not appear.
     */
    @Query("SELECT r.reason, r.status, COUNT(r) FROM ReportEntry r WHERE r.targetProjectId IN :targets GROUP BY r.reason, r.status")
    List<Object[]> countByTargetsGroupedByReasonAndStatus(
            @Param("targets") Collection<String> targetProjectIds);

    /** How many reports a publication has. */
    long countByTargetProjectId(String targetProjectId);

    /** v380 — total reports filed by this account (for the panel to say "X of Y"). */
    long countByReporterAccountId(String reporterAccountId);

    /** The report that account already filed about that publication for that reason. */
    Optional<ReportEntry> findByReporterAccountIdAndTargetProjectIdAndReason(
            String reporterAccountId, String targetProjectId, String reason);
}
