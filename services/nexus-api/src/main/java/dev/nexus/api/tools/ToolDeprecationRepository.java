package dev.nexus.api.tools;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * M10 v575 - deprecations, newest first, one row per deprecated declaration.
 */
public interface ToolDeprecationRepository extends JpaRepository<ToolDeprecation, String> {

    /** The deprecation of one tool, when it has one. */
    Optional<ToolDeprecation> findByToolId(String toolId);

    /**
     * The whole list of deprecated tools, newest deprecation first at the WIRE's millisecond precision, id
     * breaking a tie - the window. The database stores microseconds, so truncating here keeps the order the
     * caller can reproduce from the {@code deprecatedAt} value the response carries.
     */
    @Query(value = "select * from tool_deprecation d"
            + " order by date_trunc('milliseconds', d.deprecated_at) desc, d.tool_id asc",
            nativeQuery = true)
    List<ToolDeprecation> firstPage(Pageable page);

    /** The same window, narrowed to the declarations one account holds. */
    @Query(value = "select d.* from tool_deprecation d"
            + " join tool_entry e on e.tool_id = d.tool_id"
            + " where e.owner_account_id = :owner"
            + " order by date_trunc('milliseconds', d.deprecated_at) desc, d.tool_id asc",
            nativeQuery = true)
    List<ToolDeprecation> firstPageByOwner(@Param("owner") String owner, Pageable page);

    /**
     * M10 v617 - the list AFTER a cursor that names its whole sort key, so a tie on the instant cannot be
     * renumbered by a position. The first page is {@link #firstPage(Pageable)}; this statement is only ever
     * asked with a real pair, which is why it does not need a null-cursor branch.
     */
    @Query(value = "select * from tool_deprecation d where"
            + " date_trunc('milliseconds', d.deprecated_at) < :at"
            + " or (date_trunc('milliseconds', d.deprecated_at) = :at and d.tool_id > :id)"
            + " order by date_trunc('milliseconds', d.deprecated_at) desc, d.tool_id asc",
            nativeQuery = true)
    List<ToolDeprecation> pageAfter(
            @Param("at") Instant at, @Param("id") String id, Pageable page);

    /** The same cursor page inside one owner's deprecations, so the filter and the pair agree. */
    @Query(value = "select d.* from tool_deprecation d"
            + " join tool_entry e on e.tool_id = d.tool_id"
            + " where e.owner_account_id = :owner and"
            + " (date_trunc('milliseconds', d.deprecated_at) < :at"
            + " or (date_trunc('milliseconds', d.deprecated_at) = :at and d.tool_id > :id))"
            + " order by date_trunc('milliseconds', d.deprecated_at) desc, d.tool_id asc",
            nativeQuery = true)
    List<ToolDeprecation> pageAfterByOwner(
            @Param("owner") String owner, @Param("at") Instant at,
            @Param("id") String id, Pageable page);

    /** The WHOLE number of deprecations one account's declarations carry. */
    @Query(value = "select count(*) from tool_deprecation d"
            + " join tool_entry e on e.tool_id = d.tool_id"
            + " where e.owner_account_id = :owner",
            nativeQuery = true)
    long countByOwner(@Param("owner") String owner);

    /** Remove a declaration's deprecation with the declaration itself. */
    void deleteByToolId(String toolId);
}
