package dev.nexus.api.tools;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    /**
     * M10 v590 - the WHOLE history, newest first, for a read that must scan it.
     *
     * <p>A pin is computed from a revision's stored bytes and never indexed (ADR 0028), so "which revision
     * carries this pin" is a scan BY DESIGN. It is bounded because it is scoped to ONE declaration and
     * retention is the owner's (ADR 0032): the door that owns an unbounded scan over the whole registry does
     * not exist, and this query is not it.
     */
    List<ToolRevision> findByToolIdOrderByRevisionDesc(String toolId);

    /**
     * M10 v580 - the revisions a caller does not already have: everything newer than {@code since}.
     *
     * <p>A consumer that recorded revision 5 asks "what changed after 5" and pays only for the answer. The
     * filter is on the revision NUMBER rather than on an instant because two writes can share a microsecond
     * while a revision number cannot tie with itself.
     */
    List<ToolRevision> findByToolIdAndRevisionGreaterThanOrderByRevisionDesc(
            String toolId, int since, Pageable page);

    /** The WHOLE number of recorded revisions of one declaration. */
    long countByToolId(String toolId);

    /** The WHOLE number of revisions newer than {@code since} - what a narrowed history is a history of. */
    long countByToolIdAndRevisionGreaterThan(String toolId, int since);

    /** Remove a declaration's history with the declaration itself. */
    void deleteByToolId(String toolId);

    /**
     * M10 v581 - the owner's RETENTION: remove the revisions STRICTLY older than {@code before}.
     *
     * <p>The bound is exclusive for the same reason the receipt prune's instant is: "keep everything from this
     * revision on" is the sentence an owner can check against the answer. The newest revision is never removable
     * (the service refuses a bound past it), because a declaration with a history that explains nothing would be
     * a contract with no record of itself.
     *
     * @return how many rows this statement removed
     */
    @Modifying
    @Query("delete from ToolRevision r where r.toolId = :toolId and r.revision < :before")
    int deleteByToolIdAndRevisionLessThan(@Param("toolId") String toolId, @Param("before") int before);
}
