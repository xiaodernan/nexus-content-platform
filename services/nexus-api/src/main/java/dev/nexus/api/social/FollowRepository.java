package dev.nexus.api.social;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M7 v287 — the repository for FOLLOWS.
 *
 * <p>The two directions are DIFFERENT finders, because the two ends of the edge are different things:
 * "who follows me" and "who do I follow" are not the same question, and a repository that answered both
 * with one finder would have to guess which end the caller meant.
 */
public interface FollowRepository extends JpaRepository<FollowEntry, Long> {

    /** THE edge between two accounts \u2014 the row a second follow would collide with. */
    Optional<FollowEntry> findByFollowerAccountIdAndFolloweeAccountId(String followerAccountId, String followeeAccountId);

    /** How many accounts follow this one. */
    long countByFolloweeAccountId(String followeeAccountId);

    /** How many accounts this one follows. */
    long countByFollowerAccountId(String followerAccountId);

    /** The accounts that follow this one, newest first, capped by the caller's `Pageable`. */
    List<FollowEntry> findByFolloweeAccountIdOrderByCreatedAtDesc(String followeeAccountId, Pageable pageable);

    /** The accounts this one follows, newest first, capped by the caller's `Pageable`. */
    List<FollowEntry> findByFollowerAccountIdOrderByCreatedAtDesc(String followerAccountId, Pageable pageable);
}
