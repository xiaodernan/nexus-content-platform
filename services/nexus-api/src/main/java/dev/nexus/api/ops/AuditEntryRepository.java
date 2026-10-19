package dev.nexus.api.ops;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * The repository for the audit trail.
 *
 * <p>One finder, newest first, for the same reason the publications listing has one: the cap has to reach
 * the database, and an audit trail read whole and trimmed in memory would be a table scan per page view —
 * over the one table that only ever grows.
 */
public interface AuditEntryRepository extends JpaRepository<AuditEntry, Long> {

    /** Newest first, capped by the caller's `Pageable`. */
    List<AuditEntry> findAllByOrderByOccurredAtDesc(Pageable pageable);
}
