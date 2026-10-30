package dev.nexus.api.webhooks;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * M10 v560 — the delivery log's doors.
 *
 * <p>Every query is scoped by the SUBSCRIBER, because that is the only ownership this build has (the id is
 * host-declared, ADR 0018): asking for somebody else's log is asking a question this service has no way to
 * refuse for the right reason, and answering it is what the door must not do. The optional narrowing is a
 * webhook id — the row carries its own copy, so a removed subscription's receipts stay readable by their owner
 * rather than disappearing with the instruction that produced them.
 *
 * <p>Both windows are ordered NEWEST FIRST with the id as the second key: two attempts can share a
 * microsecond, and a pager whose order is not total silently repeats or skips a row at the seam between pages.
 */
public interface WebhookDeliveryRepository extends JpaRepository<WebhookDelivery, String> {

    /** The subscriber's receipt window, newest first, the id breaking an instant tie. */
    List<WebhookDelivery> findBySubscriberAccountIdOrderByAttemptedAtDescDeliveryIdDesc(
            String subscriberAccountId, Pageable page);

    /** The same window, narrowed to ONE subscription's attempts. */
    List<WebhookDelivery> findBySubscriberAccountIdAndWebhookIdOrderByAttemptedAtDescDeliveryIdDesc(
            String subscriberAccountId, String webhookId, Pageable page);

    /** The subscriber's WHOLE number of receipts, over the table and not over a window. */
    long countBySubscriberAccountId(String subscriberAccountId);

    /** The same count, narrowed to one subscription. */
    long countBySubscriberAccountIdAndWebhookId(String subscriberAccountId, String webhookId);
}
