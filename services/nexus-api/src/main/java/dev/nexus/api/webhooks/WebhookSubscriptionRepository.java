package dev.nexus.api.webhooks;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M10 v557 — the webhook table's doors.
 *
 * <p>Every query is a derived one, so the SQL is Spring Data's and the meaning is the method name's. The
 * endpoint lookup exists for the ONE rule the unique constraint also states: a subscriber may not register
 * the same URL twice, and the refusal should name the row rather than surface as a database error.
 */
public interface WebhookSubscriptionRepository extends JpaRepository<WebhookSubscription, String> {

    /** The subscriber's subscriptions, oldest first — the order they were made in. */
    List<WebhookSubscription> findBySubscriberAccountIdOrderByCreatedAtAsc(
            String subscriberAccountId, Pageable page);

    /** The subscriber's WHOLE number of subscriptions, over the table and not over a window. */
    long countBySubscriberAccountId(String subscriberAccountId);

    /** One endpoint of one subscriber, when it is already registered. */
    Optional<WebhookSubscription> findBySubscriberAccountIdAndEndpointUrl(
            String subscriberAccountId, String endpointUrl);
}
