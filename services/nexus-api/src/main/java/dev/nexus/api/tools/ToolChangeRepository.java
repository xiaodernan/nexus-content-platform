package dev.nexus.api.tools;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * M10 v583 - the registry's journal, read FORWARD from a cursor.
 *
 * <p>Oldest first, unlike every other window in this service. A history is read by a person looking back; a feed
 * is read by a process moving a cursor forward, and ascending order lets it advance the cursor without ever
 * skipping an entry that was allocated before the page it is holding. The alternative - newest first - would
 * make a poller page backwards into the past while new writes pile up in front of it.
 *
 * <p>M10 v584 adds the two NARROWINGS a watcher needs: a kind (watch only the removals) and a tool id (watch
 * one declaration's life). Both are nullable parameters on ONE statement rather than four derivations, the
 * shape the catalog already uses: each predicate is "this filter or no filter", so the window and the count
 * cannot disagree about which filters applied.
 *
 * <p>M10 v621 adds the RETENTION pair: the oldest seq still held (the boundary a pruned cursor is measured
 * against) and a prefix delete that can only remove entries BELOW a named bound. The delete is one statement
 * with no filter, because a prefix is the only shape a forward cursor can describe.
 */
public interface ToolChangeRepository extends JpaRepository<ToolChange, Long> {

    /**
     * The entries a caller does not already have, OLDEST first, optionally narrowed to one kind and one
     * declaration. A null filter is the ABSENT filter - it never means "the empty string".
     */
    @Query("select c from ToolChange c where c.seq > :since"
            + " and (:kind is null or c.kind = :kind)"
            + " and (:toolId is null or c.toolId = :toolId)"
            + " order by c.seq asc")
    List<ToolChange> feed(
            @Param("since") long since,
            @Param("kind") String kind,
            @Param("toolId") String toolId,
            Pageable page);

    /** The WHOLE number of entries the window above is a window of - the SAME three predicates. */
    @Query("select count(c) from ToolChange c where c.seq > :since"
            + " and (:kind is null or c.kind = :kind)"
            + " and (:toolId is null or c.toolId = :toolId)")
    long feedCount(
            @Param("since") long since,
            @Param("kind") String kind,
            @Param("toolId") String toolId);

    /** The oldest seq the journal still holds, or null when it holds nothing. Never narrowed by a filter. */
    @Query("select min(c.seq) from ToolChange c")
    Long oldestSeq();

    /** The newest seq the journal holds, or null when it holds nothing. Read without a lock, deliberately. */
    @Query("select max(c.seq) from ToolChange c")
    Long newestSeq();

    /**
     * Remove every entry BELOW {@code before} - one prefix, never a middle range. The caller has already
     * refused a bound above the newest entry, so at least one entry (and therefore a describable boundary)
     * survives every prune.
     */
    @Modifying
    @Query("delete from ToolChange c where c.seq < :before")
    int pruneBefore(@Param("before") long before);
}
