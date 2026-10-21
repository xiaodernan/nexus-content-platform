package dev.nexus.api.social;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/**
 * M7 v300 — the repository for SUBSCRIPTIONS.
 *
 * <p>Every windowed finder carries a {@link Pageable}, so the cap reaches the DATABASE.
 */
public interface SubscriptionRepository extends JpaRepository<SubscriptionEntry, String> {

    /** ONE subscription by its own id — the row a cancellation names. */
    Optional<SubscriptionEntry> findBySubscriptionId(String subscriptionId);

    /** The subscription this subscriber holds for this plan — the row a second subscription would collide with. */
    Optional<SubscriptionEntry> findBySubscriberAccountIdAndPlanId(String subscriberAccountId, String planId);

    /** The subscriptions one account HOLDS, newest first, capped by the caller's `Pageable`. */
    List<SubscriptionEntry> findBySubscriberAccountIdOrderBySubscribedAtDesc(String subscriberAccountId, Pageable pageable);

    /** The subscriptions one creator RECEIVED, newest first, capped by the caller's `Pageable`. */
    List<SubscriptionEntry> findByCreatorAccountIdOrderBySubscribedAtDesc(String creatorAccountId, Pageable pageable);

    /** How many subscriptions one creator has standing. */
    long countByCreatorAccountIdAndActive(String creatorAccountId, boolean active);

    /**
     * v359 — how many subscriptions one account HOLDS, over the WHOLE table.
     *
     * <p>The like, follow and tip doors count over the whole table; the subscription door was answering
     * with the number of rows it had read — the WINDOW’s size — and the page dressed it as a total.
     */
    long countBySubscriberAccountId(String subscriberAccountId);

    /**
     * v359 — how many subscriptions one account RECEIVED, over the WHOLE table.
     */
    long countByCreatorAccountId(String creatorAccountId);

    /**
     * v359 — how much one account HOLDS, summed over the WHOLE table, counting only the subscriptions
     * that are STANDING.
     *
     * <p>The standing is the service’s word (v308: a row that is not cancelled and whose period has not
     * run out), and the clock is the service’s — so the instant travels as a parameter and the
     * database does the same arithmetic the service would have done.
     */
    @Query("SELECT COALESCE(SUM(s.priceCents), 0) FROM SubscriptionEntry s "
            + "WHERE s.subscriberAccountId = :subscriber AND s.active = true "
            + "AND (s.expiresAt IS NULL OR s.expiresAt > :now)")
    long sumStandingPriceCentsBySubscriberAccountId(
            @org.springframework.data.repository.query.Param("subscriber") String subscriberAccountId,
            @org.springframework.data.repository.query.Param("now") java.time.Instant now);

    /**
     * v359 — how much one account RECEIVED, summed over the whole table, standing rows only.
     */
    @Query("SELECT COALESCE(SUM(s.priceCents), 0) FROM SubscriptionEntry s "
            + "WHERE s.creatorAccountId = :creator AND s.active = true "
            + "AND (s.expiresAt IS NULL OR s.expiresAt > :now)")
    long sumStandingPriceCentsByCreatorAccountId(
            @org.springframework.data.repository.query.Param("creator") String creatorAccountId,
            @org.springframework.data.repository.query.Param("now") java.time.Instant now);
}
