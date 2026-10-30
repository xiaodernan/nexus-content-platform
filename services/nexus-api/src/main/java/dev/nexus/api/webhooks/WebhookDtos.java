package dev.nexus.api.webhooks;

import java.util.List;

/**
 * M10 v557 — the wire shapes for webhook subscriptions.
 *
 * <p><b>The secret has exactly one door.</b> {@link WebhookSecret} carries it and is answered ONCE, by the
 * subscription that just made it; {@link Webhook} — every other answer — has no secret field at all.
 * A redacted secret would still be a field a client could fill in from its own logs; an ABSENT field cannot
 * be mistaken for one.
 */
public final class WebhookDtos {

    private WebhookDtos() {
    }

    /** The body a subscriber sends to register an endpoint. */
    public record SubscribeRequest(String subscriberId, String url, List<String> events) {
    }

    /** A subscription as a READ door answers it: id, endpoint, events, and when it was made. No secret. */
    public record Webhook(String id, String url, List<String> events, long createdAt) {
    }

    /**
     * The answer to a subscription — the same row, and the secret it was signed with.
     *
     * <p>{@code note} states the rule in the answer itself rather than only in the documentation: a caller
     * that keeps the secret has it, and a caller that loses it must make a new subscription.
     */
    public record WebhookSecret(
            String id, String url, List<String> events, long createdAt, String secret, String note) {
    }

    /** One subscriber's subscriptions, and the WHOLE table's count for that subscriber. */
    public record WebhookList(String subscriberId, List<Webhook> webhooks, long total, int limit, int offset) {
    }
}
