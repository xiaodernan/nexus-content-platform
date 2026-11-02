package dev.nexus.api.tools;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M10 v579 - one declaration's chain of holders, newest first.
 *
 * <p>Ordered by TRANSFER descending rather than by instant, for the reason the revision window is ordered by
 * revision: two handovers can share a microsecond, but a transfer number cannot tie with itself. The count is
 * its own query - a window is not a total.
 */
public interface ToolOwnershipRepository extends JpaRepository<ToolOwnership, ToolOwnershipId> {

    /** The newest handover, if this declaration has ever changed hands. */
    Optional<ToolOwnership> findTopByToolIdOrderByTransferDesc(String toolId);

    /** One declaration's handovers, newest first - the window, not the whole chain. */
    List<ToolOwnership> findByToolIdOrderByTransferDesc(String toolId, Pageable page);

    /** The WHOLE number of handovers recorded for one declaration. */
    long countByToolId(String toolId);

    /** Remove a declaration's chain of holders with the declaration itself. */
    void deleteByToolId(String toolId);
}