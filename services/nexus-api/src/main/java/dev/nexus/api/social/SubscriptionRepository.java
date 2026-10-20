package dev.nexus.api.social;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
