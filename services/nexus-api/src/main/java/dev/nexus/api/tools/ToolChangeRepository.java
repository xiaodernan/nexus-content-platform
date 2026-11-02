package dev.nexus.api.tools;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M10 v583 - the registry's journal, read FORWARD from a cursor.
 *
 * <p>Oldest first, unlike every other window in this service. A history is read by a person looking back; a feed
 * is read by a process moving a cursor forward, and ascending order lets it advance the cursor without ever
 * skipping an entry that was allocated before the page it is holding. The alternative - newest first - would
 * make a poller page backwards into the past while new writes pile up in front of it.
 */
public interface ToolChangeRepository extends JpaRepository<ToolChange, Long> {

    /** The entries a caller does not already have: everything with a seq greater than its cursor. */
    List<ToolChange> findBySeqGreaterThanOrderBySeqAsc(long since, Pageable page);

    /** The WHOLE number of entries newer than the cursor - what the page is a page of. */
    long countBySeqGreaterThan(long since);
}