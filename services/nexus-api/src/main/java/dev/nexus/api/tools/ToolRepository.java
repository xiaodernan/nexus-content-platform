package dev.nexus.api.tools;

import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * M10 v571 — the tool registry's doors.
 *
 * <p>Every query is a derived one. The listing is ordered by NAME rather than by creation instant because a
 * catalog is read by name: two tools registered a second apart must answer in the order a caller can predict
 * from the only field it must know. The whole-table query and the owner-scoped one are separate derivations
 * rather than one query with a nullable parameter, so "the whole catalog" and "one account's tools" cannot be
 * confused by a null that silently meant the other.
 */
public interface ToolRepository extends JpaRepository<ToolEntry, String> {

    /** The row that holds this name, when the name is taken — the lookup that makes a duplicate a 409. */
    Optional<ToolEntry> findByName(String name);

    /**
     * The declaration, locked for the duration of the caller's transaction.
     *
     * <p>M10 v573: an update appends the next revision, and two concurrent updates that both read "the newest
     * is 2" would both try to write 3. The parent row is the thing they share, so locking it serializes the
     * numbering without a second counter column that could drift from the history it describes.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from ToolEntry t where t.toolId = :toolId")
    Optional<ToolEntry> lockById(@Param("toolId") String toolId);
    /** The whole catalog, name ascending — the window, not the whole table. */
    List<ToolEntry> findAllByOrderByNameAsc(Pageable page);

    /** One owner's declarations, name ascending. */
    List<ToolEntry> findByOwnerOrderByNameAsc(String owner, Pageable page);

    /** One owner's WHOLE number of declarations — what its window is a window of. */
    long countByOwner(String owner);

    /**
     * M10 v576 — the catalog narrowed to declarations whose NAME or SUMMARY contains a literal pattern.
     *
     * <p>The pattern arrives already lowercased and with {@code %}, {@code _} and {@code \} escaped, so a
     * caller's percent sign searches for a percent sign instead of answering the whole catalog. The escape
     * character is declared in the query, not assumed from the database's dialect.
     */
    @Query("select t from ToolEntry t where lower(t.name) like :pattern escape '\\'"
            + " or lower(t.summary) like :pattern escape '\\' order by t.name asc")
    List<ToolEntry> searchAll(@Param("pattern") String pattern, Pageable page);

    /** The same search narrowed to ONE owner's declarations. */
    @Query("select t from ToolEntry t where t.owner = :owner and (lower(t.name) like :pattern escape '\\'"
            + " or lower(t.summary) like :pattern escape '\\') order by t.name asc")
    List<ToolEntry> searchByOwner(
            @Param("owner") String owner, @Param("pattern") String pattern, Pageable page);

    /** The WHOLE number of matches the search window is a window of. */
    @Query("select count(t) from ToolEntry t where lower(t.name) like :pattern escape '\\'"
            + " or lower(t.summary) like :pattern escape '\\'")
    long countSearchAll(@Param("pattern") String pattern);

    /** The WHOLE number of one owner's matches. */
    @Query("select count(t) from ToolEntry t where t.owner = :owner"
            + " and (lower(t.name) like :pattern escape '\\' or lower(t.summary) like :pattern escape '\\')")
    long countSearchByOwner(@Param("owner") String owner, @Param("pattern") String pattern);
}
