package dev.nexus.api.publish;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * The repository for the one aggregate this service owns.
 *
 * <p>v195 adds the FIRST finder beyond the inherited ones — a newest-first listing. It is added here rather
 * than filtered in the service because the cap has to reach the database: reading every publication and
 * trimming in memory would work until the table is large, and then it would be a table scan on every page
 * load. The `Pageable` carries the limit the service chose.
 *
 * <p>Deliberately no `findByTitle` / `findByProjectIdContaining` and no count-of-everything: a search is a
 * different feature with different rules (ranking, paging, what it does with a blank query), and adding one
 * here would put an unproven surface in the service — the same reason v193 added no finder at all.
 */
public interface PublishedProjectRepository extends JpaRepository<PublishedProject, String> {

    /** Newest first, capped by the caller's `Pageable`. */
    List<PublishedProject> findAllByOrderByPublishedAtDesc(Pageable pageable);

    /**
     * v270 — the SAME listing, narrowed to one OWNER.
     *
     * <p>This is the service half of a PROFILE: "what has this account published". It is a finder here for
     * the same reason the newest-first one is — the cap has to reach the database, and a profile that read
     * every publication and filtered in memory would be a table scan on every page load.
     *
     * <p>It matches the OWNER COLUMN, not the handle: the handle is a name the account chose and the owner
     * is the identity the claim carries, and the service is careful about which of the two it treats as the
     * key. A row with no owner is NOT this account's, which is why there is no "or owner is null" arm here.
     */
    List<PublishedProject> findByOwnerAccountIdOrderByPublishedAtDesc(String ownerAccountId, Pageable pageable);

    /**
     * v290 — the SEARCH finder: the publications whose TITLE or DOCUMENT mentions a word.
     *
     * <p>The query is written as a JPQL expression rather than a derived method name because the two
     * fields and the case-insensitive comparison do not fit the derived-name grammar.
     *
     * <p><b>v302 — the ORDER is the RELEVANCE order, and it lives in the query.</b> A publication whose TITLE
     * mentions the term comes before one that only mentions it inside its DOCUMENT — because a title is
     * what a person names their work, and a word in a title is a stronger signal than the same word
     * somewhere in the nodes. Within each class the order is newest-first, like the listing the search is
     * a filter of. The order is in the query rather than in the window on purpose: a `Pageable`'s own sort
     * would be APPENDED to the query's `ORDER BY`, and the two would fight — so the search's window carries
     * NO sort of its own.
     *
     * <p><b>The cost, stated rather than hidden:</b> a `LIKE` over a text column cannot use an index, so
     * this is a SEQUENTIAL SCAN. At this table's size that is the price of searching what is actually IN
     * the work; a table big enough for that to matter wants an index (or a full-text one), and the service
     * does not pretend otherwise.
     */
    @Query("SELECT p FROM PublishedProject p WHERE LOWER(p.title) LIKE LOWER(CONCAT('%', :term, '%')) OR LOWER(p.documentJson) LIKE LOWER(CONCAT('%', :term, '%')) ORDER BY CASE WHEN LOWER(p.title) LIKE LOWER(CONCAT('%', :term, '%')) THEN 0 ELSE 1 END, p.publishedAt DESC")
    List<PublishedProject> findByTextContaining(@Param("term") String term, Pageable pageable);

    /**
     * v290 — the SAME search, narrowed to ONE owner.
     *
     * <p>It matches the OWNER COLUMN, not the handle, for the same reason the profile's listing does: the
     * handle is a name the account chose and the owner is the identity the claim carries.
     */
    @Query("SELECT p FROM PublishedProject p WHERE p.ownerAccountId = :owner AND (LOWER(p.title) LIKE LOWER(CONCAT('%', :term, '%')) OR LOWER(p.documentJson) LIKE LOWER(CONCAT('%', :term, '%'))) ORDER BY CASE WHEN LOWER(p.title) LIKE LOWER(CONCAT('%', :term, '%')) THEN 0 ELSE 1 END, p.publishedAt DESC")
    List<PublishedProject> findByOwnerAndTextContaining(
            @Param("owner") String ownerAccountId,
            @Param("term") String term,
            Pageable pageable);
}

