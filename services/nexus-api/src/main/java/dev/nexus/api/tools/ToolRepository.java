package dev.nexus.api.tools;

import java.util.List;
import java.util.Optional;
import java.util.Collection;
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
     * The live rows behind a page of replacement hints, in ONE read. A hint may name nothing, so the answer is
     * a list rather than a row per name; the caller pairs it back by NAME.
     */
    List<ToolEntry> findByNameIn(Collection<String> names);

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

    /**
     * M10 v589 — the catalog's two POLARITY filters in ONE statement: deprecation and attestation.
     *
     * <p>ADR 0033 chose two explicit statements for the deprecated flag because the polarity was "a small
     * closed set". A SECOND tri-state filter makes that set four combinations, and four hand-written statements
     * plus four counts would be eight places to keep in step with a rule that is one sentence long. The
     * polarity is therefore passed as two 0/1 flags per axis, so "require it" and "require the opposite" are
     * the same query read with different arguments, and every combination is the same statement.
     *
     * <p>Each flag is 1 to REQUIRE the condition and 0 to impose nothing. All four are 0 only for a caller that
     * asked for no polarity filter, and the service does not take that path — it uses the plain derivations
     * above — so this query is never asked to be the unfiltered catalog.
     *
     * <p>{@code tested} is a claim's EXISTENCE, not its currency. The pin is computed from the row and never
     * stored (ADR 0028), so SQL cannot compare a claim's {@code contract_sha256} to the contract being served;
     * a row can therefore match {@code wantTested = 1} while its claim is stale, which is why the attestation
     * read reports {@code stillCurrent} separately (ADR 0037). The filter narrows; the verdict is one door away.
     *
     * <p>{@code owner} and {@code pattern} are null when ABSENT, named here as "no owner filter" and "no search
     * filter", so a null cannot be read as the other one's value.
     *
     * <p>M10 v613 - {@code afterKey} is the NAME a keyset page starts after, NOT a row id: the window is
     * {@code name > afterKey} in the same collation as the ORDER BY, so an insert or a removal between two
     * pages cannot shift a row from one page into another (which is exactly what an offset does). It is null
     * when the caller starts at the beginning. Because it is a VALUE rather than a lookup, a name that holds
     * no row still bounds the window - and that is stated here rather than made into a 404.
     *
     * @param wantDeprecated 1 to require a deprecation row
     * @param wantLive 1 to require the absence of one
     * @param wantTested 1 to require an attestation row
     * @param wantUntested 1 to require the absence of one
     */
    @Query("select t from ToolEntry t where (:owner is null or t.owner = :owner)"
            + " and (:pattern is null or lower(t.name) like :pattern escape '\\'"
            + " or lower(t.summary) like :pattern escape '\\')"
            + " and (:wantDeprecated = 0 or exists (select 1 from ToolDeprecation d where d.toolId = t.toolId))"
            + " and (:wantLive = 0 or not exists (select 1 from ToolDeprecation d where d.toolId = t.toolId))"
            + " and (:wantTested = 0 or exists (select 1 from ToolAttestation a where a.toolId = t.toolId))"
            + " and (:wantUntested = 0 or not exists (select 1 from ToolAttestation a where a.toolId = t.toolId))"
            + " and (:afterKey is null or t.name > :afterKey)"
            + " order by t.name asc")
    List<ToolEntry> searchCatalog(
            @Param("owner") String owner,
            @Param("pattern") String pattern,
            @Param("wantDeprecated") int wantDeprecated,
            @Param("wantLive") int wantLive,
            @Param("wantTested") int wantTested,
            @Param("wantUntested") int wantUntested,
            @Param("afterKey") String afterKey,
            Pageable page);

    /** The WHOLE number of rows the composed window above is a window of — the same four flags, no page. */
    @Query("select count(t) from ToolEntry t where (:owner is null or t.owner = :owner)"
            + " and (:pattern is null or lower(t.name) like :pattern escape '\\'"
            + " or lower(t.summary) like :pattern escape '\\')"
            + " and (:wantDeprecated = 0 or exists (select 1 from ToolDeprecation d where d.toolId = t.toolId))"
            + " and (:wantLive = 0 or not exists (select 1 from ToolDeprecation d where d.toolId = t.toolId))"
            + " and (:wantTested = 0 or exists (select 1 from ToolAttestation a where a.toolId = t.toolId))"
            + " and (:wantUntested = 0 or not exists (select 1 from ToolAttestation a where a.toolId = t.toolId))")
    long countCatalog(
            @Param("owner") String owner,
            @Param("pattern") String pattern,
            @Param("wantDeprecated") int wantDeprecated,
            @Param("wantLive") int wantLive,
            @Param("wantTested") int wantTested,
            @Param("wantUntested") int wantUntested);
}
