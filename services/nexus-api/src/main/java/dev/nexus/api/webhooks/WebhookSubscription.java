package dev.nexus.api.webhooks;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;

/**
 * M10 v557 — ONE webhook subscription: an endpoint this service will call, and the events it asked for.
 *
 * <p>The row is an INSTRUCTION, not a delivery record: v559's fan-out POSTs each recorded event to the rows
 * that asked for its verb, and nothing anywhere stores whether that POST arrived — a subscription says what
 * this service should do, never that it did it.
 *
 * <p>Two facts are stored as text and read back as lists/instants — the EVENTS (comma-joined, always written
 * in the vocabulary's own order, so two subscriptions to the same events compare equal byte for byte) and the
 * CREATED instant. The secret is stored beside the endpoint because signing needs it; no read door ever
 * returns it (see {@link WebhookDtos}).
 *
 * <p>The UNIQUE constraint on (subscriber, endpoint) makes "one subscription per endpoint" the database's
 * rule: a second row for the same URL would deliver every event twice, and a payload duplicated is not a
 * payload.
 */
@Entity
@Table(
        name = "webhook_subscription",
        uniqueConstraints = @UniqueConstraint(
                name = "webhook_subscription_subscriber_endpoint",
                columnNames = {"subscriber_account_id", "endpoint_url"}))
public class WebhookSubscription {

    /** The subscription's own id. */
    @Id
    @Column(name = "webhook_id", nullable = false, length = 64)
    private String webhookId;

    /** The account that owns this instruction — opaque to the service, host-declared like every other id. */
    @Column(name = "subscriber_account_id", nullable = false, length = 200)
    private String subscriberAccountId;

    /** The absolute endpoint this service would call. Validated on the way in (see the service). */
    @Column(name = "endpoint_url", nullable = false, length = 1000)
    private String endpointUrl;

    /** The events, comma-joined, in the vocabulary's order. Never empty: a subscription to nothing is noise. */
    @Column(name = "events", nullable = false, length = 400)
    private String events;

    /**
     * The HMAC key the signature is computed with. Shown ONCE, at subscription time, and never again:
     * a secret a read door echoes is a secret the caller's logs may hold.
     */
    @Column(name = "secret", nullable = false, length = 64)
    private String secret;

    /** When the subscription was made — the service's own instant, never the caller's. */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected WebhookSubscription() {
        // JPA needs it; the service never builds one without values.
    }

    public WebhookSubscription(
            String webhookId,
            String subscriberAccountId,
            String endpointUrl,
            String events,
            String secret,
            Instant createdAt) {
        this.webhookId = webhookId;
        this.subscriberAccountId = subscriberAccountId;
        this.endpointUrl = endpointUrl;
        this.events = events;
        this.secret = secret;
        this.createdAt = createdAt;
    }

    public String getWebhookId() {
        return webhookId;
    }

    public String getSubscriberAccountId() {
        return subscriberAccountId;
    }

    public String getEndpointUrl() {
        return endpointUrl;
    }

    /** The stored text as the list it names. An empty stored value would answer an empty list, never null. */
    public List<String> eventList() {
        return events == null || events.isBlank() ? List.of() : Arrays.asList(events.split(","));
    }

    public String getSecret() {
        return secret;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
