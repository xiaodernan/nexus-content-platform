package dev.nexus.api.tools;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M10 v573 - one declaration's history, newest first.
 *
 * <p>The window is ordered by REVISION descending rather than by instant: two writes can share a microsecond,
 * but a revision number cannot tie with itself. The count is its own query for the same reason every other
 * window in this service carries one: a window is not a total.
 */
public interface ToolRevisionRepository extends JpaRepository<ToolRevision, ToolRevisionId> {

    /** The newest revision, if this declaration has any recorded history. */
    Optional<ToolRevision> findTopByToolIdOrderByRevisionDesc(String toolId);

    /** One declaration's revisions, newest first - the window, not the whole history. */
    List<ToolRevision> findByToolIdOrderByRevisionDesc(String toolId, Pageable page);

    /** The WHOLE number of recorded revisions of one declaration. */
    long countByToolId(String toolId);

    /** Remove a declaration's history with the declaration itself. */
    void deleteByToolId(String toolId);
}
