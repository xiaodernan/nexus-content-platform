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

    /**
     * v385 — one ACTION's entries, newest first, capped by the caller's `Pageable`.
     *
     * The property is in the method name so the derivation binds it, and the filter is in the QUERY:
     * the window a caller gets is the newest N of THAT ACTION, not the newest N entries that happen to
     * carry it — the two sets diverge the moment the trail outgrows the cap, and a panel that filtered
     * in the browser would only ever have seen the second.
     */
    List<AuditEntry> findByActionOrderByOccurredAtDesc(String action, Pageable pageable);
}
