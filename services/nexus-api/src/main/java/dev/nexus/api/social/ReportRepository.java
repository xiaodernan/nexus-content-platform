package dev.nexus.api.social;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

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

    /** The reports one account filed, newest first, capped by the caller's `Pageable`. */
    List<ReportEntry> findByReporterAccountIdOrderByCreatedAtDesc(String reporterAccountId, Pageable pageable);

    /** How many reports a publication has. */
    long countByTargetProjectId(String targetProjectId);

    /** The report that account already filed about that publication for that reason. */
    Optional<ReportEntry> findByReporterAccountIdAndTargetProjectIdAndReason(
            String reporterAccountId, String targetProjectId, String reason);
}
