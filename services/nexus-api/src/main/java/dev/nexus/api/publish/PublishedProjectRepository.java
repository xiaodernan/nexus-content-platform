package dev.nexus.api.publish;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
