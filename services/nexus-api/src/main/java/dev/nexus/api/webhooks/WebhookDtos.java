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

    /**
     * What one delivery did — the answer the ping door gives, and one entry of the list a fan-out reports.
     *
     * <p>{@code delivered} is the summary of {@code outcome} rather than a second opinion: a 2xx is the only
     * thing it is true of, and {@code outcome} names WHY when it is false ({@code refused} with a
     * {@code status}, or {@code unreachable} with the exception's name in {@code detail}).
     *
     * <p>v559 named it for the DELIVERY rather than for the ping, because a fan-out answers with one of these
     * per subscription and the shape is the same fact either way: what happened when this service called this
     * endpoint. The id and URL are carried so an answer stands alone in a list — a caller reading twenty
     * answers can tell which endpoint each belongs to without counting positions.
     */
    public record DeliveryAnswer(
            String webhookId,
            String url,
            boolean delivered,
            String outcome,
            Integer status,
            String detail,
            long at) {
    }
}
